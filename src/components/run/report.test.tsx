import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Report } from "./report";

// UX QA U2: the agent's three-line haiku was shown as one line
describe("Report", () => {
  it("draws a single line break of the report as a line break", () => {
    const html = renderToStaticMarkup(<Report text={"Here is the haiku:\n\nMonday morning hush\nempty chairs, cold coffee steam\nsunlight on the keys"} />);
    expect(html).toContain("Monday morning hush</span><br/><span>empty chairs, cold coffee steam</span><br/><span>sunlight on the keys");
  });
});
