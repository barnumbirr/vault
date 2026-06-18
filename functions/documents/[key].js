import { KEY_PATTERN, JSON_HEADERS, jsonError, timingSafeEqual, readLiveDocument } from "../lib/shared.js";

export async function onRequest(ctx) {
  const key = ctx.params.key;

  if (!KEY_PATTERN.test(key)) {
    return jsonError("Invalid document key.", 400);
  }

  if (ctx.request.method === "GET") {
    return handleGet(ctx, key);
  }

  if (ctx.request.method === "DELETE") {
    return handleDelete(ctx, key);
  }

  return jsonError("Method not allowed.", 405);
}

async function handleGet(ctx, key) {
  const { content, cacheTtl } = await readLiveDocument(ctx, key);

  if (!content) {
    return jsonError(`Document "${key}" not found.`, 404);
  }

  return new Response(JSON.stringify({ key, data: content }), {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      "Cache-Control": `public, max-age=${cacheTtl}`,
    },
  });
}

async function handleDelete(ctx, key) {
  const secret = ctx.request.headers.get('Authorization') || '';

  if (!timingSafeEqual(secret, ctx.env.SECRET_KEY)) {
    return jsonError("Unauthorized.", 401);
  }

  const content = await ctx.env.STORAGE.get(`documents:${key}`);

  if (!content) {
    return jsonError(`Document "${key}" not found.`, 404);
  }

  // Write the tombstone before removing the body. Reads gate on this
  // short-cached marker, so the deletion is visible within
  // TOMBSTONE_CACHE_TTL seconds even in colos still serving the body from
  // KV's long per-colo read cache. The tombstone is permanent: it must
  // outlive any colo's cached copy of the body, and it keeps a regenerated
  // key (vanishingly unlikely) from resurrecting under the old gravestone.
  await ctx.env.STORAGE.put(`tombstone:${key}`, "1");
  await ctx.env.STORAGE.delete(`documents:${key}`);

  return new Response(JSON.stringify({ message: "Document deleted." }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
