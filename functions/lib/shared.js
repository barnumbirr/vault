export const KEY_PATTERN = /^[a-zA-Z0-9]+$/;

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
