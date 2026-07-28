import { JSON_HEADERS, jsonError, requireAuth } from "./lib/shared.js";

const MAX_KEY_RETRIES = 5;
const MIN_TTL = 60;
const MAX_TTL = 31536000; // 1 year in seconds
const DEFAULT_KEY_SIZE = 6;
const DEFAULT_MAX_SIZE = 1048576; // 1 MB

export async function onRequest(ctx) {
  const authError = requireAuth(ctx);
  if (authError) return authError;

  if (ctx.request.method !== "POST") {
    return jsonError("Method not allowed.", 405);
  }

  const expiration = ctx.request.headers.get("Expiration");
  let options = {};

  if (expiration !== null) {
    const ttl = /^\d+$/.test(expiration.trim()) ? Number(expiration.trim()) : NaN;
    if (!(ttl >= MIN_TTL && ttl <= MAX_TTL)) {
      return jsonError(`Expiration must be an integer between ${MIN_TTL} and ${MAX_TTL} seconds.`, 400);
    }
    options = { expirationTtl: ttl };
  }

  const maxSize = Number(ctx.env.MAX_DOCUMENT_SIZE) || DEFAULT_MAX_SIZE;

  // Fast-reject via Content-Length header before reading the body
  const declaredLength = Number(ctx.request.headers.get("Content-Length") || 0);
  if (declaredLength > maxSize) {
    return jsonError(`Content must be shorter than ${maxSize} (was ${declaredLength}).`, 400);
  }

  const content = await ctx.request.text();
  const actualLength = new TextEncoder().encode(content).byteLength;

  if (actualLength === 0) {
    return jsonError("Content must contain at least one character.", 400);
  }

  if (actualLength > maxSize) {
    return jsonError(`Content must be shorter than ${maxSize} (was ${actualLength}).`, 400);
  }

  let id;
  for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
    id = generateId(ctx);
    // A key is free only if it holds neither live content nor a deletion
    // tombstone. Reusing a tombstoned key would leave the new paste
    // permanently shadowed by the old gravestone (tombstones are permanent).
    const live = (await ctx.env.STORAGE.get(`documents:${id}`)) !== null;
    const tombstoned = !live && (await ctx.env.STORAGE.get(`tombstone:${id}`)) !== null;
    if (!live && !tombstoned) {
      break;
    }
    if (attempt === MAX_KEY_RETRIES - 1) {
      return jsonError("Failed to generate a unique key. Try again.", 503, { "Retry-After": "1" });
    }
  }

  await ctx.env.STORAGE.put(`documents:${id}`, content, options);

  const url = new URL(ctx.request.url);
  const json = {
    key: id,
    url: `${url.protocol}//${url.hostname}/${id}`,
  };

  return new Response(JSON.stringify(json), { headers: JSON_HEADERS, status: 200 });
}

function generateId(ctx) {
  const keyspace = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const size = Number(ctx.env.DOCUMENT_KEY_SIZE) || DEFAULT_KEY_SIZE;
  const limit = keyspace.length * Math.floor(256 / keyspace.length);

  let id = "";
  while (id.length < size) {
    const bytes = new Uint8Array(size - id.length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && id.length < size; i++) {
      if (bytes[i] < limit) {
        id += keyspace.charAt(bytes[i] % keyspace.length);
      }
    }
  }

  return id;
}
