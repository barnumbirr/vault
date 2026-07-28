import { KEY_PATTERN, jsonError, readLiveDocument, withoutBody } from "../lib/shared.js";

export async function onRequest(ctx) {
  const isHead = ctx.request.method === "HEAD";

  if (ctx.request.method !== "GET" && !isHead) {
    return jsonError("Method not allowed.", 405);
  }

  const res = await handleGet(ctx);
  return isHead ? withoutBody(res) : res;
}

async function handleGet(ctx) {
  const key = ctx.params.key;

  if (!KEY_PATTERN.test(key)) {
    return jsonError("Invalid document key.", 400);
  }

  const { content, cacheTtl } = await readLiveDocument(ctx, key);

  if (!content) {
    return jsonError(`Document "${key}" not found.`, 404);
  }

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": `public, max-age=${cacheTtl}`,
    },
  });
}
