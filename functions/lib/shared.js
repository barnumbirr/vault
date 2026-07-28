// Bounded: KV rejects keys over 512 bytes, so an unbounded pattern lets a
// long URL throw inside STORAGE.get and surface as a 500. 64 is comfortably
// above any DOCUMENT_KEY_SIZE in use.
export const KEY_PATTERN = /^[a-zA-Z0-9]{1,64}$/;

export const JSON_HEADERS = { "Content-Type": "application/json; charset=UTF-8" };

// Deletion tombstones are read with this short window so a delete becomes
// visible globally within ~TOMBSTONE_CACHE_TTL seconds, independent of the
// long CACHE_TTL used for the (immutable) document body.
export const TOMBSTONE_CACHE_TTL = 60;

// Read a document, honoring deletion tombstones.
//
// Pastes are immutable, so `documents:<key>` is read with the long CACHE_TTL
// window — the colo read cache stays hot for the whole document lifetime,
// which is exactly what we want for reads. Deletion is the one event that
// must propagate quickly, and KV exposes no way to purge a key's per-colo
// read cache. So every read first probes a short-cached `tombstone:<key>`
// marker: a colo still serving the body from its long read cache will see
// the tombstone within TOMBSTONE_CACHE_TTL seconds and report "not found".
//
// Returns `{ content, cacheTtl }`. `content` is null when the key is missing
// or tombstoned; `cacheTtl` is the resolved body TTL for the caller's
// `Cache-Control` header.
export async function readLiveDocument(ctx, key) {
  const cacheTtl = Number(ctx.env.CACHE_TTL) || 60;

  const tombstone = await ctx.env.STORAGE.get(`tombstone:${key}`, { cacheTtl: TOMBSTONE_CACHE_TTL });
  if (tombstone !== null) {
    return { content: null, cacheTtl };
  }

  const content = await ctx.env.STORAGE.get(`documents:${key}`, { cacheTtl });
  return { content, cacheTtl };
}

// Authorize a request against SECRET_KEY. Returns null when authorized,
// otherwise the error Response to send. Fails closed when SECRET_KEY is
// unset or empty: without this guard, an empty Authorization header would
// compare equal to an empty secret and turn a misconfigured deployment
// into an open pastebin with delete rights.
export function requireAuth(ctx) {
  if (!ctx.env.SECRET_KEY) {
    return jsonError("Server misconfigured: SECRET_KEY is not set.", 500);
  }

  const secret = ctx.request.headers.get('Authorization') || '';
  if (!timingSafeEqual(secret, ctx.env.SECRET_KEY)) {
    return jsonError("Unauthorized.", 401);
  }

  return null;
}

// HEAD must mirror GET's status and headers with no body.
export function withoutBody(res) {
  return new Response(null, { status: res.status, headers: res.headers });
}

export function jsonError(message, status, extraHeaders = {}) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  // Use native crypto.subtle.timingSafeEqual when available (Cloudflare Workers)
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.timingSafeEqual === 'function') {
    if (bufA.byteLength !== bufB.byteLength) {
      crypto.subtle.timingSafeEqual(bufB, bufB);
      return false;
    }
    // Two empty inputs must not compare equal (native would return true,
    // the XOR fallback below returns false — keep both branches agreeing,
    // and never let an empty secret authenticate an empty header).
    if (bufA.byteLength === 0) {
      return false;
    }
    return crypto.subtle.timingSafeEqual(bufA, bufB);
  }

  // Fallback: constant-time XOR comparison
  const len = Math.max(bufA.byteLength, bufB.byteLength);
  if (len === 0) return false;

  const padA = new Uint8Array(len);
  const padB = new Uint8Array(len);
  padA.set(bufA);
  padB.set(bufB);

  let result = bufA.byteLength ^ bufB.byteLength;
  for (let i = 0; i < len; i++) {
    result |= padA[i] ^ padB[i];
  }
  return result === 0;
}
