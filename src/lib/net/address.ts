import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Which addresses our server must never reach on someone else's say-so. A connection's MCP server, an OAuth
 * sign-in's metadata and token endpoints, and the agent's WebFetch all take their address from a user, a remote
 * server or a page, and each would otherwise be a way into our own network or the cloud's metadata service. An
 * address is judged by what it is (node:net parses it, a BlockList matches its range), never by how it is spelled,
 * and a name by every address it resolves to.
 */

// IPv4 ranges that are not the public internet (IANA's special-purpose registry).
const V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network", with the unspecified 0.0.0.0, which reaches the local host
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT; cloud metadata lives here too (Alibaba's 100.100.100.200)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, with the cloud metadata address 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // the retired 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and the broadcast 255.255.255.255
];

// IPv6 ranges that are not the public internet. The forms that carry an IPv4 address (mapped, NAT64, 6to4) are
// not listed: the address inside is checked instead (embeddedV4), so a public one there stays reachable.
const V6: [string, number][] = [
  ["::", 96], // unspecified (::), loopback (::1) and the retired IPv4-compatible form (::7f00:1)
  ["::ffff:0:0:0", 96], // IPv4-translated: never a real server
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo: a tunnel whose far end cannot be checked
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (retired)
  ["ff00::", 8], // multicast
];

const INTERNAL = new BlockList();
for (const [net, prefix] of V4) INTERNAL.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of V6) INTERNAL.addSubnet(net, prefix, "ipv6");

// Names that never name a public server: localhost (RFC 6761), .internal (reserved for private use; Google Cloud's
// metadata.google.internal), .local (mDNS) and .home.arpa (home networks).
const LOCAL_NAME = /(^|\.)(localhost|internal|local|home\.arpa)$/;

/** "[::1]" -> "::1", "Example.com." -> "example.com": the host as the checks read it. */
const bare = (host: string) => host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

/** The eight 16-bit groups of an IPv6 address. The URL parser writes it in one canonical form first (a dotted tail in hex, zeros compressed once), which leaves only "::" to expand. */
function groups(ip: string): number[] | null {
  let canonical: string;
  try {
    canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [head, tail] = canonical.split("::");
  const part = (s: string | undefined) => (s ? s.split(":").map((g) => parseInt(g, 16)) : []);
  if (tail === undefined) return part(head);
  const [h, t] = [part(head), part(tail)];
  return [...h, ...new Array<number>(8 - h.length - t.length).fill(0), ...t];
}

const dotted = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** The IPv4 address an IPv6 one carries: IPv4-mapped (::ffff:0:0/96), NAT64 (64:ff9b::/96) or 6to4 (2002::/16). */
function embeddedV4(ip: string): string | null {
  const g = groups(ip);
  if (!g) return null;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 5) && g[5] === 0xffff) return dotted(g[6], g[7]);
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return dotted(g[6], g[7]);
  if (g[0] === 0x2002) return dotted(g[1], g[2]);
  return null;
}

/** True for an IP address, v4 or v6, bare or in brackets, that is not on the public internet. False for a name. */
export function isInternalAddress(address: string): boolean {
  const ip = bare(address).replace(/%.*$/, ""); // a zone id ("fe80::1%lo0") names an interface, not another address
  const family = isIP(ip);
  if (family === 4) return INTERNAL.check(ip, "ipv4");
  if (family !== 6) return false;
  if (INTERNAL.check(ip, "ipv6")) return true;
  const inside = embeddedV4(ip);
  return inside !== null && INTERNAL.check(inside, "ipv4");
}

/**
 * The check that needs no network: a literal internal address, or a name that is local by definition. Sync, so a
 * schema can run it on a typed address; a name that resolves inside is hostReach's to catch.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = bare(hostname);
  return isIP(host.replace(/%.*$/, "")) ? isInternalAddress(host) : LOCAL_NAME.test(host);
}

/** Where a host leads: public, internal (with the address that is), or unknown (it did not resolve in time). */
export type HostVerdict = { reach: "public" } | { reach: "internal"; address: string } | { reach: "unknown" };
export type LookupAll = (hostname: string) => Promise<string[]>;
export type Reach = (hostname: string) => Promise<HostVerdict>;

const LOOKUP_TIMEOUT_MS = 3000; // a save, a run start or a fetch waits on it: a slow answer is no answer

const lookupAll: LookupAll = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the lookup took longer than ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Resolves a host (dns.lookup, every address) and calls it internal if ANY address is: a name with one public and
 * one private address must not be trusted to pick the public one. A name that does not resolve, or not in time, is
 * "unknown", never public: only what was seen to be public passes. This narrows DNS rebinding but cannot close it
 * (the fetch looks the name up again), which is why every use of an address checks it again at that moment.
 */
export async function hostReach(hostname: string, lookupFn: LookupAll = lookupAll, timeoutMs = LOOKUP_TIMEOUT_MS): Promise<HostVerdict> {
  const host = bare(hostname);
  if (isPrivateHost(host)) return { reach: "internal", address: host };
  if (isIP(host)) return { reach: "public" };
  let addresses: string[];
  try {
    addresses = await within(lookupFn(host), timeoutMs);
  } catch {
    return { reach: "unknown" };
  }
  if (addresses.length === 0) return { reach: "unknown" };
  const inside = addresses.find(isInternalAddress);
  return inside ? { reach: "internal", address: inside } : { reach: "public" };
}
