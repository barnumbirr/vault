# `vault`

A tiny, serverless pastebin-like service built on Cloudflare Pages Functions
and Workers KV.  

Heavily inspired by [`LostLuma/starbin`](https://github.com/LostLuma/starbin)
and [`Erisa/starbin-pages`](https://github.com/Erisa/starbin-pages).

All static assets are copied from the original
[`haste-server`](https://github.com/toptal/haste-server).

## Changes

- Switched `highlight.js` theme to Monokai Sublime
- Added authentication to `POST` request
- Updated external dependencies
- Added catch for duplicate KV entry

## Deploy

Fork repository, create a `Pages` project and connect it to your forked repo,
then map a KV Namespace called `STORAGE`.

Required environment variables:

- `CACHE_TTL`
- `DOCUMENT_KEY_SIZE`
- `MAX_DOCUMENT_SIZE`
- `SECRET_KEY`

## Usage

Given the following script:

```bash
#!/bin/bash
# Taken from
# https://github.com/toptal/haste-server/issues/54#issuecomment-282489506

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

## License

```
MIT License

Copyright (c) 2019 - 2022 Lilly Rose Berner
Copyright (c) 2022 Erisa A.
Copyright (c) 2022 Martin Simon

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
