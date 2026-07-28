import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const headersFile = join(here, "..", "static", "_headers");

// Regression: _headers lived at the repo root, outside the Pages publish
// directory (static/), so none of its headers were ever served in
// production. Pages only reads config files from the publish directory.
describe("security headers config", () => {
  it("lives inside the publish directory", () => {
    expect(existsSync(headersFile)).toBe(true);
  });

  it("declares the full header set for all routes", () => {
    const text = readFileSync(headersFile, "utf8");
    expect(text.trimStart().startsWith("/*")).toBe(true);
    for (const name of [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Content-Security-Policy",
    ]) {
      expect(text).toContain(`${name}:`);
    }
    expect(text).toContain("default-src 'none'");
  });
});
