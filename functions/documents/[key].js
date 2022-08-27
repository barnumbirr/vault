export async function onRequest(ctx) {
    if (ctx.request.method != "GET"){
        return new Response("Method not allowed.", {status: 405});
    }

    const content = await ctx.env.STORAGE.get(`documents:${ctx.params.key}`);

    if (!content) {
        return new Response(`Document "${ctx.params.key}" not found.`, {status: 404});
    }

    const json = { key: ctx.params.key, data: content};
    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
    };

    const data = JSON.stringify(json);
    return new Response(data, { headers, status: 200 });
}
