# Firebase Push Notifications Setup Guide

This guide walks you through deploying the Firebase Cloud Functions that power push notifications for the Stella Admin app.

---

## What you're deploying

Three Cloud Functions that run automatically:
1. **subscribeAdmin** - Saves a device's push subscription when an admin enables notifications
2. **onBookingCreated** - Fires when a new booking is created → sends push to all admin devices
3. **onBookingCancelled** - Fires when a booking is cancelled → sends push to all admin devices

---

## Prerequisites

- Node.js 20+ installed
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

3. Set both keys as runtime environment variables for Firebase Functions. For Functions v2 you can use Google Cloud Secret Manager or set runtime environment variables:

   ```bash
   firebase functions:config:set \
     vapid.public="YOUR_PUBLIC_KEY_HERE" \
     vapid.private="YOUR_PRIVATE_KEY_HERE" \
     vapid.subject="mailto:admin@stellasports.co.za"
   ```

   Alternatively, set them via the Google Cloud Console under the Functions runtime environment as:

   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`

---

## Step 3: Deploy the Functions

```bash
firebase deploy --only functions
```

This will deploy:
- `subscribeAdmin`
- `unsubscribeAdmin`
- `onBookingCreated`
- `onBookingCancelled`

---

## Step 4: Deploy the Admin Frontend

Build and deploy the `dist-admin/` folder to Firebase Hosting.

---

## How It Works

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

---

## Troubleshooting

**No notifications received?**
- Check browser console for errors
- Verify VAPID keys are configured correctly
- Check Firebase Functions logs: `firebase functions:log`
- Ensure admin is logged in when enabling push
- On iOS: Must add PWA to Home Screen first (Safari 16.4+ only)

**Function deployment fails?**
- Make sure you're on Blaze plan (free tier includes 125K invocations/month)
- Check that `firebase.json` has the functions section
- Ensure `functions/package.json` has all dependencies
