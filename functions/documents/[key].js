import { KEY_PATTERN, JSON_HEADERS, jsonError, timingSafeEqual } from "../lib/shared.js";

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
  const cacheTtl = Number(ctx.env.CACHE_TTL) || 60;
  const content = await ctx.env.STORAGE.get(`documents:${key}`, { cacheTtl });

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

  await ctx.env.STORAGE.delete(`documents:${key}`);

  return new Response(JSON.stringify({ message: "Document deleted." }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
