# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
