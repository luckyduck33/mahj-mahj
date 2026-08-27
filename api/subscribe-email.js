// MAHJ MAHJ: app onboarding email capture, relayed to the real newsletter pipeline.
//
// Background: the onboarding screen ("Your email" field, index.html) has always
// saved what a user typed straight to localStorage and never sent it anywhere
// (see /Users/nidhiluckyhanda/CLAUDE.nosync/acquisition-operator/docs/MAHJ_AUDIT.md,
// finding #1, 2026-08-27 audit -- full lifecycle trace, confirmed via repo grep).
// A user who filled it in believed they'd joined something; MAHJ MAHJ got nothing.
//
// Fix: the client now POSTs here (same origin as the app, see the relative
// `/api/register-push-token` precedent this endpoint mirrors in
// lib/push-notifications.js) and this function relays the signup, server-to-
// server, to the website's already-working newsletter endpoint
// (https://mahjmahj.co/api/subscribe -> Beehiiv primary + Notion mirror; live
// end-to-end test confirmed 2026-08-27, see MAHJ_AUDIT.md "Post-audit
// verification").
//
// Why proxy instead of POSTing directly from the webview to mahjmahj.co:
//   - mahjmahj-web's /api/subscribe route sets no CORS headers at all (grepped
//     the repo, no Access-Control-Allow-Origin anywhere), and that repo's own
//     CLAUDE.md says "do not touch app.mahjmahj.co from this repo" -- the
//     inverse holds too: this fix should not require a change to mahjmahj-web.
//   - A direct cross-origin fetch() from inside the Capacitor webview would
//     preflight and fail without CORS support on the target. A native
//     Capacitor HTTP plugin would bypass that, but this app has no such
//     dependency today (package.json: only @capacitor/core|ios|push-
//     notifications) and adding one needs `npx cap sync ios` + an Xcode
//     rebuild -- out of scope for this fix.
//   - A same-origin relay avoids both problems: the browser/webview only ever
//     talks to its own origin (app.mahjmahj.co), and the actual cross-origin
//     hop happens in this Node function via plain `fetch()`, which is not
//     subject to CORS (CORS is a browser-only restriction).
//
// KNOWN LIMITATION (documented, not silently swallowed): mahjmahj-web's
// SUBSCRIBE_SOURCES allowlist (src/lib/subscribe.ts, normalizeSource()) does
// not include 'app_onboarding'. Unrecognized `source` values normalize to
// 'unknown' server-side before being written to Beehiiv/Notion. So today this
// capture lands correctly (email reaches the list) but is tagged
// source=unknown rather than distinctly as the app -- per-surface attribution,
// not capture, is degraded. Extending that allowlist requires a change in the
// mahjmahj-web repo, out of scope here (flagged separately).
//
// POST /api/subscribe-email
//   body: { email: string (required), city?: string }
//   200 -> { ok: true }
//   4xx -> { ok: false, error }
//   502 -> { ok: false, error } (upstream/network failure -- client retries on
//           next app launch, see index.html retryPendingEmailCapture())

const ALLOWED_ORIGIN = process.env.SUBSCRIBE_ALLOWED_ORIGIN || 'https://app.mahjmahj.co';
const UPSTREAM_URL = process.env.SUBSCRIBE_UPSTREAM_URL || 'https://mahjmahj.co/api/subscribe';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL = 254;
const MAX_CITY = 80;

function badRequest(res, msg) {
  return res.status(400).json({ ok: false, error: msg });
}

export default async function handler(req, res) {
  // CORS: same allowlist shape as register-push-token.js -- the production
  // app origin plus Capacitor's native webview schemes. In practice this
  // endpoint is only ever called same-origin from index.html, but the header
  // is harmless to set and keeps this consistent with the rest of the app's
  // serverless functions.
  const origin = req.headers.origin || '';
  if (
    origin === ALLOWED_ORIGIN ||
    origin.startsWith('capacitor://') ||
    origin.startsWith('ionic://')
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return badRequest(res, 'invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return badRequest(res, 'missing body');

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const city = typeof body.city === 'string' ? body.city.trim().slice(0, MAX_CITY) : undefined;

  if (!email) return badRequest(res, 'email required');
  if (email.length > MAX_EMAIL) return badRequest(res, 'email too long');
  if (!EMAIL_RE.test(email)) return badRequest(res, 'invalid email');

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, city, source: 'app_onboarding' }),
    });
    let data = {};
    try { data = await upstream.json(); } catch { /* non-JSON upstream body, ignore */ }
    if (!upstream.ok || data.ok === false) {
      console.error('[subscribe-email] upstream rejected', upstream.status, data);
      return res.status(502).json({ ok: false, error: 'signup service unavailable' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[subscribe-email] handler error:', err && err.message);
    return res.status(502).json({ ok: false, error: 'signup service unavailable' });
  }
}
