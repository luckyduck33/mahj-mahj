// MAHJ MAHJ — push notification token registration endpoint.
//
// Vercel serverless function. Receives a device token from the iOS
// Capacitor wrapper and upserts it into the mahj_push_tokens table in the
// visibleos-sprint Supabase project (RLS on, service-role bypass).
//
// POST /api/register-push-token
//   body: {
//     token:        string (required, primary key — the APNs device token)
//     platform:     'ios' | 'android' | 'web' (required)
//     model?:       string (UA or device model)
//     os_version?:  string
//     app_version?: string
//     city_hint?:   string (from onboarding profile)
//     user_agent?:  string
//   }
//   200 -> { ok: true, tokenSuffix: 'last 6 chars' }
//   400 -> { error: 'reason' }
//   500 -> { error: 'reason' }
//
// Required env vars (set in Vercel project settings for app.mahjmahj.co):
//   SUPABASE_URL              https://nlbnmvaertbxdxsucxed.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY (visibleos-sprint service role — bypass RLS)

import { createClient } from '@supabase/supabase-js';

const ALLOWED_PLATFORMS = new Set(['ios', 'android', 'web']);
const ALLOWED_ORIGIN = process.env.PUSH_ALLOWED_ORIGIN || 'https://app.mahjmahj.co';

let supabase;
function getClient() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

export default async function handler(req, res) {
  // CORS: only the production app origin and Capacitor's local schemes.
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
    return res.status(405).json({ error: 'POST only' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return badRequest(res, 'invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return badRequest(res, 'missing body');

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.toLowerCase() : '';
  if (!token) return badRequest(res, 'token required');
  if (token.length > 1024) return badRequest(res, 'token too long');
  if (!ALLOWED_PLATFORMS.has(platform)) return badRequest(res, 'invalid platform');

  // Per-field length caps so the table can't be spammed with junk payloads.
  const cap = (s, n) => (typeof s === 'string' ? s.slice(0, n) : null);
  const row = {
    device_token: token,
    platform,
    model: cap(body.model, 512),
    os_version: cap(body.os_version, 64),
    app_version: cap(body.app_version, 64),
    city_hint: cap(body.city_hint, 64),
    user_agent: cap(body.user_agent, 1024),
    status: 'active',
    last_seen_at: new Date().toISOString(),
  };

  try {
    const sb = getClient();
    const { error } = await sb
      .from('mahj_push_tokens')
      .upsert(row, { onConflict: 'device_token' });
    if (error) {
      console.error('[register-push-token] supabase error:', error.message);
      return res.status(500).json({ error: 'storage failure' });
    }
    return res.status(200).json({
      ok: true,
      tokenSuffix: token.slice(-6),
    });
  } catch (err) {
    console.error('[register-push-token] handler error:', err && err.message);
    return res.status(500).json({ error: 'internal error' });
  }
}
