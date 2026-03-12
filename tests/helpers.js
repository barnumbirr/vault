/**
 * Shared test helpers for mocking the Cloudflare Pages Functions environment.
 */

/** In-memory KV store mock */
export function createKVMock(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get(key) {
      return Promise.resolve(store.get(key) ?? null);
    },
    put(key, value, options) {
      store.set(key, value);
      return Promise.resolve();
    },
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
    _store: store,
  };
}

/** Default env values */
export const DEFAULT_ENV = {
  SECRET_KEY: "test-secret",
  MAX_DOCUMENT_SIZE: "1048576",
  DOCUMENT_KEY_SIZE: "6",
  CACHE_TTL: "300",
};

/**
 * Build a ctx object matching the Cloudflare Pages Functions signature.
 */
export function createCtx({ method = "GET", url = "https://vault.tf/documents", headers = {}, body = null, params = {}, env = {} } = {}) {
  const reqHeaders = new Headers(headers);
  const request = new Request(url, {
    method,
    headers: reqHeaders,
    body,
  });

  return {
    request,
    params,
    env: {
      ...DEFAULT_ENV,
      STORAGE: createKVMock(),
      ...env,
    },
  };
}
