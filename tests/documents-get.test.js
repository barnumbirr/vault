import { describe, it, expect } from "vitest";
import { onRequest } from "../functions/documents/[key].js";
import { onRequest as onPostRequest } from "../functions/documents.js";
import { createCtx, createKVMock, DEFAULT_ENV } from "./helpers.js";

function getCtx(key, kvData = {}, envOverrides = {}) {
  return createCtx({
    method: "GET",
    url: `https://vault.tf/documents/${key}`,
    params: { key },
    env: { STORAGE: createKVMock(kvData), ...envOverrides },
  });
}

function deleteCtx(key, kvData = {}, headers = {}, envOverrides = {}) {
  return createCtx({
    method: "DELETE",
    url: `https://vault.tf/documents/${key}`,
    params: { key },
    headers: { Authorization: DEFAULT_ENV.SECRET_KEY, ...headers },
    env: { STORAGE: createKVMock(kvData), ...envOverrides },
  });
}

describe("GET /documents/:key", () => {
  it("returns document as JSON", async () => {
    const ctx = getCtx("abc123", { "documents:abc123": "hello world" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.key).toBe("abc123");
    expect(json.data).toBe("hello world");
  });

  it("returns 404 for missing document", async () => {
    const ctx = getCtx("missing");
    const res = await onRequest(ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("not found");
  });

  it("rejects keys with special characters", async () => {
    const ctx = getCtx("../etc/passwd");
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("Invalid document key");
  });

  it("rejects keys with spaces", async () => {
    const ctx = getCtx("has space");
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
  });

  it("rejects empty key", async () => {
    const ctx = getCtx("");
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
  });

  it("accepts alphanumeric keys", async () => {
    const ctx = getCtx("AbCd1234", { "documents:AbCd1234": "data" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
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
      url: "https://vault.tf/documents/test1",
      params: { key: "test1" },
      env: { STORAGE: storage, CACHE_TTL: "600" },
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(passedOptions.cacheTtl).toBe(600);
    expect(typeof passedOptions.cacheTtl).toBe("number");
  });

  it("defaults CACHE_TTL to 60 when missing", async () => {
    const storage = createKVMock({ "documents:test2": "data" });
    let passedOptions;
    const origGet = storage.get.bind(storage);
    storage.get = (key, options) => {
      passedOptions = options;
      return origGet(key);
    };

    const ctx = createCtx({
      method: "GET",
      url: "https://vault.tf/documents/test2",
      params: { key: "test2" },
      env: { STORAGE: storage, CACHE_TTL: undefined },
    });
    const res = await onRequest(ctx);
    expect(passedOptions.cacheTtl).toBe(60);
  });

  it("returns JSON content-type for success", async () => {
    const ctx = getCtx("test3", { "documents:test3": "hi" });
    const res = await onRequest(ctx);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
  });

  it("returns JSON content-type for errors", async () => {
    const ctx = getCtx("../bad");
    const res = await onRequest(ctx);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
  });

  it("returns Cache-Control header", async () => {
    const ctx = getCtx("cache1", { "documents:cache1": "data" }, { CACHE_TTL: "600" });
    const res = await onRequest(ctx);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("preserves unicode and emoji content", async () => {
    const content = "Hello 🌍 café naïve 日本語";
    const ctx = getCtx("unicode1", { "documents:unicode1": content });
    const res = await onRequest(ctx);
    const json = await res.json();
    expect(json.data).toBe(content);
  });

  it("returns 404 when a tombstone exists even though the body is still cached", async () => {
    // Models a colo still holding the body in its long read cache after a delete.
    const ctx = getCtx("stale1", { "documents:stale1": "stale body", "tombstone:stale1": "1" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("not found");
  });

  it("reads the tombstone with a short cacheTtl, the body with CACHE_TTL", async () => {
    const storage = createKVMock({ "documents:t1": "data" });
    const seen = {};
    const origGet = storage.get.bind(storage);
    storage.get = (key, options) => {
      seen[key.split(":")[0]] = options;
      return origGet(key);
    };

    const ctx = createCtx({
      method: "GET",
      url: "https://vault.tf/documents/t1",
      params: { key: "t1" },
      env: { STORAGE: storage, CACHE_TTL: "86400" },
    });
    await onRequest(ctx);
    expect(seen.tombstone.cacheTtl).toBe(60);
    expect(seen.documents.cacheTtl).toBe(86400);
  });
});

describe("DELETE /documents/:key", () => {
  it("deletes an existing document", async () => {
    const ctx = deleteCtx("abc123", { "documents:abc123": "to delete" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toContain("deleted");

    // Verify removed from KV
    const stored = await ctx.env.STORAGE.get("documents:abc123");
    expect(stored).toBeNull();
  });

  it("rejects unauthorized delete", async () => {
    const ctx = deleteCtx("abc123", { "documents:abc123": "data" }, { Authorization: "wrong" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(401);

    // Verify NOT deleted
    const stored = await ctx.env.STORAGE.get("documents:abc123");
    expect(stored).toBe("data");
  });

  it("rejects delete without auth header", async () => {
    const ctx = createCtx({
      method: "DELETE",
      url: "https://vault.tf/documents/abc123",
      params: { key: "abc123" },
      env: { STORAGE: createKVMock({ "documents:abc123": "data" }) },
      headers: {},
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing document", async () => {
    const ctx = deleteCtx("missing");
    const res = await onRequest(ctx);
    expect(res.status).toBe(404);
  });

  it("rejects invalid key format", async () => {
    const ctx = deleteCtx("../bad");
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
  });

  it("returns 405 for unsupported methods", async () => {
    const ctx = createCtx({
      method: "POST",
      url: "https://vault.tf/documents/abc",
      params: { key: "abc" },
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(405);
  });

  it("returns JSON content-type", async () => {
    const ctx = deleteCtx("abc123", { "documents:abc123": "data" });
    const res = await onRequest(ctx);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
  });

  it("writes a permanent tombstone and removes the body", async () => {
    const ctx = deleteCtx("abc123", { "documents:abc123": "to delete" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(await ctx.env.STORAGE.get("tombstone:abc123")).toBe("1");
    expect(await ctx.env.STORAGE.get("documents:abc123")).toBeNull();
  });

  it("writes the tombstone before deleting the body", async () => {
    // Ordering invariant: there must be no window where the body is gone but
    // no tombstone exists yet to shadow a stale colo read.
    const storage = createKVMock({ "documents:order1": "body" });
    const calls = [];
    const origPut = storage.put.bind(storage);
    const origDelete = storage.delete.bind(storage);
    storage.put = (key, value, options) => {
      calls.push(`put ${key}`);
      return origPut(key, value, options);
    };
    storage.delete = (key) => {
      calls.push(`delete ${key}`);
      return origDelete(key);
    };

    const ctx = createCtx({
      method: "DELETE",
      url: "https://vault.tf/documents/order1",
      params: { key: "order1" },
      headers: { Authorization: DEFAULT_ENV.SECRET_KEY },
      env: { STORAGE: storage },
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(calls).toEqual(["put tombstone:order1", "delete documents:order1"]);
  });

  it("GET returns 404 after DELETE", async () => {
    const storage = createKVMock({ "documents:abc123": "to delete" });
    const delCtx = createCtx({
      method: "DELETE",
      url: "https://vault.tf/documents/abc123",
      params: { key: "abc123" },
      headers: { Authorization: DEFAULT_ENV.SECRET_KEY },
      env: { STORAGE: storage },
    });
    const delRes = await onRequest(delCtx);
    expect(delRes.status).toBe(200);

    const getCtxAfter = createCtx({
      method: "GET",
      url: "https://vault.tf/documents/abc123",
      params: { key: "abc123" },
      env: { STORAGE: storage },
    });
    const getRes = await onRequest(getCtxAfter);
    expect(getRes.status).toBe(404);
  });
});

describe("Integration: POST → GET → DELETE", () => {
  it("full lifecycle: create, retrieve, delete", async () => {
    const storage = createKVMock();
    const content = "integration test 🚀";

    // POST: create document
    const postCtx = createCtx({
      method: "POST",
      url: "https://vault.tf/documents",
      headers: {
        Authorization: DEFAULT_ENV.SECRET_KEY,
        "Content-Length": String(new TextEncoder().encode(content).length),
      },
      body: content,
      env: { STORAGE: storage },
    });
    const postRes = await onPostRequest(postCtx);
    expect(postRes.status).toBe(200);
    const { key } = await postRes.json();
    expect(key).toBeTruthy();

    // GET: retrieve document
    const getCtx2 = createCtx({
      method: "GET",
      url: `https://vault.tf/documents/${key}`,
      params: { key },
      env: { STORAGE: storage },
    });
    const getRes = await onRequest(getCtx2);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.key).toBe(key);
    expect(getData.data).toBe(content);

    // DELETE: remove document
    const delCtx = createCtx({
      method: "DELETE",
      url: `https://vault.tf/documents/${key}`,
      params: { key },
      headers: { Authorization: DEFAULT_ENV.SECRET_KEY },
      env: { STORAGE: storage },
    });
    const delRes = await onRequest(delCtx);
    expect(delRes.status).toBe(200);

    // GET after DELETE: 404
    const getCtx3 = createCtx({
      method: "GET",
      url: `https://vault.tf/documents/${key}`,
      params: { key },
      env: { STORAGE: storage },
    });
    const getRes2 = await onRequest(getCtx3);
    expect(getRes2.status).toBe(404);
  });
});

describe("key length bound", () => {
  // Regression: unbounded keys flowed into KV, whose 512-byte key limit
  // threw and surfaced as a 500.
  it("rejects a 65-character key with 400", async () => {
    const ctx = getCtx("a".repeat(65));
    const res = await onRequest(ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("Invalid document key");
  });

  it("accepts a 64-character key", async () => {
    const key = "a".repeat(64);
    const ctx = getCtx(key, { [`documents:${key}`]: "still fine" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
  });
});

describe("HEAD /documents/:key", () => {
  function headCtx(key, kvData = {}) {
    return createCtx({
      method: "HEAD",
      url: `https://vault.tf/documents/${key}`,
      params: { key },
      env: { STORAGE: createKVMock(kvData) },
    });
  }

  it("mirrors GET's status and headers with an empty body", async () => {
    const ctx = headCtx("abc123", { "documents:abc123": "hello world" });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
    expect(res.headers.get("Cache-Control")).toContain("max-age");
    expect(await res.text()).toBe("");
  });

  it("returns 404 with an empty body for missing documents", async () => {
    const ctx = headCtx("missing");
    const res = await onRequest(ctx);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
});

describe("DELETE misconfiguration", () => {
  it("fails closed with 500 when SECRET_KEY is unset and keeps the document", async () => {
    const ctx = createCtx({
      method: "DELETE",
      url: "https://vault.tf/documents/abc123",
      params: { key: "abc123" },
      env: { STORAGE: createKVMock({ "documents:abc123": "data" }), SECRET_KEY: undefined },
    });
    const res = await onRequest(ctx);
    expect(res.status).toBe(500);
    expect(await ctx.env.STORAGE.get("documents:abc123")).toBe("data");
  });
});
