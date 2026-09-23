import { afterEach, describe, expect, it, vi } from "vitest";
import { hostReach, isInternalAddress, isPrivateHost, type LookupAll } from "./address";

// Security QA: the old rule read the spelling of a host, so [::], [::7f00:1], 100.100.100.200 (a cloud metadata
// address in carrier-grade NAT space), NAT64 and IPv4-mapped forms, and names that resolve inside, all passed.
// A host is internal if it is, or leads to, an address our server must never reach on a user's behalf.

describe("isPrivateHost: the literal addresses and names that are internal by definition", () => {
  it.each([
    // IPv4: unspecified, "this network", loopback, private, link-local (cloud metadata), carrier-grade NAT
    ["0.0.0.0", "unspecified"],
    ["0.1.2.3", "this network"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["10.0.0.1", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "link-local: the cloud metadata address"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["100.100.100.200", "carrier-grade NAT: Alibaba Cloud's metadata address"],
    ["100.127.255.255", "carrier-grade NAT"],
    // IPv4: benchmarking, protocol assignments, documentation, multicast, reserved and broadcast
    ["198.18.0.1", "benchmarking"],
    ["198.19.255.255", "benchmarking"],
    ["192.0.0.8", "IETF protocol assignments"],
    ["192.0.2.1", "documentation"],
    ["198.51.100.7", "documentation"],
    ["203.0.113.9", "documentation"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.250", "multicast"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "broadcast"],
    // IPv6 as a URL spells it (in brackets) and bare
    ["[::]", "unspecified"],
    ["::", "unspecified, bare"],
    ["[::1]", "loopback"],
    ["[::7f00:1]", "IPv4-compatible 127.0.0.1"],
    ["[::ffff:127.0.0.1]", "IPv4-mapped loopback, dotted"],
    ["[::ffff:7f00:1]", "IPv4-mapped loopback, as a URL writes it"],
    ["[::ffff:a9fe:a9fe]", "IPv4-mapped metadata address"],
    ["[::ffff:0:a00:1]", "IPv4-translated 10.0.0.1"],
    ["[64:ff9b::a9fe:a9fe]", "NAT64 of the metadata address"],
    ["[64:ff9b::10.0.0.1]", "NAT64 of a private address, dotted"],
    ["[64:ff9b:1::1]", "local-use NAT64"],
    ["[2002:a9fe:a9fe::1]", "6to4 of the metadata address"],
    ["[2002:7f00:1::]", "6to4 of loopback"],
    ["[2001::1]", "Teredo"],
    ["[fc00::1]", "unique local"],
    ["[fd12:3456::1]", "unique local"],
    ["[fe80::1]", "link-local"],
    ["[febf::1]", "link-local, end of the range"],
    ["[fec0::1]", "site-local (deprecated)"],
    ["[ff02::1]", "multicast"],
    ["[2001:db8::1]", "documentation"],
    ["[100::1]", "discard-only"],
    // names that never name a public server
    ["localhost", "localhost"],
    ["LOCALHOST", "whatever the case"],
    ["localhost.", "with the root dot"],
    ["app.localhost", "*.localhost"],
    ["metadata.google.internal", "Google Cloud's metadata name"],
    ["db.internal", "*.internal"],
    ["printer.local", "mDNS *.local"],
    ["router.home.arpa", "*.home.arpa"],
  ])("%s is internal (%s)", (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it.each([
    ["8.8.8.8", "a public resolver"],
    ["1.1.1.1", "a public resolver"],
    ["172.32.0.1", "just past 172.16/12"],
    ["100.63.255.255", "just before 100.64/10"],
    ["100.128.0.0", "just past 100.64/10"],
    ["198.20.0.1", "just past 198.18/15"],
    ["192.169.0.1", "just past 192.168/16"],
    ["223.255.255.255", "just before multicast"],
    ["[2606:4700:4700::1111]", "a public IPv6 resolver"],
    ["[2a00:1450:4001::200e]", "a public IPv6 host"],
    ["[::ffff:8.8.8.8]", "IPv4-mapped public address"],
    ["[64:ff9b::808:808]", "NAT64 of a public address"],
    ["[2002:808:808::1]", "6to4 of a public address"],
    ["mcp.deepwiki.com", "a public name"],
    ["example.org", "a public name"],
    ["localhost.example.com", "a public name that only contains localhost"],
    ["internal.example.com", "a public name that only starts with internal"],
  ])("%s is public (%s)", (host) => {
    expect(isPrivateHost(host)).toBe(false);
  });
});

describe("isInternalAddress", () => {
  it("reads a zone id as the link-local address it is on", () => {
    expect(isInternalAddress("fe80::1%lo0")).toBe(true);
  });

  it("is false for anything that is not an IP address, which isPrivateHost and the lookup handle", () => {
    expect(isInternalAddress("example.com")).toBe(false);
    expect(isInternalAddress("")).toBe(false);
  });
});

describe("hostReach: where a name really leads", () => {
  afterEach(() => vi.useRealTimers());
  const resolvesTo =
    (...addresses: string[]): LookupAll =>
    async () =>
      addresses;

  it("calls a public-looking name internal when any one of its addresses is", async () => {
    expect(await hostReach("rebind.example.com", resolvesTo("93.184.216.34", "127.0.0.1"))).toEqual({ reach: "internal", address: "127.0.0.1" });
    expect(await hostReach("v6.example.com", resolvesTo("2606:4700::6810:84e5", "::ffff:a9fe:a9fe"))).toEqual({ reach: "internal", address: "::ffff:a9fe:a9fe" });
  });

  it("calls a name public when every address it has is public", async () => {
    expect(await hostReach("mcp.deepwiki.com", resolvesTo("104.21.1.1", "2606:4700:3036::6815:101"))).toEqual({ reach: "public" });
  });

  it("answers a literal address or a local name without asking DNS", async () => {
    const lookup = vi.fn<LookupAll>(async () => ["8.8.8.8"]);
    expect(await hostReach("[::1]", lookup)).toEqual({ reach: "internal", address: "::1" });
    expect(await hostReach("100.100.100.200", lookup)).toEqual({ reach: "internal", address: "100.100.100.200" });
    expect(await hostReach("app.localhost", lookup)).toEqual({ reach: "internal", address: "app.localhost" });
    expect(await hostReach("8.8.8.8", lookup)).toEqual({ reach: "public" });
    expect(lookup).not.toHaveBeenCalled();
  });

  // Fail closed: only what was seen to be public passes. A name that answers "no such host" the first time and an
  // internal address the next would otherwise slip through.
  it("does not call a name public when it does not resolve, or resolves to nothing", async () => {
    const fails: LookupAll = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND nowhere.example"), { code: "ENOTFOUND" });
    };
    expect(await hostReach("nowhere.example", fails)).toEqual({ reach: "unknown" });
    expect(await hostReach("empty.example", resolvesTo())).toEqual({ reach: "unknown" });
  });

  it("gives up on a lookup that hangs, rather than holding a run or a save, and does not call it public", async () => {
    vi.useFakeTimers();
    const hangs: LookupAll = () => new Promise(() => {});
    const pending = hostReach("slow.example.com", hangs, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual({ reach: "unknown" });
  });
});
