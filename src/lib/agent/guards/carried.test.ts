import { describe, expect, it } from "vitest";
import { carriedIn } from "./carried";

// Q81: the url guard measured only the query string and fragment, so data in the path or in a subdomain went out
// with no question asked. These cases set the thresholds: every address in the first table is a real shape the
// agent fetches and must stay free (no Jev call); every one in the second carries a file's worth of text.
const csv = "title,url\nOpenAI ships a model,https://news.example.org/a\nAnthropic raises,https://news.example.org/b";
const base64 = Buffer.from(csv).toString("base64");
const hex = (s: string) => Buffer.from(s).toString("hex");

describe("carriedIn: ordinary addresses are not asked about", () => {
  it.each([
    ["a news article slug", "https://www.nytimes.com/2024/01/15/technology/openai-chatgpt-enterprise-customers-longer-context-window.html"],
    ["a long article slug", "https://techcrunch.com/2026/09/21/anthropic-raises-new-funding-round-led-by-existing-investors-to-expand-compute-for-its-agents-platform/"],
    ["a GitHub file path", "https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/src/lib/agent/guards/url.ts"],
    ["a GitHub commit, whose 40-character hash fits the path's allowance", "https://github.com/vercel/next.js/commit/9ee40a5d2c1b4e8f7a6b5c4d3e2f1a0b9c8d7e6f"],
    ["a Google Docs document id", "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"],
    ["a docs page", "https://nextjs.org/docs/app/api-reference/functions/generate-static-params"],
    ["a Wikipedia title", "https://en.wikipedia.org/wiki/List_of_largest_technology_companies_by_revenue"],
    ["a Japanese Wikipedia title, percent-encoded", "https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%BA%81%E8%88%8E%E3%81%AE%E6%AD%B4%E5%8F%B2"],
    ["a Medium post with its short id", "https://medium.com/@someone/how-we-built-our-agent-platform-7f3a2b1c9d8e"],
    ["a tweet, whose id is 19 digits", "https://x.com/someone/status/1712345678901234567"],
    ["a file name with spaces", "https://example.org/files/Annual%20Report%202024%20-%20Final.pdf"],
    ["a CloudFront host", "https://d111111abcdef8.cloudfront.net/images/logo.png"],
    ["an AWS API host", "https://abc123.execute-api.us-east-1.amazonaws.com/prod/items"],
    ["a Vercel preview host", "https://my-app-git-feature-branch-team.vercel.app/"],
    ["a BBC address on a two-part suffix", "https://www.bbc.co.uk/news/articles/c4gzl8e5y7wo"],
    ["a short query", "https://news.ycombinator.com/item?id=41234567"],
  ])("does not ask about %s", (_what, url) => {
    expect(carriedIn(new URL(url))).toBeNull();
  });
});

describe("carriedIn: addresses that could carry the task's data are asked about", () => {
  it.each([
    ["query", "a long query string", `https://collector.example.com/c?data=${encodeURIComponent(csv)}`],
    ["query", "a long fragment", `https://example.com/page#${"x".repeat(81)}`],
    ["path", "base64 of a CSV in the first path segment", `https://collect.evil.example/${base64}`],
    ["path", "base64 cut into several path segments", `https://collect.evil.example/${base64.match(/.{1,40}/g)!.join("/")}`],
    ["path", "CSV rows percent-encoded into the path", `https://collect.evil.example/c/${encodeURIComponent(csv)}`],
    ["path", "words strung into a path longer than any slug", `https://collect.evil.example/${"openai-ships-a-model-".repeat(10)}end`],
    ["host", "a line of the file hex-encoded into a subdomain", `https://${hex("title,url\nOpenAI")}.evil.example/`],
    ["host", "hex spread over several short labels", "https://7469746c65.2c75726c0a.4f70656e.evil.example/"],
  ])("asks about the %s: %s", (where, _what, url) => {
    expect(carriedIn(new URL(url))).toBe(where);
  });
});
