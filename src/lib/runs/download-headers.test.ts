import { describe, expect, it } from "vitest";
import { downloadHeaders, inlineSvgHeaders } from "./download-headers";

describe("downloadHeaders", () => {
  it("serves the file as an attachment under its own name", () => {
    const h = downloadHeaders("output.csv", "text/csv");
    expect(h["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(h["Content-Disposition"]).toBe("attachment; filename=\"output.csv\"; filename*=UTF-8''output.csv");
  });

  it("keeps a percent sign in filename*, so 100%.csv downloads under its real name", () => {
    expect(downloadHeaders("100%.csv", "text/csv")["Content-Disposition"]).toContain("filename*=UTF-8''100%25.csv");
  });

  it("strips the quotes from the ascii fallback: a quote in the name would end the header value early", () => {
    const h = downloadHeaders('a"b.csv', "text/csv");
    expect(h["Content-Disposition"]).toBe("attachment; filename=\"ab.csv\"; filename*=UTF-8''a%22b.csv");
  });

  it("holds a non-Latin-1 name only in filename*, because a header value with those bytes throws", () => {
    const h = downloadHeaders("отчёт.md", "text/markdown");
    expect(h["Content-Disposition"]).toMatch(/^[\x20-\x7e]*$/); // pure ascii: safe to put in a Response header
    expect(h["Content-Disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent("отчёт.md")}`);
    expect(h["Content-Disposition"]).toContain('filename="_____.md"'); // one underscore per dropped character
  });

  it("tells the browser not to sniff the type: a .txt must never be run as something else", () => {
    expect(downloadHeaders("notes.txt", "text/plain")["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("inlineSvgHeaders", () => {
  it("serves the chart as an image to show in the page, not as a download", () => {
    const h = inlineSvgHeaders("chart.svg");
    expect(h["Content-Type"]).toBe("image/svg+xml");
    expect(h["Content-Disposition"]).toBe("inline; filename=\"chart.svg\"; filename*=UTF-8''chart.svg"); // saving it keeps the name
  });

  it("forbids scripts and outside loads, so even an SVG opened on its own cannot run anything", () => {
    const h = inlineSvgHeaders("chart.svg");
    expect(h["Content-Security-Policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
});
