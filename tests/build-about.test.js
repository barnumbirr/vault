import { describe, it, expect } from "vitest";
import { renderAbout } from "../scripts/render-about.mjs";

const SAMPLE = [
  "# Title",
  "",
  "A [link](https://example.com) and `inline code`.",
  "",
  "```bash",
  "echo hi",
  "```",
  "",
  "| A | B |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
].join("\n");

describe("renderAbout", () => {
  const html = renderAbout(SAMPLE);

  it("renders markdown headings", () => {
    expect(html).toContain("<h1>Title</h1>");
  });

  it("renders links and inline code", () => {
    expect(html).toContain('<a href="https://example.com">link</a>');
    expect(html).toContain("<code>inline code</code>");
  });

  it("renders fenced code blocks", () => {
    expect(html).toContain("<pre>");
    expect(html).toContain("echo hi");
  });

  it("renders GFM tables", () => {
    expect(html).toContain("<table>");
  });

  it("is a full document that links the external stylesheet", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<link rel="stylesheet" type="text/css" href="/about.css"');
  });

  it("uses no inline styles (CSP style-src 'self')", () => {
    expect(html).not.toContain("<style");
    expect(html).not.toMatch(/\sstyle=/);
  });

  it("links back to the app root", () => {
    expect(html).toContain('href="/"');
  });
});
