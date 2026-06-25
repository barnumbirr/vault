import { marked } from "marked";

// Render the project README (trusted, first-party markdown) into a complete,
// dark-themed HTML page for /about. Styles live in an external /about.css
// because the site CSP uses `style-src 'self'` — inline <style>/style= are not
// allowed. Kept pure (no file IO) so it can be unit-tested directly.
export function renderAbout(markdown) {
  const body = marked.parse(markdown, { gfm: true });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>about · vault.tf</title>
    <link rel="stylesheet" type="text/css" href="/about.css" />
  </head>
  <body>
    <main class="readme">
      <nav class="about-nav">
        <a class="home" href="/">&larr; back to vault.tf</a>
        <a class="source" href="https://github.com/barnumbirr/vault" target="_blank" rel="noopener noreferrer">Source on GitHub &#8599;</a>
      </nav>
${body}
    </main>
  </body>
</html>
`;
}
