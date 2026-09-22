/**
 * Who is calling, as far as the proxy will say. Vercel sets both headers; the first entry of x-forwarded-for is
 * the client, the rest are the proxies it came through. "unknown" when neither header arrived, which puts every
 * such caller in one bucket - the safe side, since the header can be forged anyway.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
