# Stella Indoor — Notification Setup Guide

> This guide is for the **admin** devices that need push alerts when clients book or cancel courts. Client notifications are in-app only (the bell inside the client web app) plus confirmation/reminder emails.

---

## What notifications are sent

| Event | Client app | Admin app | Email |
|---|---|---|---|
| New booking | — | Push + in-app list | — |
| Client cancels | Cancellation email | Push + in-app list | Client confirmation email |
| Admin cancels | In-app bell + email | In-app list only (no echo) | Client notification email |
| 1 h / 30 min / 5 min before booking | In-app bell | — | Reminder email to client |

- **Admin push** = the phone/OS banner that slides down from the top, even when Stella Admin is closed.
- **Admin in-app list** = the bell icon inside the Stella Admin dashboard.
- **Client in-app bell** = the green bell icon inside the client web app after you log in.

---

## Before you start

1. Open the **Stella Admin** web app in Chrome on the device.
2. Tap the purple **"Enable background notifications"** banner at the top (or go to **Settings** and tap **Enable push notifications**).
3. Allow the browser permission when Chrome asks.
4. Do this on **every admin device** (phone, tablet, desktop).

If the banner is already gone, the device is either subscribed or the banner was dismissed. Go to **Settings** to check:
- **Push enabled** = subscribed and ready.
- **Push blocked** = the browser permission was denied; follow the steps below.

---

## Why the status-bar badge can look like a white square

Android uses the small status-bar icon as a **mask**: it turns every non-transparent pixel white. If the icon is a colour photo, the result is a solid white square.

Stella now ships a special white-on-transparent crest icon (`/badge-admin.png`) for this. After the fix is deployed:
- Force-close Chrome / the PWA.
- Re-open the admin app so the new service worker (`stella-admin-v4`) installs.
- The next push should show the crest silhouette instead of a white square.

If it still shows a white square, clear the app's storage:

**Android:** Settings → Apps → Chrome (or the Stella Admin PWA) → Storage → Clear cache.

---

## Why the drop-down banner may not appear

Web code can ask for a heads-up alert, but **Android decides** whether to show it based on the notification channel's importance. If the channel is set to Low/Silent, the push still arrives in the notification tray but does **not** pop down as a banner.

There is no web setting that can force a heads-up if the OS channel is set low. You must change it on the device.

### Important: installed PWAs are separate Android apps

If you tapped **Add to Home Screen** in Chrome, Stella Admin becomes a **WebAPK** — Android lists it as its own app (usually called **Stella Admin**) with its **own** notification categories. It is **not** controlled under Chrome's notification settings.

Changing Chrome's "Sites" channel or the global "Pop-up style" setting will **not** affect the Stella Admin PWA. You must change the categories under the **Stella Admin** app entry.

### Common testing traps

When you are testing whether the banner drops down, avoid these:

1. **Same-tag replacement.** If a previous Stella notification is still sitting in the tray, a new push with the same tag can replace it **silently** — no sound, no vibration, no pop-up. Always clear old Stella notifications from the tray before sending a test push.
2. **Sound mode is off / vibrate-only.** On Samsung One UI, mute or vibrate-only modes can suppress the heads-up peek even when the channel is set correctly. Test with the device in **sound mode**.
3. **Stale service worker.** The "Open" action button only appears when the admin service worker is at version `stella-admin-v4` or later. If your test push does **not** show an **Open** button, the app is still running old code — force-close and reopen the installed app so the new service worker installs.
4. **`requireInteraction` can suppress heads-up on some Samsung builds.** Test pushes are now sent with `requireInteraction` disabled so you can compare: if the test push pops down but real booking/cancellation pushes do not, the flag is the suppressor. There is no perfect fix — real alerts still need to stay on screen, but this tells you the channel itself is capable of a banner.

---

## Samsung One UI — enable the pop-up banner

### Fastest diagnostic (do this first)

When a Stella Admin push arrives:

1. **Long-press** the notification.
2. Tap the **gear icon** that appears.
3. Android will open the exact app entry and notification category that posted it.
4. Check the **Importance** / **Alert level**:
   - It must be **High** or **Urgent**.
   - **Show as pop-up** / **Pop-up style** must be **on**.

If the importance is **Medium** or **Low**, the banner will not drop down — change it here.

### Full settings path

1. Open **Settings**.
2. Tap **Notifications**.
3. Tap **App notifications**.
4. Find and tap **Stella Admin** (the Home Screen PWA).  
   *If you have not installed it to the Home Screen yet, the notifications will appear under **Chrome** → **Sites** instead.*
5. Tap **Notification categories**.  
   *On One UI this section can be below the fold — scroll down past **Show or hide content when locked** to find it.*
6. Tap the channel named **"General"**, **"Sites"**, or the Stella Indoor entry.
7. Set:
   - **Importance**: **High** or **Urgent**
   - **Sound and vibrate**: **On**
   - **Pop-up style**: **Brief** or **Detailed** (enable "Show as pop-up")
8. Go back and make sure **Do not disturb** is off for that app.

> **Note:** Samsung's global **Settings → Notifications → Pop-up style** only changes how an already-allowed pop-up looks, not whether it is allowed. You still need the per-app channel importance set to High/Urgent.

---

## Android decision tree

If the banner is not dropping down, work through this order:

1. **App-level permission** — Stella Admin is allowed to notify.
2. **App-level pop-up toggle** — "Notification pop-up" / "Show as pop-up" is enabled.
3. **Category importance** — the actual notification channel is set to **High / Urgent** with pop-up enabled.  
   *This is the most commonly missed step.*
4. **Sound mode** — device is not muted / vibrate-only.
5. **Old notifications cleared** — no same-tag Stella notification is already in the tray.
6. **Service worker up to date** — the push shows an **Open** button.
7. **Nuclear option** — recreate the channel by uninstalling the PWA, clearing site data, and reinstalling.

---

## What if I don't see "Notification categories"?

On some phones — especially older Android / Samsung One UI versions — the notification categories are hidden or the app only has one default channel. In that case the app-level setting IS the channel setting.

Try this path instead:

1. Open **Settings**.
2. Tap **Apps**.
3. Tap **Stella Admin**.
4. Tap **Notifications**.
5. If you see a single toggle or an **Importance** / **Alert** slider, set it to **Urgent** or **High**.
6. Make sure **Show as pop-up** / **Pop on screen** / **Floating notifications** is **enabled**.
7. Ensure **Sound** and **Vibration** are on.

If the app-level setting is already on High/Urgent and the banner still does not appear, the channel is likely stuck at default importance from when it was first created. The only fix is to recreate it:

- Uninstall the Stella Admin Home Screen app.
- Clear Chrome site data for `stella-indoor-admin.web.app`.
- Reinstall from Chrome → Add to Home Screen.
- Re-enable push notifications.
- When the first push arrives, set the app importance to **Urgent/High** immediately.

---

## Stock Android (Pixel, Motorola, Nokia, etc.)

### Fastest diagnostic

When a Stella Admin push arrives:

1. **Long-press** the notification.
2. Tap the **gear icon**.
3. You are taken directly to the posting app and channel.
4. Set **Importance** to **High** and make sure **Pop on screen** is enabled.

### Full settings path

1. Open **Settings**.
2. Tap **Apps**.
3. Tap **Stella Admin** (if installed to Home Screen) or **Chrome**.
4. Tap **Notifications**.
5. Find the channel for Stella Indoor (or the generic **Sites** channel).
6. Set **Importance** to **High** and enable **Pop on screen**.

---

## iPhone / iPad

iOS web push only works if the web app is added to the Home Screen as a PWA:

1. Open Stella Admin in Safari.
2. Tap the **Share** button.
3. Tap **Add to Home Screen**.
4. Open the new Home Screen icon.
5. Enable notifications when prompted.

The banner style (temporary vs persistent) is controlled by iOS:

**Settings → Notifications → Stella Admin → Alerts → choose Banner style.**

You cannot change this from the web app.

---

## If a device suddenly stops receiving pushes

Subscriptions can expire or rotate. Re-subscribe the device:

1. Open Stella Admin on the device.
2. Go to **Settings**.
3. Tap **Disable push notifications**, wait two seconds, then tap **Enable push notifications** again.
4. Accept the browser permission.

You can also send a test push from the same Settings page. If the test push does not arrive:
- Check the device notification settings above.
- Make sure the device is online and not in Do not disturb / Power saving mode.
- On Samsung, check **Battery → Background usage limits** and set Chrome / Stella Admin to **Unrestricted**.

## Nuclear option: recreate the notification channel

If the channel importance is stuck on Low/Silent and will not change, Android will not let you raise an existing channel. You must make the browser create a fresh one:

1. **Uninstall** the Stella Admin Home Screen app (long-press icon → Remove / Uninstall).
2. Open **Chrome**.
3. Go to **⋮ → Settings → Privacy and security → Delete browsing data**.
4. Tap **Advanced**, select **All time**, and delete at least:
   - Cookies and site data
   - Cached images and files
5. Visit `https://stella-indoor-admin.web.app` again.
6. Tap **Add to Home Screen** and install the PWA.
7. Open the new Home Screen icon.
8. Enable notifications when prompted (or use **Settings → Enable push notifications**).
9. Send a test push.
10. When the test push arrives, **long-press it → gear icon** and set the channel to **High / Urgent** with pop-up enabled.

This guarantees a clean channel with the correct importance level.

---

## Quick troubleshooting checklist

- [ ] Admin app opened in Chrome (Android) or Safari Home-Screen PWA (iOS)
- [ ] Push notifications enabled in Stella Admin Settings
- [ ] Browser permission = **Allow**
- [ ] Android notification channel importance = **High / Urgent**
- [ ] Pop-up / "Show as pop-up" enabled for the channel
- [ ] Do not disturb is off
- [ ] Battery optimization is not restricting Chrome / the PWA
- [ ] Device has an internet connection
- [ ] Test push from Settings arrives
- [ ] Old Stella notifications cleared from the tray before testing
- [ ] Device is in **sound mode** (not mute/vibrate-only) when testing the banner
- [ ] Test push shows an **Open** button (confirms sw v4 is active)

---

## Using the Push Diagnostics panel

The fastest way to troubleshoot a device is the **Push Diagnostics** panel in the Stella Admin app:

**Settings → Push Diagnostics → Run Diagnostics**

It runs the full subscribe flow on the device and reports exactly what works and what fails. Tap **Copy full report** to paste the result into a message.

### What each line means

| Line | What it tells you |
|---|---|
| **Display mode** | Whether Stella Admin is running as a browser tab or as an installed Home Screen app (PWA). Push notifications are more reliable when installed. |
| **Browser support** | `serviceWorker`, `pushManager`, and `Notification` API availability. All three must be ✓. |
| **Permission** | Must be `granted`. If `default`, tap **Enable push notifications** first. If `denied`, reset the browser/PWA permission in device Settings. |
| **Service worker** | Whether `/sw-admin.js` is registered and active. If it says `NOT active`, force-close and reopen the app. |
| **Server SW version** | The version Firebase is currently serving (e.g. `stella-admin-v4`). |
| **Installed on device** | The cache versions actually stored on the device. Should match the server version. |
| **VAPID key** | The public VAPID key the app is using (prefix only). If missing, push cannot work. |
| **Subscription** | Whether the device has a stored push subscription and whether its VAPID key is current. |
| **Endpoint** | The push endpoint prefix (e.g. `https://fcm.googleapis.com/fcm/send/...`). |
| **Subscribe attempt** | The live result of trying to subscribe. See the table below. |

### Interpreting the subscribe attempt result

The diagnostic runs `subscribeToPush()` and returns a `step` + `error`.

| Step | Meaning | Fix |
|---|---|---|
| `support` | The browser/OS does not support web push on this device. | Use Chrome on Android, or Safari 16.4+ with a Home Screen PWA on iOS. |
| `permission` | Notification permission was denied or not granted. | Reset permission in device Settings → Apps → Stella Admin → Notifications, then tap **Enable push notifications** again. |
| `sw` | Service worker registration failed or `/sw-admin.js` is not reachable. | Force-close the app, reopen it, and try again. If it persists, clear the app’s storage and reinstall the PWA. |
| `push` | `pushManager.subscribe()` failed (network, VAPID key mismatch, or FCM blocked). | Check internet connection and that the VAPID key line shows a value. If it shows `STALE`, disable then re-enable push notifications. |
| `server` | The device subscribed locally, but `subscribeAdmin` returned an error. | Check that the device is online. If it persists, the server log will show the exact rejection reason. |
| `unknown` | An unexpected error occurred. | Copy the full report and send it to support. |

---

## Can Stella Admin set the channel to High/Urgent by default?

**Short answer: not as a pure PWA.** The Web Push API and Notifications API do not expose Android notification channels. Android creates web-push channels at `IMPORTANCE_DEFAULT`, and no manifest field, service-worker option, or push payload can raise that default.

Things that do **not** change the default channel importance:

- Setting Web Push `urgency: high` (already done) — this affects FCM delivery priority, not channel importance.
- Adding `vibrate`, `requireInteraction`, `renotify`, or `silent` to `showNotification`.
- Any PWA manifest field.

### Option A — Keep the PWA + one-time manual setting

For the existing admin phone(s), the manual Samsung/One UI flip documented above is a one-time fix. Use the Push Diagnostics panel to confirm the install is healthy. This is the lowest-friction path for already-set-up devices.

### Option B — Trusted Web Activity wrapper ⭐ (canonical build in progress)

A TWA with **notification delegation** can own the notification channel: Chrome forwards the web push to the wrapper, and the wrapper's custom `DelegationService` can create the channel at `IMPORTANCE_HIGH` before Chrome creates it at `IMPORTANCE_DEFAULT`. This is the path that makes banners pop by default on fresh installs.

The canonical TWA build for Stella Admin is being handled by **Claude Code** per the current handover (`Hand-Over central/2026-07-07_Kimi_handover.md`, `00-TWA`). When it lands, the expected artifact will be:

- Package: `com.stellaindoor.admin`
- Asset links: `https://stella-indoor-admin.web.app/.well-known/assetlinks.json`
- Install: sideload the signed APK; no Play Store required for internal admin use.

Kimi's earlier in-tree draft (`Stella Project/stella-admin-twa/`) was stopped after the handover collision was discovered; its signing key has been discarded and is **not** the release key. Do not install any APK from that draft.

### Option C — Full native Android app with Firebase Android SDK

Only if you later want Play Store distribution or total native control. It replaces the web-push flow entirely and is overkill for the current admin use case.

### Bottom line

- Already-set-up devices: stick with Option A.
- New/future admin devices: wait for Claude's canonical TWA (Option B) so the channel defaults to High/Urgent.

---

## Note for developers

- The server sends push with `urgency: high`.
- The admin service worker (`public/sw-admin.js`) requests vibration and re-alert to maximize the chance of a heads-up banner.
- The final decision still belongs to the operating system, which is why this guide focuses on device settings.
