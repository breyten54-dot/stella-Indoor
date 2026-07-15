# Google Play — Setup Checklist (Stella Indoor)

Everything in this folder is upload-ready. The only steps Claude/Kimi cannot do are the account signup, payments, and final submit clicks.

## What's in this folder

| File | Purpose |
|---|---|
| `stella-admin.aab` | Admin app bundle (package `com.stellaindoor.admin`) — **closed testing track, admins only** |
| `stella-client.aab` | Client booking app bundle (package `com.stellaindoor.app`) — **public listing** |
| `assets\admin-icon-512.png`, `assets\client-icon-512.png` | Store icons |
| `assets\*-feature-1024x500.png` | Feature graphics |
| `assets\admin-shot-*.png`, `assets\client-shot-*.png` | Phone screenshots |

## Step 1 — Create the developer account (user, ~15 min + verification wait)

1. Go to **https://play.google.com/console/signup** with the Google account that should own the apps.
2. Pay the **$25 one-time** fee.
3. Account type: **Personal** = fast, but the *client* app's public release will first require a closed test with 12 testers for 14 days. **Organization** (Stella's registered business) = no tester requirement + business name on the listing, but needs D-U-N-S/business verification (days).
4. Complete identity verification. Tell Claude/Kimi when the console is open.

## Step 2 — Admin app (closed track — do this first, it's simple)

1. Console → **Create app** → name "Stella Admin", app (not game), free.
2. **Testing → Closed testing → Create track** → upload `stella-admin.aab`.
3. Add the 4 admin email addresses as testers → save → share the opt-in link with them.
4. Fill the mandatory declarations (content rating questionnaire, data safety — Claude has the answers prepared, just ask).
5. **CRITICAL after upload:** Console → Setup → **App integrity → App signing** → copy the **SHA-256 certificate fingerprint** Google shows → give it to Claude/Kimi. We must put it in `stella-indoor-admin.web.app/.well-known/assetlinks.json` or the installed app opens with a browser bar.
6. Admins install from the opt-in link → banners pop by default, auto-updates forever.

## Step 3 — Client app (public)

1. **Create app** → "Stella Indoor Sports Hub", free.
2. Upload `stella-client.aab` (closed testing first on a personal account — invite 12+ customers, keep the test running 14 days — then promote to Production; organization accounts can go straight to production review).
3. Same **App signing fingerprint → assetlinks** step, this time for `stella-indoor.web.app` (tell Claude/Kimi).
4. Store listing: icon, feature graphic, the 2 screenshots, short + full description (drafts below).

## Listing text drafts

**Client — short (max 80 chars):**
"Book indoor soccer, hockey, netball & futsal courts at Stella Indoor, Durban."

**Client — full description:** Book your court at Stella Indoor Sports Hub — Durban's premier indoor sports facility. Choose your court and time, invite teammates, get booking confirmations and reminders, and manage your bookings from your phone. Three courts for soccer, hockey, netball and futsal.

**Admin — short:** "Staff app for Stella Indoor Sports Hub — bookings, calendar and alerts." (closed track; listing barely matters)

## Declarations cheat sheet (copy these answers into the console forms)

- **Privacy policy URL:** `https://stella-indoor.web.app/privacy.html` (live, works for both apps)
- **App access:** "All or some functionality is restricted" → provide a working login (email + password) for review, with note: "Log in with the provided credentials; the app manages sports-court bookings."
- **Ads:** No, the app contains no ads
- **Content rating:** questionnaire category "Utility, Productivity, Communication, or Other" → answer **No** to everything (violence, sexuality, language, controlled substances, gambling) → rating comes out Everyone
- **Target audience:** 18 and over (simplest; it's a business/booking tool)
- **News app:** No · **Government app:** No · **COVID app:** No
- **Financial features:** None (payments happen at the venue / outside the app)
- **Data safety:**
  - Does your app collect or share user data? **Collects: Yes. Shares: No.**
  - Data types: Personal info → **Name, Email address, Phone number**
  - For each: Collected (not shared) · **Not** processed ephemerally · Required · Purpose: **App functionality, Account management**
  - Encrypted in transit: **Yes** · Users can request deletion: **Yes**
- **App category:** client app = "Sports" (or Lifestyle); admin app = "Business"
- **Contact email:** stellasportshub@gmail.com

## Notes

- Both bundles are signed with the upload key at `C:\android-build\keys\` (never in OneDrive). Google Play re-signs for distribution — that's why the fingerprint step above exists.
- Web deploys reach both apps instantly; new AABs are only needed for app-shell changes (Claude rebuilds: bump `appVersionCode` in the twa-manifest, `bubblewrap build`).
- Buildable projects: `C:\android-build\stella-admin-twa\` and `C:\android-build\stella-client-twa\`.
