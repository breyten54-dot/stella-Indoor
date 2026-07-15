# Stella Admin — Device Onboarding Guide (Android + iOS)

Every admin needs the app on their phone with notifications popping as banners. The path differs by platform — **Android uses our installable app (APK); iOS uses Add to Home Screen.** Both end at the same live admin site with the same login.

**Fleet status check (2026-07-10):** the push server currently has only 3 registered devices — 1 Windows PC + 2 Android phones. **The iOS admin is not receiving pushes at all yet**, and if there are 3 Android admins, one of those phones is unregistered too. Run this guide on every admin device.

---

## Android (3 admins) — install the app, ~2 minutes

Why an app: Android locks notification "importance" per app at creation, and website-installed versions are born without banner rights. Our APK creates its channel at High importance — **banners pop by default, no settings needed.**

1. **Uninstall the old home-screen "Stella Admin"** if present (long-press icon → Uninstall) — avoids duplicate icons.
2. Copy `Stella Project\stella-admin-app\stella-admin.apk` to the phone (WhatsApp as document / Drive / USB).
3. Tap the APK → allow installs from that source (one-time) → **Install**.
4. Open Stella Admin → log in → **Allow notifications** when prompted (Android 13+ asks once).
5. **Settings → Push Diagnostics → Run Diagnostics** — everything should be green with "Subscribe attempt: SUCCESS".
6. Optional proof: **Send Test Push Notification** — the banner should drop down with the phone unlocked on the home screen.

## iOS (1 admin, + future) — Add to Home Screen, ~1 minute

Good news: iOS has no channel-importance trap — home-screen web apps show notification banners **by default** once permission is granted. Requirements: iOS 16.4 or newer, installed via Safari.

1. Open **Safari** → go to `https://stella-indoor-admin.web.app` (must be Safari, not Chrome).
2. Tap the **Share** button → **Add to Home Screen** → Add.
3. Open the new **Stella Admin** icon from the home screen (push only works from the installed icon, not the Safari tab).
4. Log in → Settings → **Enable push notifications** → **Allow** when iOS asks.
5. **Run Diagnostics** — expect all green; the endpoint line will show `web.push.apple.com`.
6. Optional: adjust style under iOS Settings → Notifications → Stella Admin (Banners are on by default).

## For whoever verifies the rollout

- Each successful device registration is visible server-side; ask Claude/Kimi to run the subscription audit (`testing-tools` — endpoint hosts: `fcm.googleapis.com` = Android, `web.push.apple.com` = iOS, `*.notify.windows.com` = Windows PC).
- Full troubleshooting: `NOTIFICATION-GUIDE.md` (diagnostics panel step table, Samsung specifics, testing traps).

## Maintainer notes

- Project source: `Stella Project\stella-admin-twa-final\` (reference); buildable project on the build machine at `C:\android-build\stella-admin-twa\`.
- Signing key: `C:\android-build\keys\` — **never in OneDrive**; back it up privately. Losing it blocks future app updates.
- The site vouches for the app via `https://stella-indoor-admin.web.app/.well-known/assetlinks.json` (package `com.stellaindoor.admin`).
- No rebuild needed for web changes — the app shows the live site. Rebuild only for app-shell changes (icon, name, channel behavior).
- iOS has no APK equivalent by design: a wrapped iOS app would need an Apple Developer account ($99/yr), a Mac build machine, and App Store review — pointless while iOS banners work by default via the home-screen install.
