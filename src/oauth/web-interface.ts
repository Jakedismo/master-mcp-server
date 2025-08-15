export class WebInterface {
  // Minimal, accessible pages for success and error. CSS served from /static/oauth/style.css
  renderRedirectPage(providerName: string, redirectUrl: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Continue to ${esc(providerName)}</title>
  <link rel="stylesheet" href="/static/oauth/style.css" />
  <meta http-equiv="refresh" content="0;url=${esc(redirectUrl)}" />
  <script>location.replace(${JSON.stringify(redirectUrl)})</script>
  </head>
<body>
  <main class="container">
    <h1>Redirecting…</h1>
    <p>Taking you to ${esc(providerName)} to sign in.</p>
    <p><a class="button" href="${esc(redirectUrl)}">Continue</a></p>
  </main>
</body>
</html>`
  }

  renderSuccessPage(message = 'Authorization completed successfully.'): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OAuth Success</title>
  <link rel="stylesheet" href="/static/oauth/style.css" />
</head>
<body>
  <main class="container">
    <h1>Success</h1>
    <p>${esc(message)}</p>
  </main>
</body>
</html>`
  }

  renderErrorPage(error = 'Authorization failed.'): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OAuth Error</title>
  <link rel="stylesheet" href="/static/oauth/style.css" />
</head>
<body>
  <main class="container error">
    <h1>Authorization Error</h1>
    <p>${esc(error)}</p>
  </main>
</body>
</html>`
  }
}

