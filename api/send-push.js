// MAHJ MAHJ — server-side push sender (Apple Push Notification service).
//
// Vercel serverless function. Authenticated admin endpoint that:
//   1. Looks up active iOS device tokens in mahj_push_tokens (Supabase
//      visibleos-sprint project) — filtered by city_hint / platform / a
//      caller-supplied token list.
//   2. Mints an ES256 JWT signed with the APNs .p8 key (cached in module
//      memory across warm invocations, refreshed every ~50 min).
//   3. Sends one HTTP/2 POST per token to api.push.apple.com.
//   4. On 410 Unregistered or 400 BadDeviceToken, marks the row inactive so
//      we stop hitting it next time.
//   5. Returns a summary of sent / failed counts.
//
// POST /api/send-push
//   headers:
//     authorization: Bearer <PUSH_ADMIN_TOKEN>
//     content-type:  application/json
//   body:
//     {
//       title:   string (required) — notification title
//       body:    string (required) — notification body
//       url?:    string            — deep link, surfaced via data.url
//       data?:   object            — extra payload merged into APS data
//       sound?:  string            — APS sound ('default' if omitted)
//       badge?:  number            — APS badge count
//       filter?: {
//         platform?:  'ios'              (default 'ios')
//         city_hint?: string             (matches mahj_push_tokens.city_hint)
//         status?:    'active'|'all'     (default 'active')
//       }
//       tokens?:    string[]   — explicit token list; bypasses filter when set
//       production?: boolean   — true=api.push.apple.com (default), false=sandbox
//       dryRun?:    boolean    — don't actually send, just return who would receive
//     }
//
//   200 -> { ok, sent, failed: [{token, status, reason}], skipped, dryRun }
//   401 -> { error: 'unauthorized' }
//   400 -> { error: '...' }
//   500 -> { error: '...' }
//
// Required env vars (mahj-mahj Vercel project):
//   SUPABASE_URL              https://nlbnmvaertbxdxsucxed.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY (visibleos-sprint service role)
//   APNS_KEY_ID               10-char Apple key id (e.g. NP4Q92D59N)
//   APNS_TEAM_ID              10-char Apple team id (e.g. L3BZ79YLEC)
//   APNS_KEY_P8               .p8 contents — raw PEM or base64 of the PEM
//   PUSH_ADMIN_TOKEN          shared secret for Authorization: Bearer header
//
// Optional env vars:
//   APNS_TOPIC                bundle id (default 'co.mahjmahj.app')
//   APNS_PRODUCTION           '1' (default) or '0' to use sandbox

import http2 from 'node:http2';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_TOPIC = process.env.APNS_TOPIC || 'co.mahjmahj.app';
const PROD_HOST = 'https://api.push.apple.com';
const SANDBOX_HOST = 'https://api.sandbox.push.apple.com';
const JWT_TTL_MS = 50 * 60 * 1000; // refresh slightly under Apple's 60-min cap

let _supabase;
function sb() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

// --- JWT (ES256) ---------------------------------------------------------
let _cachedJwt = null;
let _cachedJwtExpiresAt = 0;

function loadKey() {
  const raw = process.env.APNS_KEY_P8;
  if (!raw) throw new Error('APNS_KEY_P8 not configured');
  // Accept either raw PEM or base64-encoded PEM. Detect by header.
  if (raw.includes('BEGIN PRIVATE KEY')) return raw;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.includes('BEGIN PRIVATE KEY')) return decoded;
  } catch {}
  throw new Error('APNS_KEY_P8 is neither raw PEM nor base64-encoded PEM');
}

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function mintJwt() {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyId || !teamId) throw new Error('APNS_KEY_ID / APNS_TEAM_ID not configured');
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${payload}`;
  const pem = loadKey();
  // ES256 = ECDSA over P-256 + SHA-256, signature in JOSE/IEEE-P1363 form.
  const signature = crypto.sign('SHA256', Buffer.from(signingInput), {
    key: pem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${b64url(signature)}`;
}

function getJwt() {
  const now = Date.now();
  if (_cachedJwt && now < _cachedJwtExpiresAt) return _cachedJwt;
  _cachedJwt = mintJwt();
  _cachedJwtExpiresAt = now + JWT_TTL_MS;
  return _cachedJwt;
}

// --- Token lookup --------------------------------------------------------
async function lookupTokens(filter = {}) {
  const platform = filter.platform || 'ios';
  const status = filter.status || 'active';
  let q = sb().from('mahj_push_tokens').select('device_token, platform, city_hint, status').eq('platform', platform);
  if (status !== 'all') q = q.eq('status', status);
  if (filter.city_hint) q = q.eq('city_hint', filter.city_hint);
  const { data, error } = await q;
  if (error) throw new Error(`supabase lookup failed: ${error.message}`);
  return (data || []).map((r) => r.device_token).filter(Boolean);
}

async function markInactive(token, reason) {
  try {
    await sb()
      .from('mahj_push_tokens')
      .update({ status: 'inactive', last_seen_at: new Date().toISOString() })
      .eq('device_token', token);
    console.log(`[send-push] marked inactive (${reason}): …${token.slice(-6)}`);
  } catch (err) {
    console.warn('[send-push] failed to mark inactive:', err && err.message);
  }
}

// --- HTTP/2 sender -------------------------------------------------------
function sendOne(client, jwt, topic, token, payloadJson) {
  return new Promise((resolve) => {
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      'authorization': `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payloadJson),
    });
    let status = 0;
    let body = '';
    req.on('response', (headers) => { status = headers[':status']; });
    req.on('data', (chunk) => { body += chunk.toString('utf8'); });
    req.on('error', (err) => resolve({ token, status: 0, reason: err && err.message }));
    req.on('end', () => {
      if (status === 200) return resolve({ token, status, ok: true });
      let reason = body;
      try { reason = JSON.parse(body).reason || body; } catch {}
      resolve({ token, status, reason });
    });
    req.end(payloadJson);
  });
}

async function sendAll({ tokens, title, body, url, data, sound, badge, production }) {
  const jwt = getJwt();
  const topic = DEFAULT_TOPIC;
  const host = production ? PROD_HOST : SANDBOX_HOST;
  const apsAlert = { title, body };
  const aps = { alert: apsAlert, sound: sound || 'default' };
  if (typeof badge === 'number') aps.badge = badge;
  const payload = { aps, ...(data || {}) };
  if (url && !payload.url) payload.url = url;
  const payloadJson = JSON.stringify(payload);

  const client = http2.connect(host);
  const failed = [];
  let sent = 0;
  try {
    // Modest concurrency — APNs handles many but Vercel's 30s budget is tight.
    const CONCURRENCY = 16;
    let cursor = 0;
    async function worker() {
      while (cursor < tokens.length) {
        const i = cursor++;
        const token = tokens[i];
        const result = await sendOne(client, jwt, topic, token, payloadJson);
        if (result.ok) {
          sent++;
        } else {
          failed.push(result);
          if (result.status === 410 || (result.status === 400 && result.reason === 'BadDeviceToken')) {
            await markInactive(token, result.reason || `status_${result.status}`);
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, worker));
  } finally {
    try { client.close(); } catch {}
  }
  return { sent, failed };
}

// --- Handler -------------------------------------------------------------
function unauthorized(res) { return res.status(401).json({ error: 'unauthorized' }); }
function badRequest(res, msg) { return res.status(400).json({ error: msg }); }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Admin auth — shared secret. No CORS allowance: this is server-to-server only.
  const expected = process.env.PUSH_ADMIN_TOKEN;
  if (!expected) return res.status(500).json({ error: 'PUSH_ADMIN_TOKEN not configured' });
  const auth = req.headers.authorization || '';
  const presented = auth.replace(/^Bearer\s+/i, '').trim();
  if (!presented || !timingSafeEqual(presented, expected)) return unauthorized(res);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return badRequest(res, 'invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return badRequest(res, 'missing body');

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!title) return badRequest(res, 'title required');
  if (!text) return badRequest(res, 'body required');
  if (title.length > 256) return badRequest(res, 'title too long');
  if (text.length > 1024) return badRequest(res, 'body too long');

  const production = body.production !== false && process.env.APNS_PRODUCTION !== '0';
  const dryRun = body.dryRun === true;

  let tokens;
  if (Array.isArray(body.tokens) && body.tokens.length > 0) {
    tokens = body.tokens.filter((t) => typeof t === 'string' && t.length > 0 && t.length <= 1024);
  } else {
    try {
      tokens = await lookupTokens(body.filter || {});
    } catch (err) {
      console.error('[send-push] lookup error:', err && err.message);
      return res.status(500).json({ error: err && err.message });
    }
  }

  if (tokens.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, failed: [], skipped: 'no tokens matched', dryRun });
  }

  if (dryRun) {
    return res.status(200).json({
      ok: true,
      sent: 0,
      failed: [],
      dryRun: true,
      wouldSendTo: tokens.length,
      sample: tokens.slice(0, 5).map((t) => t.slice(-6)),
    });
  }

  try {
    const { sent, failed } = await sendAll({
      tokens,
      title,
      body: text,
      url: typeof body.url === 'string' ? body.url : undefined,
      data: body.data && typeof body.data === 'object' ? body.data : undefined,
      sound: typeof body.sound === 'string' ? body.sound : undefined,
      badge: typeof body.badge === 'number' ? body.badge : undefined,
      production,
    });
    return res.status(200).json({ ok: true, sent, failed, dryRun: false, total: tokens.length });
  } catch (err) {
    console.error('[send-push] send error:', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
