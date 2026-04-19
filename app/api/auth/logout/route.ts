import { NextRequest, NextResponse } from 'next/server';

/**
 * Nuke-the-session logout.
 *
 * Sends HTML that:
 *   1. Deletes all cookies client-side across all known domain variations
 *   2. Unregisters the service worker (so cached responses don't resurrect state)
 *   3. Clears all Cache Storage entries
 *   4. Clears localStorage + sessionStorage
 *   5. Redirects to /login
 *
 * Also clears cookies server-side as a first pass for any accessible cookies.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const loginUrl = `${origin}/login`;

  const cookieNames = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'authjs.callback-url',
    'authjs.csrf-token',
    '__Secure-authjs.callback-url',
    '__Host-authjs.csrf-token',
    '__Secure-authjs.csrf-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.callback-url',
    'next-auth.csrf-token',
    'de-heeren-session',
    '__Secure-de-heeren-session',
  ];

  // Build an HTML response that forcibly clears everything client-side.
  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Uitloggen…</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #FAF7F4; color: #231917;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
      margin: 0; padding: 1rem; text-align: center; }
    .box { max-width: 320px; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { color: #6B5E58; margin: 0; }
    .spinner { width: 28px; height: 28px; border: 3px solid #EDE7E4; border-top-color: #88280B;
      border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner" aria-hidden="true"></div>
    <h1>Uitloggen…</h1>
    <p>Sessie opruimen, even geduld.</p>
  </div>
  <script>
    (async function () {
      var cookieNames = ${JSON.stringify(cookieNames)};
      var host = location.hostname;
      // Build list of domains to try deleting for (exact, .exact, and all parent domains)
      var domainsToTry = [undefined, host, '.' + host];
      var parts = host.split('.');
      for (var i = 1; i < parts.length; i++) {
        var parent = parts.slice(i).join('.');
        if (parent) domainsToTry.push('.' + parent, parent);
      }
      var pathsToTry = ['/', '/api', '/api/auth'];

      // 1. Nuke cookies across all domain/path combos
      for (var c = 0; c < cookieNames.length; c++) {
        for (var d = 0; d < domainsToTry.length; d++) {
          for (var p = 0; p < pathsToTry.length; p++) {
            var parts2 = [cookieNames[c] + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT'];
            parts2.push('path=' + pathsToTry[p]);
            if (domainsToTry[d]) parts2.push('domain=' + domainsToTry[d]);
            parts2.push('SameSite=Lax');
            document.cookie = parts2.join('; ');
            // Secure variant
            document.cookie = parts2.join('; ') + '; Secure';
          }
        }
      }

      // 2. Clear storage
      try { localStorage.clear(); } catch (_) {}
      try { sessionStorage.clear(); } catch (_) {}

      // 3. Unregister service workers
      if ('serviceWorker' in navigator) {
        try {
          var regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(function (r) { return r.unregister(); }));
        } catch (_) {}
      }

      // 4. Clear all caches
      if ('caches' in window) {
        try {
          var keys = await caches.keys();
          await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        } catch (_) {}
      }

      // 5. Redirect — use replace so back button can't return here
      setTimeout(function () {
        location.replace(${JSON.stringify(loginUrl)});
      }, 400);
    })();
  </script>
</body>
</html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });

  // Also try server-side cookie deletion with domain variations
  const host = req.nextUrl.hostname;
  for (const name of cookieNames) {
    response.cookies.set(name, '', { maxAge: 0, path: '/' });
    response.cookies.set(name, '', { maxAge: 0, path: '/', domain: host });
    response.cookies.set(name, '', { maxAge: 0, path: '/', domain: '.' + host });
    // Try parent domain (.bijcafedeheeren.nl for feestjes.bijcafedeheeren.nl)
    const parts = host.split('.');
    if (parts.length >= 2) {
      const parent = parts.slice(-2).join('.');
      response.cookies.set(name, '', { maxAge: 0, path: '/', domain: '.' + parent });
    }
  }

  return response;
}
