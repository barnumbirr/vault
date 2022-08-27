export async function onRequest(ctx) {
    if (ctx.request.method != "GET"){
        return new Response("Method not allowed.", {status: 405});
    }

    const content = await ctx.env.STORAGE.get(`documents:${ctx.params.key}`);

    if (!content) {
        return new Response(`Document "${ctx.params.key}" not found.`, {status: 404});
    }

    const headers = {
        "Content-Type": "text/plain; charset=UTF-8",
    };

    return new Response(content, { headers, status: 200 });

  }
