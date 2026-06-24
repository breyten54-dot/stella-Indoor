# Firebase Cloud Functions Setup Guide

This guide walks you through deploying the Firebase Cloud Functions that power **push notifications** and **transactional emails** for Stella Indoor.

---

## What you're deploying

1. **subscribeAdmin** — Saves a device's push subscription when an admin enables notifications.
2. **unsubscribeAdmin** — Removes a device's push subscription.
3. **onBookingCreated** — Fires when a new booking is created → sends push to all admin devices.
4. **onBookingCancelled** — Fires when a booking is cancelled → sends push to all admin devices.
5. **sendEmail** — Sends transactional emails (booking confirmations, cancellations, password resets) via Brevo.

---

## Central secrets file

All API keys, access credentials, and runtime secrets for this project live in **`stella-indoor-source/.env.secrets`**.

- Copy `.env.secrets.example` to `.env.secrets` and fill in the real values.
- `.env.secrets` is gitignored — **never commit it**.
- When building or deploying, copy the relevant values from `.env.secrets` into:
  - `stella-indoor-source/.env` (client/admin build-time variables)
  - `stella-indoor-source/functions/.env` (Cloud Functions runtime variables)

---

## Prerequisites

- Node.js 22+ installed
- Firebase CLI installed: `npm install -g firebase-tools`
- Logged into Firebase: `firebase login`
- Your Firebase project initialized (you already have `firebase.json`)

---

## Step 1: Install Functions Dependencies

```bash
cd stella-indoor-source/functions
npm install
```

---

## Step 2: Generate and Configure VAPID Keys

The VAPID keys authenticate your server to the browser's push service. **Never commit the private key.**

1. Generate a fresh key pair:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Set the public key as a build-time environment variable and rebuild the admin app:

   ```bash
   # In stella-indoor-source/.env
   VITE_VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
   ```

   Then run `npm run build` from `stella-indoor-source/`.

3. Set both keys as runtime environment variables for Firebase Functions. The recommended way for v2 functions is to create a `functions/.env` file (gitignored):

   ```bash
   # stella-indoor-source/functions/.env
   VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
   VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE
   VAPID_SUBJECT=mailto:admin@stellasports.co.za
   ```

   Alternatively, set them via the Google Cloud Console under each Function's runtime environment as:

   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`

---

## Step 3: Configure Brevo Email

1. Sign up / log in at https://app.brevo.com.
2. Go to **SMTP & API → API Keys** and create a new API key.
3. Add the key to `functions/.env`:

   ```bash
   BREVO_API_KEY=YOUR_BREVO_API_KEY_HERE
   # Optional overrides:
   FROM_EMAIL=stellasportshub@gmail.com
   FROM_NAME=Stella Indoor Sports Hub
   ```

4. In `stella-indoor-source/.env`, point the client/admin builds at the deployed function:

   ```bash
   VITE_EMAIL_FUNCTION_URL=https://europe-west1-stella-indoor.cloudfunctions.net/sendEmail
   ```

---

## Step 4: Deploy the Functions

```bash
cd stella-indoor-source
firebase deploy --only functions
```

This will deploy:
- `subscribeAdmin`
- `unsubscribeAdmin`
- `onBookingCreated`
- `onBookingCancelled`
- `sendEmail`

---

## Step 5: Deploy the Admin Frontend

Build and deploy the `dist-admin/` folder to Firebase Hosting.

```bash
npm run build
firebase deploy --only hosting:stella-indoor-admin
```

---

## How Push Notifications Work

### When an admin enables push notifications:
1. Admin opens Settings → taps "Enable Push Notifications"
2. Browser requests notification permission
3. Service Worker (`sw-admin.js`) subscribes to push with VAPID public key
4. Subscription (endpoint + keys) is sent to `subscribeAdmin` Cloud Function
5. Function saves subscription to Firestore `adminSubscriptions` collection

### When a customer makes a booking:
1. New booking document created in Firestore `bookings` collection
2. `onBookingCreated` trigger fires automatically
3. Function reads all subscriptions from `adminSubscriptions`
4. Push notification sent to every subscribed admin device
5. Service worker on each device receives push → shows system notification

### When a booking is cancelled:
1. Booking document updated with `status: 'cancelled'`
2. `onBookingCancelled` trigger fires automatically
3. Same push flow as above with cancellation message

---

## Testing

1. Deploy everything (functions + frontend)
2. Open admin app on your phone → Settings → Enable Push Notifications
3. Make a booking from the client booking app
4. You should receive a system notification on your phone within seconds

To test email, make a booking or trigger a cancellation from the admin app while `VITE_EMAIL_FUNCTION_URL` is set.

---

## Troubleshooting

**No notifications received?**
- Check browser console for errors
- Verify VAPID keys are configured correctly
- Check Firebase Functions logs: `firebase functions:log`
- Ensure admin is logged in when enabling push
- On iOS: Must add PWA to Home Screen first (Safari 16.4+ only)

**Emails not sending?**
- Confirm `BREVO_API_KEY` is set in the `sendEmail` function environment
- Verify `VITE_EMAIL_FUNCTION_URL` points to the deployed function URL
- Check `firebase functions:log` for Brevo API errors

**Function deployment fails?**
- Make sure you're on Blaze plan (free tier includes 125K invocations/month)
- Check that `firebase.json` has the functions section
- Ensure `functions/package.json` has all dependencies
