import { KEY_PATTERN, jsonError, readLiveDocument } from "../lib/shared.js";

export async function onRequest(ctx) {
  if (ctx.request.method !== "GET") {
    return jsonError("Method not allowed.", 405);
  }

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
