import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "static", "application.css"), "utf8");
const html = readFileSync(join(here, "..", "static", "index.html"), "utf8");

// Regression guard for the editor collapsing to two rows (multi-line pastes
// appeared to keep only the last line). The page renders in standards mode,
// where a percentage height resolves to auto because no ancestor of the
// textarea has a definite height. Upstream hastebin's `height: 100%` only
// worked because its index.html had no doctype (quirks mode); the textarea
// height must therefore be viewport-relative.

function extractRule(selector) {
  const match = css.match(new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`));
  expect(match, `expected a top-level "${selector}" rule in application.css`).not.toBeNull();
  return match[1];
}

describe("editor layout invariants", () => {
  it("index.html opts into standards mode", () => {
    expect(html.trimStart().toLowerCase().startsWith("<!doctype html>")).toBe(true);
  });

  it("textarea height is viewport-relative, not a percentage", () => {
    const rule = extractRule("textarea");
    const heights = [...rule.matchAll(/height\s*:\s*([^;]+);/g)].map((m) => m[1].trim());

    expect(heights.length).toBeGreaterThan(0);
    for (const value of heights) {
      expect(value).not.toMatch(/%/);
      expect(value).toMatch(/\d(d?vh)\b/);
    }
  });

  it("textarea height accounts for the body's vertical padding", () => {
    const padding = extractRule("body").match(/padding\s*:\s*([^;]+);/)[1].trim();
    const vertical = 2 * parseInt(padding, 10); // "20px 50px" — first value is top/bottom

    const rule = extractRule("textarea");
    for (const [, value] of rule.matchAll(/height\s*:\s*([^;]+);/g)) {
      expect(value).toContain(`- ${vertical}px`);
    }
  });
});
