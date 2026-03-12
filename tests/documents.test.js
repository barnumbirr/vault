import { describe, it, expect } from "vitest";
import { onRequest } from "../functions/documents.js";
import { createCtx, createKVMock, DEFAULT_ENV } from "./helpers.js";

function postCtx(body, headers = {}, envOverrides = {}) {
  return createCtx({
    method: "POST",
    url: "https://vault.tf/documents",
    headers: {
      Authorization: DEFAULT_ENV.SECRET_KEY,
      "Content-Length": String(new TextEncoder().encode(body).length),
      ...headers,
    },
    body,
    env: envOverrides,
  });
}

describe("POST /documents", () => {
  it("rejects unauthorized requests", async () => {
    const ctx = postCtx("hello", { Authorization: "wrong" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toBe("Unauthorized.");
  });

  it("rejects non-POST methods", async () => {
    const ctx = createCtx({
      method: "GET",
      headers: { Authorization: DEFAULT_ENV.SECRET_KEY },
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.message).toContain("Method not allowed");
  });

  it("rejects empty content", async () => {
    const ctx = postCtx("", { "Content-Length": "0" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("at least one character");
  });

  it("rejects content exceeding MAX_DOCUMENT_SIZE", async () => {
    const ctx = postCtx("hello", {
      "Content-Length": "9999999",
    }, { MAX_DOCUMENT_SIZE: "100" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("shorter than 100");
  });

  it("saves a document and returns key + url", async () => {
    const ctx = postCtx("hello world");
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.key).toBeTruthy();
    expect(json.key).toMatch(/^[a-zA-Z0-9]+$/);
    expect(json.url).toBe(`https://vault.tf/${json.key}`);

    // Verify stored in KV
    const stored = await ctx.env.STORAGE.get(`documents:${json.key}`);
    expect(stored).toBe("hello world");
  });

  it("respects DOCUMENT_KEY_SIZE", async () => {
    const ctx = postCtx("test", {}, { DOCUMENT_KEY_SIZE: "10" });
    const res = await onRequest(ctx);
    const json = await res.json();
    expect(json.key).toHaveLength(10);
  });

  it("defaults key size to 6 when env var is missing", async () => {
    const ctx = postCtx("test", {}, { DOCUMENT_KEY_SIZE: undefined });
    const res = await onRequest(ctx);
    const json = await res.json();
    expect(json.key).toHaveLength(6);
  });

  it("stores with expirationTtl when Expiration header >= 60", async () => {
    const storage = createKVMock();
    let putOptions;
    const origPut = storage.put.bind(storage);
    storage.put = (key, value, options) => {
      putOptions = options;
      return origPut(key, value, options);
    };

    const ctx = postCtx("expire me", { Expiration: "3600" }, { STORAGE: storage });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(putOptions).toEqual({ expirationTtl: 3600 });
  });

  it("ignores Expiration header below 60", async () => {
    const storage = createKVMock();
    let putOptions;
    const origPut = storage.put.bind(storage);
    storage.put = (key, value, options) => {
      putOptions = options;
      return origPut(key, value, options);
    };

    const ctx = postCtx("no expire", { Expiration: "30" }, { STORAGE: storage });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(putOptions).toEqual({});
  });

  it("clamps Expiration to MAX_TTL (1 year)", async () => {
    const storage = createKVMock();
    let putOptions;
    const origPut = storage.put.bind(storage);
    storage.put = (key, value, options) => {
      putOptions = options;
      return origPut(key, value, options);
    };

    const ctx = postCtx("long live", { Expiration: "999999999" }, { STORAGE: storage });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(putOptions.expirationTtl).toBe(31536000);
  });

  it("retries on key collision", async () => {
    const storage = createKVMock();
    let getCalls = 0;
    storage.get = () => {
      getCalls++;
      if (getCalls === 1) return Promise.resolve("existing");
      return Promise.resolve(null);
    };

    const ctx = postCtx("collision test", {}, { STORAGE: storage });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(getCalls).toBe(2);
  });

  it("returns 503 with Retry-After when all key retries are exhausted", async () => {
    const storage = createKVMock();
    storage.get = () => Promise.resolve("always-collides");

    const ctx = postCtx("doomed", {}, { STORAGE: storage });
    const res = await onRequest(ctx);
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("1");
    const json = await res.json();
    expect(json.message).toContain("unique key");
  });

  it("checks auth before method", async () => {
    const ctx = createCtx({
      method: "GET",
      headers: { Authorization: "wrong" },
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(401);
  });

  it("rejects missing Authorization header", async () => {
    const ctx = createCtx({
      method: "POST",
      url: "https://vault.tf/documents",
      headers: {},
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(401);
  });

  it("rejects when Content-Length is honest but body exceeds limit", async () => {
    const bigBody = "x".repeat(200);
    const ctx = postCtx(bigBody, {}, { MAX_DOCUMENT_SIZE: "100" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("shorter than 100");
  });

  it("rejects spoofed Content-Length (small header, large body)", async () => {
    const bigBody = "x".repeat(200);
    const ctx = postCtx(bigBody, { "Content-Length": "5" }, { MAX_DOCUMENT_SIZE: "100" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("shorter than 100");
  });

  it("returns valid JSON content-type", async () => {
    const ctx = postCtx("test");
    const res = await onRequest(ctx);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
  });

  it("returns JSON content-type for error responses", async () => {
    const ctx = postCtx("hello", { Authorization: "wrong" });
    const res = await onRequest(ctx);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
  });

  it("uses request protocol in response URL", async () => {
    const ctx = postCtx("test", {}, {});
    const res = await onRequest(ctx);
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\//);
  });

  it("defaults MAX_DOCUMENT_SIZE when env var is missing", async () => {
    const ctx = postCtx("test", {}, { MAX_DOCUMENT_SIZE: undefined });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
  });

  it("defaults MAX_DOCUMENT_SIZE when env var is invalid", async () => {
    const ctx = postCtx("test", {}, { MAX_DOCUMENT_SIZE: "not-a-number" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
  });

  it("generates keys using only alphanumeric characters", async () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 10; i++) {
      const ctx = postCtx("test" + i);
      const res = await onRequest(ctx);
      const json = await res.json();
      expect(json.key).toMatch(/^[a-zA-Z0-9]+$/);
    }
  });

  it("accepts content at exactly MAX_DOCUMENT_SIZE", async () => {
    const body = "x".repeat(100);
    const ctx = postCtx(body, {}, { MAX_DOCUMENT_SIZE: "100" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
  });

  it("rejects content one byte over MAX_DOCUMENT_SIZE", async () => {
    const body = "x".repeat(101);
    const ctx = postCtx(body, {}, { MAX_DOCUMENT_SIZE: "100" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
  });

  it("preserves unicode and emoji content", async () => {
    const content = "Hello 🌍 café naïve 日本語";
    const ctx = postCtx(content);
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);

    const json = await res.json();
    const stored = await ctx.env.STORAGE.get(`documents:${json.key}`);
    expect(stored).toBe(content);
  });
});
