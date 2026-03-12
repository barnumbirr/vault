import { JSON_HEADERS, jsonError, timingSafeEqual } from "./lib/shared.js";

const MAX_KEY_RETRIES = 5;
const MIN_TTL = 60;
const MAX_TTL = 31536000; // 1 year in seconds
const DEFAULT_KEY_SIZE = 6;
const DEFAULT_MAX_SIZE = 1048576; // 1 MB

export async function onRequest(ctx) {
  const secret = ctx.request.headers.get('Authorization') || '';

  if (!timingSafeEqual(secret, ctx.env.SECRET_KEY)) {
    return jsonError("Unauthorized.", 401);
  }

  if (ctx.request.method !== "POST") {
    return jsonError("Method not allowed.", 405);
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
    if (await ctx.env.STORAGE.get(`documents:${id}`) === null) {
      break;
    }
    if (attempt === MAX_KEY_RETRIES - 1) {
      return jsonError("Failed to generate a unique key. Try again.", 503, { "Retry-After": "1" });
    }
  }

  const ttl = Number(ctx.request.headers.get('Expiration')) || 0;
  let options = {};

  if (ttl >= MIN_TTL) {
    options = { expirationTtl: Math.min(ttl, MAX_TTL) };
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
