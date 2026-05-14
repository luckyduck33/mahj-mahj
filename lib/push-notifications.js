// MAHJ MAHJ — Capacitor push notification client.
//
// Runs ONLY inside the iOS Capacitor wrapper. On the web (Safari mobile,
// desktop), this module no-ops so the marketing/web experience is unchanged.
//
// Flow:
//   1. Detect Capacitor native environment.
//   2. Wait briefly after first launch (don't ask for permission immediately —
//      iOS only lets you ask once).
//   3. Show the pre-permission primer modal (#mm-push-primer in index.html).
//   4. On user accept → call PushNotifications.requestPermissions().
//   5. On `registration` event → POST the device token to
//      /api/register-push-token along with platform + model + OS metadata.
//   6. Persist a small cookie/localStorage flag so we don't re-prompt the
//      primer once the user has answered.
//
// Apple guideline 4.2.2 (native functionality) is satisfied just by having
// the permission flow + token registration; sending pushes is a follow-up.
// .p8 APNs key is pending — token capture works without it.

const STORAGE_KEY = 'mahj_push_primer_state';
const PRIMER_DELAY_MS = 8_000; // 8s after first interactive screen
const ENDPOINT = '/api/register-push-token';

// Kill-switch. Set to true ONLY after the iOS app has shipped to TestFlight
// and the modal markup + dismiss flow have been smoke-tested end-to-end on a
// real device. Until then the primer must never run, even inside Capacitor —
// the same index.html is served to mobile Safari (where Capacitor APIs are
// absent) and we cannot risk shipping a non-dismissable modal there. Flipping
// this is a one-line change.
const PUSH_PRIMER_ENABLED = false;

function isNative() {
  const C = window.Capacitor;
  return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
}

function getState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveState(patch) {
  const cur = getState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...patch }));
}

async function postToken(token, platform) {
  const payload = {
    token,
    platform,
    model: navigator.userAgent || null,
    os_version: getIosVersion(),
    app_version: '1.0',
    city_hint: getCityHint(),
    user_agent: navigator.userAgent || null,
  };
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('[push] token registration non-200:', res.status);
      saveState({ tokenRegistered: false, lastRegistrationAttempt: Date.now() });
      return;
    }
    saveState({ tokenRegistered: true, lastRegistrationAttempt: Date.now() });
    console.log('[push] token registered');
  } catch (err) {
    console.warn('[push] token registration failed:', err && err.message);
    saveState({ tokenRegistered: false, lastRegistrationAttempt: Date.now() });
  }
}

function getIosVersion() {
  const m = (navigator.userAgent || '').match(/OS (\d+)[_.](\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

function getCityHint() {
  // The app stores the user's onboarding-chosen city in localStorage under
  // mahj_user_profile. Reading it here lets the push backend send
  // city-targeted notifications without a separate sync step.
  try {
    const raw = localStorage.getItem('mahj_user_profile');
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && obj.city ? String(obj.city) : null;
  } catch {
    return null;
  }
}

async function attachListeners(PushNotifications) {
  PushNotifications.addListener('registration', (token) => {
    if (!token || !token.value) return;
    saveState({ tokenCapturedAt: Date.now() });
    postToken(token.value, 'ios');
  });
  PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registration error:', err && (err.error || err.message));
    saveState({ lastRegistrationError: String(err && (err.error || err.message)) });
  });
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Foreground delivery — surfacing handled by iOS UI. Logging only.
    console.log('[push] received:', notification && notification.title);
  });
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    // Tap on notification — route into the relevant event/city if the
    // payload carries a target. Marketing-safe default: no-op.
    const data = action && action.notification && action.notification.data;
    if (data && data.url) {
      try { window.location.assign(data.url); } catch {}
    }
  });
}

async function requestAndRegister() {
  const PN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
  if (!PN) {
    console.warn('[push] PushNotifications plugin missing — skipping');
    return;
  }
  await attachListeners(PN);
  try {
    const perm = await PN.requestPermissions();
    if (perm && perm.receive === 'granted') {
      await PN.register();
      saveState({ permission: 'granted', deniedAt: null });
    } else {
      saveState({ permission: perm && perm.receive ? perm.receive : 'unknown', deniedAt: Date.now() });
    }
  } catch (err) {
    console.warn('[push] requestPermissions failed:', err && err.message);
    saveState({ permission: 'error', error: String(err && err.message) });
  }
}

function showPrimer() {
  const root = document.getElementById('mm-push-primer');
  if (!root) {
    // Primer markup missing — fall through to permission ask anyway so the
    // permission flow itself is exercisable.
    return Promise.resolve('accept');
  }
  // Explicitly set display — the inline default is `display:none` so the
  // `hidden` attribute alone isn't enough to undo it. We toggle both.
  root.removeAttribute('hidden');
  root.style.display = 'flex';
  document.documentElement.style.overflow = 'hidden';
  return new Promise((resolve) => {
    const cleanup = () => {
      root.removeEventListener('click', onClick);
      root.setAttribute('hidden', '');
      root.style.display = 'none';
      document.documentElement.style.overflow = '';
    };
    const onClick = (e) => {
      const accept = e.target.closest('[data-action="accept"]');
      const dismiss = e.target.closest('[data-action="dismiss"]');
      if (!accept && !dismiss) return;
      cleanup();
      resolve(accept ? 'accept' : 'dismiss');
    };
    root.addEventListener('click', onClick);
  });
}

export async function initPushNotifications() {
  if (!PUSH_PRIMER_ENABLED) return; // kill-switch — see flag above
  if (!isNative()) return; // web — no-op
  // Belt and suspenders: also make sure the markup is hidden, in case some
  // earlier code or a stylesheet flipped it visible.
  const root = document.getElementById('mm-push-primer');
  if (root) {
    root.setAttribute('hidden', '');
    root.style.display = 'none';
  }
  const state = getState();
  if (state.permission === 'granted' && state.tokenRegistered) return;
  if (state.primerDismissedAt) {
    // User said no earlier. Don't keep nagging — they can re-enable via
    // Settings. We still attempt silent registration in case iOS settings
    // were toggled back on.
    const PN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if (PN) {
      try {
        const cur = await PN.checkPermissions();
        if (cur && cur.receive === 'granted') {
          await attachListeners(PN);
          await PN.register();
        }
      } catch {}
    }
    return;
  }

  // Delay the primer so it appears AFTER the user has had a moment to see
  // the app, not the instant the wrapper loads.
  await new Promise((r) => setTimeout(r, PRIMER_DELAY_MS));

  const answer = await showPrimer();
  saveState({
    primerShownAt: Date.now(),
    primerDismissedAt: answer === 'dismiss' ? Date.now() : null,
  });
  if (answer === 'accept') {
    await requestAndRegister();
  }
}

// Auto-init on DOM ready when included as a module.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initPushNotifications().catch(() => {}); });
  } else {
    initPushNotifications().catch(() => {});
  }
}
