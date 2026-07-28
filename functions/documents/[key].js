import { KEY_PATTERN, JSON_HEADERS, jsonError, requireAuth, readLiveDocument, withoutBody } from "../lib/shared.js";

export async function onRequest(ctx) {
  const isHead = ctx.request.method === "HEAD";
  const res = await route(ctx, isHead ? "GET" : ctx.request.method);
  return isHead ? withoutBody(res) : res;
}

async function route(ctx, method) {
  const key = ctx.params.key;

  if (!KEY_PATTERN.test(key)) {
    return jsonError("Invalid document key.", 400);
  }

  if (method === "GET") {
    return handleGet(ctx, key);
  }

  if (method === "DELETE") {
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
  const authError = requireAuth(ctx);
  if (authError) return authError;

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
