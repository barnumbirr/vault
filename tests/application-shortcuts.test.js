// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "static", "application.js"), "utf8");

// application.js is a classic browser script (no exports). Evaluate it once in
// the global scope and capture the Haste class so we can instantiate it.
(0, eval)(source + "\n;globalThis.Haste = Haste;");

// Minimal toolbar markup matching the elements the Haste constructor queries.
const TOOLBAR = `
  <div id="box2">
    <button class="save function button-icon"></button>
    <button class="new function button-icon"></button>
    <button class="duplicate function button-icon"></button>
    <button class="raw function button-icon"></button>
    <button class="twitter function button-icon"></button>
    <button class="copy function button-icon"></button>
    <button class="delete function button-icon"></button>
  </div>
  <div id="pointer" class="hidden"></div>
  <div id="box3" class="hidden"><div class="label"></div><div class="shortcut"></div></div>
  <div id="linenos"></div>
  <pre id="box"><code></code></pre>
  <textarea></textarea>
`;

const RAW_COMBO = { ctrlKey: true, shiftKey: true, altKey: false, keyCode: 82 };

describe("raw-view (Ctrl+Shift+R) shortcut", () => {
  let app;
  beforeEach(() => {
    document.body.innerHTML = TOOLBAR;
    app = new globalThis.Haste("test", { twitter: false });
  });

  const rawButton = () => app.buttons.find((b) => b.label === "Just Text");

  it("does not fire when no document is loaded (regression for /raw/null)", () => {
    app.doc.locked = false; // fresh page: nothing has been saved
    expect(rawButton().shortcut(RAW_COMBO)).toBe(false);
  });

  it("fires once a document is locked", () => {
    app.doc.locked = true;
    expect(rawButton().shortcut(RAW_COMBO)).toBe(true);
  });

  it("action is a no-op (no navigation) on an unsaved document", () => {
    app.doc.locked = false;
    app.doc.key = null;
    const before = window.location.href;
    rawButton().action();
    expect(window.location.href).toBe(before);
  });
});

describe("shortcuts accept Cmd (metaKey) as well as Ctrl", () => {
  let app;
  beforeEach(() => {
    document.body.innerHTML = TOOLBAR;
    app = new globalThis.Haste("test", { twitter: false });
  });

  const button = (label) => app.buttons.find((b) => b.label === label);

  it("Ctrl+S triggers save", () => {
    expect(button("Save").shortcut({ ctrlKey: true, metaKey: false, keyCode: 83 })).toBe(true);
  });

  it("Cmd+S triggers save (macOS regression)", () => {
    expect(button("Save").shortcut({ ctrlKey: false, metaKey: true, keyCode: 83 })).toBe(true);
  });

  it("S alone triggers nothing", () => {
    expect(button("Save").shortcut({ ctrlKey: false, metaKey: false, keyCode: 83 })).toBe(false);
  });

  it("Cmd+Shift+C triggers copy on a locked document", () => {
    app.doc.locked = true;
    expect(button("Copy URL").shortcut({ ctrlKey: false, metaKey: true, shiftKey: true, keyCode: 67 })).toBe(true);
  });
});
