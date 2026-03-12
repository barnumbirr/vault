import { describe, it, expect } from "vitest";
import { onRequest } from "../functions/raw/[key].js";
import { createCtx, createKVMock } from "./helpers.js";

function rawCtx(key, kvData = {}, envOverrides = {}) {
  return createCtx({
    method: "GET",
    url: `https://vault.tf/raw/${key}`,
    params: { key },
    env: { STORAGE: createKVMock(kvData), ...envOverrides },
  });
}

describe("GET /raw/:key", () => {
  it("returns raw document as plain text", async () => {
    const ctx = rawCtx("abc123", { "documents:abc123": "hello world" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=UTF-8");
    expect(await res.text()).toBe("hello world");
  });

  it("returns 404 for missing document", async () => {
    const ctx = rawCtx("missing");
    const res = await onRequest(ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("not found");
  });

  it("rejects non-GET methods", async () => {
    const ctx = createCtx({
      method: "DELETE",
      url: "https://vault.tf/raw/abc",
      params: { key: "abc" },
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(405);
  });

  it("rejects keys with special characters", async () => {
    const ctx = rawCtx("../../etc");
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("Invalid document key");
  });

  it("rejects keys with unicode", async () => {
    const ctx = rawCtx("café");
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
  });

  it("rejects empty key", async () => {
    const ctx = rawCtx("");
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
  });

  it("parses CACHE_TTL as a number", async () => {
    const storage = createKVMock({ "documents:test1": "cached" });
    let passedOptions;
    const origGet = storage.get.bind(storage);
    storage.get = (key, options) => {
      passedOptions = options;
      return origGet(key);
    };

    const ctx = createCtx({
      method: "GET",
      url: "https://vault.tf/raw/test1",
      params: { key: "test1" },
      env: { STORAGE: storage, CACHE_TTL: "120" },
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(passedOptions.cacheTtl).toBe(120);
  });

  it("preserves document content exactly", async () => {
    const content = "line1\nline2\n\ttabbed\n  spaced\n";
    const ctx = rawCtx("whitespace", { "documents:whitespace": content });
    const res = await onRequest(ctx);
    expect(await res.text()).toBe(content);
  });

  it("returns JSON content-type for errors", async () => {
    const ctx = rawCtx("../bad");
    const res = await onRequest(ctx);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
  });

  it("returns Cache-Control header", async () => {
    const ctx = rawCtx("cache1", { "documents:cache1": "data" }, { CACHE_TTL: "300" });
    const res = await onRequest(ctx);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("preserves unicode and emoji content", async () => {
    const content = "Hello 🌍 café naïve 日本語";
    const ctx = rawCtx("unicode1", { "documents:unicode1": content });
    const res = await onRequest(ctx);
    expect(await res.text()).toBe(content);
  });
});
