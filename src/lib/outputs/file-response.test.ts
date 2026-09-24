import { describe, expect, it } from "vitest";
import type { FileMeta } from "@/contracts/run";
import { fileResponse } from "./file-response";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const svg = { meta: { name: "chart.svg", mime: "image/svg+xml", bytes: 11, encoding: "utf8" } as FileMeta, content: "<svg></svg>" };
const csv = { meta: { name: "output.csv", mime: "text/csv", bytes: 4, encoding: "utf8" } as FileMeta, content: "a,b\n" };
const leaked = {
  meta: {
    name: "notes.txt",
    mime: "text/plain",
    bytes: 20,
    quarantined: true,
    flags: [{ kind: "credential", count: 1, detail: "an API key on line 4" }],
  } as FileMeta,
  content: "sk-live-secret-value",
};
const q = (s = "") => new URLSearchParams(s);

describe("fileResponse", () => {
  it("holds back a quarantined file with 409 and a plain sentence saying why, without the content", async () => {
    const res = fileResponse(leaked, q());
    expect(res.status).toBe(409);
    const body = await res.text();
    expect(body).toContain("an API key on line 4");
    expect(body).not.toContain("sk-live");
    expect(res.headers.get("Content-Disposition")).toBeNull(); // nothing is downloaded
  });

  it("downloads a quarantined file once the person confirms with ?confirm=1", async () => {
    const res = fileResponse(leaked, q("confirm=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(await res.text()).toBe("sk-live-secret-value");
  });

  it("serves an .svg inline for an <img> preview when asked with ?inline=1", async () => {
    const res = fileResponse(svg, q("inline=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'");
    expect(await res.text()).toBe("<svg></svg>");
  });

  it("keeps an .svg an attachment without ?inline=1", () => {
    expect(fileResponse(svg, q()).headers.get("Content-Disposition")).toMatch(/^attachment;/);
  });

  it("never serves a non-SVG file inline, whatever the query says", () => {
    const res = fileResponse(csv, q("inline=1"));
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("does not let ?inline=1 skip the quarantine", () => {
    const quarantinedSvg = { ...svg, meta: { ...svg.meta, quarantined: true, flags: [] } };
    expect(fileResponse(quarantinedSvg, q("inline=1")).status).toBe(409);
  });

  it("serves a base64-stored spreadsheet as its original bytes", async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    const file = { meta: { name: "data.xlsx", mime: XLSX, bytes: 6, encoding: "base64" } as FileMeta, content: bytes.toString("base64") };
    const res = fileResponse(file, q());
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(res.headers.get("Content-Type")).toBe(XLSX); // bytes, so no charset (Q125)
    expect(res.headers.get("Content-Disposition")).toBe("attachment; filename=\"data.xlsx\"; filename*=UTF-8''data.xlsx");
  });
});
