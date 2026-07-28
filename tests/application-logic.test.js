import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "static", "application.js"), "utf8");

// application.js is a classic browser script (no exports). Evaluate it once
// in the global scope and capture the classes. The logic under test touches
// no DOM, so this file runs in the plain node environment.
(0, eval)(source + "\n;globalThis.Haste = Haste; globalThis.HasteDocument = HasteDocument;");

const doc = () => new globalThis.HasteDocument();

describe("lineCount", () => {
  it.each([
    ["", 0],
    ["a", 1],
    ["a\n", 1],
    ["a\nb", 2],
    ["a\nb\n", 2],
    ["\n", 1],
  ])("%j has %i line(s)", (data, expected) => {
    expect(doc().lineCount(data)).toBe(expected);
  });
});

describe("htmlEscape", () => {
  it("escapes all four significant characters", () => {
    expect(doc().htmlEscape('<b a="c">&</b>')).toBe("&lt;b a=&quot;c&quot;&gt;&amp;&lt;/b&gt;");
  });

  it("escapes ampersands first (no double escaping of entities)", () => {
    expect(doc().htmlEscape("&lt;")).toBe("&amp;lt;");
  });
});

describe("extension map lookups", () => {
  const byExt = (ext) => globalThis.Haste.prototype.lookupTypeByExtension.call(null, ext);
  const byType = (type) => globalThis.Haste.prototype.lookupExtensionByType.call(null, type);

  it("maps known extensions to hljs languages", () => {
    expect(byExt("py")).toBe("python");
    expect(byExt("rs")).toBe("rust");
    expect(byExt("tf")).toBe("hcl");
  });

  it("passes unknown extensions through", () => {
    expect(byExt("klingon")).toBe("klingon");
  });

  it("maps languages back to the first matching extension", () => {
    expect(byType("python")).toBe("py");
    expect(byType("bash")).toBe("sh");
    expect(byType("klingon")).toBe("klingon");
  });

  it("round-trips extensions the app generates URLs with", () => {
    for (const ext of ["py", "sh", "rs", "json", "md"]) {
      expect(byType(byExt(ext))).toBe(ext);
    }
  });
});

describe("HasteDocument.load", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns highlighted value, language, and line count", async () => {
    vi.stubGlobal("hljs", {
      highlight: vi.fn((data, opts) => ({ value: "HL:" + data, language: opts.language })),
      highlightAuto: vi.fn((data) => ({ value: "AUTO:" + data, language: "bash" })),
    });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ key: "k1", data: "a\nb\n" }), { status: 200 })
    ));

    const d = doc();
    const ret = await d.load("k1", "bash");
    expect(ret.value).toBe("HL:a\nb\n");
    expect(ret.language).toBe("bash");
    expect(ret.lineCount).toBe(2);
    expect(d.locked).toBe(true);
  });

  it("escapes instead of highlighting when the language is txt", async () => {
    vi.stubGlobal("hljs", {});
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ key: "k1", data: "<b>&" }), { status: 200 })
    ));

    const ret = await doc().load("k1", "txt");
    expect(ret.value).toBe("&lt;b&gt;&amp;");
  });

  it("returns false when the document fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await doc().load("missing")).toBe(false);
  });
});

describe("HasteDocument.save", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the body with the secret and locks the document", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ key: "newkey" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("hljs", { highlightAuto: () => ({ value: "x", language: "bash" }) });

    const d = doc();
    const ret = await d.save("data\n", "s3cret");
    expect(ret.result.key).toBe("newkey");
    expect(ret.result.lineCount).toBe(1);
    expect(d.locked).toBe(true);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("/documents");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe("data\n");
    expect(opts.headers.Authorization).toBe("s3cret");
  });

  it("refuses to save a locked document", async () => {
    const d = doc();
    d.locked = true;
    expect(await d.save("x", "s")).toBe(null);
  });

  it("surfaces the server's error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ message: "Unauthorized." }), { status: 401 })
    ));
    const ret = await doc().save("x", "wrong");
    expect(ret.error.message).toBe("Unauthorized.");
  });
});
