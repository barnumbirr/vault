# `vault`

A tiny, serverless pastebin-like service built on Cloudflare Pages Functions
and Workers KV.

Heavily inspired by [`LostLuma/starbin`](https://github.com/LostLuma/starbin)
and [`Erisa/starbin-pages`](https://github.com/Erisa/starbin-pages).

All static assets are copied from the original
[`haste-server`](https://github.com/toptal/haste-server).

## Features

- Syntax highlighting via [highlight.js](https://highlightjs.org/) (107 language extensions)
- Document expiration via `Expiration` header (TTL 60s–1 year)
- Input validation on document keys and content size
- Timing-safe auth comparison (`crypto.subtle.timingSafeEqual`)
- Content-Security-Policy (no `unsafe-inline` for scripts)
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.)
- Copy-to-clipboard and delete buttons in the UI
- Password-masked auth prompt for uploads and deletes
- Plausible analytics via self-hosted proxy worker (optional)
- Edge + browser caching via `Cache-Control` headers

## Deploy

Fork repository, create a `Pages` project and connect it to your forked repo,
then map a KV Namespace called `STORAGE`.

Required environment variables:

| Variable | Description |
| --- | --- |
| `CACHE_TTL` | Edge cache duration in seconds for GET requests |
| `DOCUMENT_KEY_SIZE` | Length of generated document keys (default: 6) |
| `MAX_DOCUMENT_SIZE` | Maximum document size in bytes |
| `SECRET_KEY` | Authorization secret for uploads |

### Analytics (optional)

Page views are tracked via a self-hosted
[Plausible](https://plausible.io/) proxy worker
([`plausible-cf-worker`](https://github.com/barnumbirr/plausible-cf-worker)).

To enable analytics:

1. Deploy the plausible-cf-worker to your Cloudflare zone
2. Add a route matching `*yourdomain.com/zk/*` pointing to the worker
3. Add your domain + Plausible script URL to the worker's `PLAUSIBLE` variable

No code changes are needed — the script tag is already in `index.html`. If the
worker route is not configured, the script tag is a no-op (404).

## API

### `POST /documents`

Upload a new document. Returns the key and URL.

**Headers:**

| Header | Required | Description |
| --- | --- | --- |
| `Authorization` | Yes | Must match `SECRET_KEY` |
| `Expiration` | No | TTL in seconds (min 60, max 31536000) |

**Response:**

```json
{ "key": "M12KsL", "url": "https://example.com/M12KsL" }
```

### `GET /documents/:key`

Retrieve a document as JSON.

**Response:**

```json
{ "key": "M12KsL", "data": "document content here" }
```

### `GET /raw/:key`

Retrieve a document as plain text.

### `DELETE /documents/:key`

Delete a document. Requires authorization.

**Headers:**

| Header | Required | Description |
| --- | --- | --- |
| `Authorization` | Yes | Must match `SECRET_KEY` |

**Response:**

```json
{ "message": "Document deleted." }
```

## Usage

Given the following script:

```bash
#!/bin/bash

URL="https://example.com"
SECRET_KEY="secret_password"

upload=$(curl --silent --fail --data-binary @${1:--}\
     -H "Authorization: ${SECRET_KEY}" ${URL}/documents) || {
    echo "ERROR: failed to paste document" >&2
    exit 1
}

key=$(jq -r .key <<< $upload)

echo "${URL}/${key}"
```

Assuming the script is named `vault`, running it looks like:

```bash
$ echo look ma no hands | vault
https://example.com/M12KsL
```

Or:

```bash
$ vault README.md
https://example.com/cIT3Ez
```

With expiration (1 hour):

```bash
$ echo "temporary paste" | curl --silent --fail --data-binary @- \
    -H "Authorization: ${SECRET_KEY}" \
    -H "Expiration: 3600" \
    ${URL}/documents | jq -r .key
```

## Development

```bash
npm install
npm test
```

## License

```
MIT License

Copyright (c) 2019 - 2022 Lilly Rose Berner
Copyright (c) 2022 Erisa A.
Copyright (c) 2022 - 2026 Martin Simon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Buy me a coffee?

If you feel like buying me a coffee (or a beer?), donations are welcome:

```
BTC : bc1qq04jnuqqavpccfptmddqjkg7cuspy3new4sxq9
DOGE: DRBkryyau5CMxpBzVmrBAjK6dVdMZSBsuS
ETH : 0x2238A11856428b72E80D70Be8666729497059d95
LTC : MQwXsBrArLRHQzwQZAjJPNrxGS1uNDDKX6
```
