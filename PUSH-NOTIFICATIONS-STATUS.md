# MAHJ MAHJ — Push Notifications Status

Updated: 2026-05-13

## ✓ Done (automated)

1. **Vercel env vars set on `mahj-mahj` project (Production):**
   - `APNS_KEY_ID` — `NP4Q92D59N`
   - `APNS_TEAM_ID` — `L3BZ79YLEC`
   - `APNS_KEY_P8` — contents of `AuthKey_NP4Q92D59N.p8`
   - `PUSH_ADMIN_TOKEN` — shared secret for the admin endpoint

2. **Server endpoints already on `main`:**
   - `api/register-push-token.js` — clients call this on token registration
   - `api/send-push.js` — admin endpoint that signs ES256 JWT and pushes to APNs

3. **Web/JS client already on `main`:**
   - `lib/push-notifications.js` — Capacitor-native detection + permission primer
   - Token registration POSTs to `/api/register-push-token`

4. **iOS scaffold created** (this session):
   - `npx cap add ios` ran with `webDir: "www"` (after creating `www/` with a
     placeholder index.html — the runtime loads from `app.mahjmahj.co` via
     `server.url`, so the local bundle is just a Capacitor requirement)
   - `npx cap sync ios` ran clean (after `LANG=en_US.UTF-8` for CocoaPods)
   - `ios/App/App/App.entitlements` created with `aps-environment=production`
   - `project.pbxproj` updated with `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`
     for both Debug and Release configs
   - `AppDelegate.swift` updated to forward
     `didRegisterForRemoteNotificationsWithDeviceToken` to the Capacitor
     plugin (otherwise the JS side never receives the token)

## ✗ Manual steps remaining (Nidhi at Xcode)

These require Xcode UI and the Apple Developer account — can't be automated:

1. **Open Xcode and verify:**
   ```bash
   open ios/App/App.xcworkspace
   ```
2. **In Xcode → App target → Signing & Capabilities:**
   - Confirm Team is set (L3BZ79YLEC)
   - Click `+ Capability` and add **Push Notifications**
     (this should be a no-op since the entitlement file already has
     `aps-environment` — but Xcode wants to register the capability
     against the App ID at Apple, which only the Xcode UI can do)
3. **Apple Developer portal:**
   - Make sure the App ID `co.mahjmahj.app` has Push Notifications enabled
     (Xcode typically does this automatically when you add the capability,
     but verify at developer.apple.com → Identifiers → co.mahjmahj.app)
4. **Archive + submit:**
   - Product → Archive → Distribute App → App Store Connect → Upload
   - Then submit the build for review in App Store Connect

## Smoke test (after a real token is registered)

Once the app is on TestFlight and a user has granted notification permission,
the token row will land in Supabase `mahj_push_tokens`. You can confirm
end-to-end delivery via:

```bash
curl -X POST https://app.mahjmahj.co/api/send-push \
  -H "authorization: Bearer $PUSH_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "title": "Test from Code",
    "body":  "Just confirming APNs end-to-end works.",
    "dryRun": true
  }'
```

Set `dryRun` to `false` to actually deliver. Use `filter.city_hint` to target
a specific city, or `tokens: [...]` to target specific devices.

## File summary (changes from this session)

- `capacitor.config.json` — `webDir` changed from `"."` to `"www"`
- `www/index.html` (new) — placeholder web bundle (runtime loads from
  `server.url`, not from this file)
- `ios/` (new) — entire Capacitor iOS scaffold
- `ios/App/App/App.entitlements` (new) — `aps-environment=production`
- `ios/App/App/AppDelegate.swift` — push delegate methods
- `ios/App/App.xcodeproj/project.pbxproj` — `CODE_SIGN_ENTITLEMENTS` wiring
