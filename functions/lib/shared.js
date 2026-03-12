export const KEY_PATTERN = /^[a-zA-Z0-9]+$/;

export const JSON_HEADERS = { "Content-Type": "application/json; charset=UTF-8" };

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
