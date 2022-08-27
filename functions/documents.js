export async function onRequest(ctx) {
  	const secret = ctx.request.headers.get('Authorization');

  	if (secret !== ctx.env.SECRET_KEY) {
	  	return new Response("Unauthorized.", {status: 401});
  	}

  	if (ctx.request.method != "POST") {
		return new Response("Method not allowed.", {status: 405});
  	}

  	const url = new URL(ctx.request.url)

  	const length = Number(ctx.request.headers.get("Content-Length") || 0);

  	if (!length) {
		return new Response("Content must contain at least one character.", {status: 400});
  	}

  	if (length > ctx.env.MAX_DOCUMENT_SIZE) {
		return new Response(`Content must be shorter than ${MAX_DOCUMENT_SIZE} (was ${length}).`, {status: 400});
  	}

  	const id = generateId(ctx);

  	if (await ctx.env.STORAGE.get(`documents:${id}`) !== null) {
		const id = generateId(ctx);
  	}
  	const content = await ctx.request.text();

  	await ctx.env.STORAGE.put(`documents:${id}`, content);

  	const json = {
		key: id,
		url: `https://${url.hostname}/${id}`,
  	};
  	const headers = {
		"Content-Type": "application/json; charset=UTF-8",
  	};

  	const data = JSON.stringify(json);
  	return new Response(data, { headers, status: 200 });
}

function generateId(ctx) {
	let id = "";
	const keyspace = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

	for (let i = 0; i < ctx.env.DOCUMENT_KEY_SIZE; i++) {
		id += keyspace.charAt(Math.random() * keyspace.length);
	}

	return id;
}
