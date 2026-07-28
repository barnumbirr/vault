# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Toolbar icons are now inline SVG ([Bootstrap Icons](https://icons.getbootstrap.com), MIT); the Copy URL and Delete buttons gained icons (previously text-only).
- New `vault.tf` wordmark in place of the upstream hastebin logo.
- Tooltip tail is now drawn in CSS; `static/` no longer ships any images.
- `/about` is now a rendered static page built from `README.md` at deploy (`npm run build`), replacing the hand-seeded KV paste so it always matches the README.

### Fixed

- `Ctrl+Shift+R` on an unsaved document no longer navigates to `/raw/null`.
- The editor textarea collapsed to two rows, making a multi-line paste appear
  to keep only its last line (2.0.0 regression: the doctype switch to standards
  mode broke `height: 100%`). It now sizes to the viewport.

## [2.0.1] - 2026-06-18

### Fixed

- Deleted documents could keep serving for up to `CACHE_TTL` (24h in
  production) because KV's per-colo read cache has no purge API. Reads now
  gate on a short-cached deletion tombstone, so a deleted document stops
  serving within ~60 seconds globally — even where its body is still in a
  colo's long read cache. Document reads keep the full `CACHE_TTL` window;
  pastes are immutable, so the read path is unchanged.

## [2.0.0] - 2026-03-12

### Added

- `DELETE /documents/:key` endpoint with authorization
- Copy-to-clipboard button (`Ctrl+Shift+C`)
- Password-masked auth modal for UI uploads and deletes
- Content-Security-Policy header (strict, no `unsafe-inline` for scripts)
- Plausible analytics integration via self-hosted proxy worker
- `Cache-Control` headers on GET responses
- `Retry-After` header on 503 responses
- Content-Length spoofing protection (validates actual body size)
- Rejection sampling for unbiased key generation
- Document expiration via `Expiration` header (TTL 60s–1 year)
- Input validation on document keys and content size
- Security headers via `_headers` (CSP, X-Frame-Options, DENY, etc.)
- 107 language extensions for syntax highlighting
- Comprehensive test suite (57 tests via vitest)
- CI workflow (GitHub Actions, Node 20 + 22 matrix)

### Changed

- Rewrote frontend in vanilla JS (removed jQuery dependency)
- Upgraded highlight.js from 10.7.2 to 11.11.1
- Switched to native `crypto.subtle.timingSafeEqual` with XOR fallback
- All error responses now return JSON via shared `jsonError()` helper
- Moved inline scripts to external files for CSP compliance
- Replaced inline `style` attributes with `.hidden` CSS class
- Timing-safe auth comparison on all protected endpoints

### Removed

- jQuery dependency (`jquery-1.7.1.min.js`)
- Minified application bundle (`application.min.js`)

### Fixed

- highlight.js v11 API (`hljs.highlight(code, {language})`)
- Double-fault in highlight.js error handling (fallback can also throw)
- Modulo bias in key generation (rejection sampling)
- Line count off-by-one for empty documents
- Dead code (`button.clickDisabled` never set)
- Clipboard fallback message when API unavailable
