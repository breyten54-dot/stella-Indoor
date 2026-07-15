# Design — Block-booking day release + client Web Push

**Date:** 2026-07-15 · **Author:** Claude (planner) · **Builder:** Kimi · **Status:** approved by user (conversation), pending spec review

## Goal

When a recurring block booking cancels for a single day, the admin releases that one occurrence
from the **Calendar** in one press. The slot becomes bookable by any client for that day only —
all future occurrences stay blocked — and **every client gets a push notification** (app open or
closed) that the slot is available. A booking made on a released day is a normal once-off booking.

This requires two parts: (1) the day-release mechanism, (2) true Web Push for the client app
(today, client pop-ups only fire while the app is open; `public/sw.js` has no push handler and
clients have no push subscriptions — verified 2026-07-15).

---

## Part 1 — Day-release quick switch

### Data model
- `blockedSlots` documents gain one optional field: `releasedDates: string[]` — local-timezone
  `YYYY-MM-DD` strings (same format used throughout; never derive via `toISOString`).
- No new collections. No changes to existing fields.

### Availability logic (single choke point)
- `blockAppliesToDate(block, date)` in `src/admin/hooks/useBlockedSlots.ts` gains one condition:
  returns `false` when `block.releasedDates?.includes(dateStr)`.
- **Verified 2026-07-15:** the client app imports this SAME function
  (`src/hooks/useFirestoreBookings.ts:15` → `import { blockAppliesToDate } from '@/admin/hooks/useBlockedSlots'`,
  applied at line 221) — so the one condition covers both apps automatically. No client-side duplication exists.
- Consequence (by construction): released day is bookable everywhere; every other occurrence
  untouched; next week auto-restores; block expiry/endDate logic unaffected.

### Admin UI — Calendar only (NOT Slot Control)
- `src/admin/pages/Calendar.tsx` already renders blocks per-date and opens `BlockDetailModal`
  on tap. The modal must receive the **date of the tapped cell** (pass the calendar's viewed date).
- In `BlockDetailModal`, for recurring blocks only, add:
  - **"Release for today"** button (label becomes "Release for this day" when the viewed date ≠ today).
  - One confirm step: "Release {weekday} {date}, {start}–{end}, {court} and notify all clients?"
  - After release: modal shows released state ("Released for this day — open to clients") and an
    **Undo** button.
- **Undo rule:** Undo (removes the date from `releasedDates`) is enabled ONLY while no confirmed
  booking exists for that court/date/time-range. Once booked, the booking wins — the modal shows
  "Booked by {name}" instead of Undo; reclaiming the slot = normal booking-cancel flow, then re-block.
- The released day's calendar cell renders as free (with the block gone for that date) — no special
  styling needed beyond the modal state.
- One-off (non-recurring) blocks do NOT get the button (deleting the block already covers them).
- Button only renders when the block actually applies to the viewed date (weekday match, within
  start/end range, not already released).

### Idempotency / edge rules
- Releasing an already-released date is a no-op (UI prevents it; write path guards it).
- Two clients racing for the freed slot: existing booking-conflict handling applies (first confirmed
  booking wins) — no new code.
- Released dates past the block's endDate are harmless (never consulted).

---

## Part 2 — Client Web Push (new capability, copies the proven admin pattern)

### Service worker
- `public/sw.js` gains `push` and `notificationclick` handlers — copy the pattern from
  `public/sw-admin.js` (which is battle-tested), adapted for the client origin:
  - `push`: `showNotification(title, { body, icon, badge, vibrate, tag, data })`.
  - `notificationclick`: focus or open the app at the URL in `data.url` (deep link).
- Keep the existing caching behavior of `sw.js` intact; bump its cache version per repo convention.

### Subscribe flow
- New `src/lib/clientPush.ts` (client-app counterpart of `src/admin/lib/pushNotifications.ts`):
  `subscribeToPush(email)` — permission is already requested on login (`useNotifications.ts`);
  extend that flow: on grant, `pushManager.subscribe` with the existing `VAPID_PUBLIC_KEY`
  (reuse `src/admin/lib/pushConfig.ts` — same VAPID pair for both apps), store the subscription in a
  NEW **`clientSubscriptions`** collection mirroring the `adminSubscriptions` schema
  (`functions/src/index.ts:130` shows the doc shape), keyed with `userEmail: <email>`. A separate
  collection (not a role flag in `adminSubscriptions`) keeps Firestore security rules clean:
  clients write only their own subscription docs, and the admin sender never scans client rows.
- Subscribe on login and re-validate on app open (same freshness pattern the admin app uses).
  Unsubscribe/cleanup on logout is out of scope (stale subscriptions get pruned on send failure —
  match `sendPushToAllAdmins`' 404/410 handling).

### Sender
- `functions/src/index.ts`: add `sendPushToAllClients(payload)` — mirror of `sendPushToAllAdmins`
  (line 35) reading `clientSubscriptions` instead of `adminSubscriptions`. Prune dead subscriptions
  on 404/410 exactly like the admin sender does (lines 72–84 pattern).
- Firestore rules: allow a signed-in client to create/update/delete only its own
  `clientSubscriptions` doc; deny cross-client reads.

---

## Part 3 — Release blast

- **Trigger:** Firestore `onDocumentUpdated` on `blockedSlots/{id}` (new Cloud Function
  `notifySlotReleased`). Compute `added = after.releasedDates − before.releasedDates`.
- For each newly added date:
  1. **Dedupe:** skip if a `releaseNotifications/{blockId_date}` marker doc exists; else create it
     (transaction). Guarantees ONE blast per block+date even across undo/re-release cycles.
  2. **Push to all clients** via `sendPushToAllClients`:
     - Title: `Slot just opened up! 🎾`
     - Body: `{Court} · {Weekday} {D Mon} · {start}–{end} — tap to book.`
     - `data.url`: client-app booking screen deep link (Kimi: use the client app's routing —
       land on the booking flow with the date preselected if the router supports it; plain app
       root is the acceptable fallback).
  3. **In-app notification docs:** also write per-client `notifications` docs (existing schema:
     type/userEmail/title/message/…) so clients WITHOUT push still see it in the notification
     center on next open. Write for all known client users (source: `users` collection emails).
- **No blast on Undo** (removed dates are ignored). No blast when a release is re-added after an
  undo on the same day (the marker doc already exists — accepted behavior, keeps spam impossible).

---

## Part 4 — Block payment note (admin-only viewing reference; added 2026-07-15, user request)

**Purpose:** whoever views a block booking on the Calendar can see how that club pays. An
editable reference note — NOT an accounting system; all values maintained by hand.

- **Storage:** NEW `blockNotes/{blockId}` collection — deliberately NOT fields on `blockedSlots`,
  because the client app reads that collection for availability and payment terms must not be
  client-readable. Fields:
  `paymentCadence: 'on-the-day' | 'monthly'` · `rate: number` (ZAR) · `paidToDate: number` (ZAR)
  · `updatedAt: number` · `updatedBy: string` (admin email).
- **Rules:** only authenticated admins read/write `blockNotes` (match the existing admin-gating
  pattern in `firestore.rules`). Emulator/rules test must prove a client CANNOT read it.
- **UI:** in `BlockDetailModal` (Calendar), a "Payment note" card for ANY block (recurring or
  one-off):
  - View mode: `Pays monthly · R750 · R4,500 paid to date` + "updated 15 Jul". Empty state:
    "No payment note yet — add one."
  - Edit: cadence toggle (On the day / Monthly) + two currency inputs, Save/Cancel. All three
    parts alterable at any time.
  - Display formatting: `R` prefix, thousands separators; store plain numbers.
- New hook `src/admin/hooks/useBlockNotes.ts` (get + upsert by blockId).

## Out of scope (explicitly)
- Migrating reminders/cancellation notices to client push (they stay Firestore/page-based; future unit).
- Any Slot Control page changes (feature lives on the Calendar).
- Waitlists, per-client targeting, email blasts.
- iOS-specific push work beyond what the standard Web Push path provides.

## Acceptance criteria (failable — Kimi verifies before review)
- [ ] Releasing a date on the Calendar makes that slot bookable in the CLIENT app for that date
      only; the next weekly occurrence remains blocked (E2E: create block → release → probe both dates).
- [ ] Undo restores the block for that date, and is refused/hidden once a confirmed booking exists.
- [ ] A client device with the app CLOSED receives the push (manual/device check, plus automated:
      subscription doc exists with `role:'client'`, function send returns success).
- [ ] Exactly one blast per block+date: releasing, undoing, re-releasing produces 1 marker doc and
      1 send (function logs/emulator assertion).
- [ ] In-app notification docs created for client users; appear in the client notification center.
- [ ] `npm run build` clean (tsc, dual-site); admin push (`sendPushToAllAdmins` consumers) unaffected.
- [ ] New E2E script in `Stella Project\testing-tools\` (self-cleaning, SW cache-busting — follow
      `slot-anchor-e2e.js` patterns) covering the release/undo/availability loop.
- [ ] Payment note: view→edit→save round-trip persists to `blockNotes/{blockId}` and re-renders
      formatted (cadence label + R amounts + updated date).
- [ ] Rules assertion: a non-admin client CANNOT read `blockNotes` (emulator rules test).

## Testing notes for the builder
- Local: Firebase emulator for the function trigger + dedupe transaction.
- Live verification of the SW/push half requires a deployed client SW — flag "needs Claude's
  prod step" in the review note for the deploy + on-device push confirmation.
- BUILD-STANDARDS #6 (SW cache-bust) and #4 (test teardown) apply directly here.
