# Stella Indoor Project

This directory contains the Stella Indoor Sports Hub booking application, Raspberry Pi recording scripts, and deployment assets.

## Directory Layout

| Path | Purpose |
|---|---|
| `stella-indoor-source/` | **Active source code** (Vite + React). This is the source of truth for all builds. Also contains `FIREBASE_FUNCTIONS_SETUP.md`. |
| `stella-client-app/` | Current production build of the **client booking app** with an `admin.html` entry for combined Netlify deployments. |
| `stella-admin-attendance/` | Current production build of the **standalone admin dashboard**. |
| `archive/` | Old/duplicate builds and zip backups (kept for reference — do not deploy). |
| `README.md` | This file. |
| `.gitignore` | Git ignore rules for secrets and build artifacts. |
| `.env.example` | Example environment file for the Pi recorders. |
| `setup-pi.sh` | Raspberry Pi setup script. |
| `record.py` / `record-local.py` | Pi clip recorder scripts. |
| `requirements.txt` | Python dependencies for the Pi scripts. |

## Quick Start

```bash
cd stella-indoor-source
cp .env.example .env
# Edit .env and fill in your Firebase config, admin email/password, and VAPID public key
npm install
npm run build
```

After building, the outputs are:
- `stella-indoor-source/dist/` — client booking app
- `stella-indoor-source/dist-admin/` — admin dashboard

## Deployment

### Firebase Hosting (recommended)
The project is configured for two Firebase Hosting sites:
- `stella-indoor` — client booking app
- `stella-indoor-admin` — admin dashboard

Run `npm run deploy` from `stella-indoor-source/` after setting environment variables.

> **Note:** Netlify has been removed from this project. Use Firebase Hosting for deployment.

## Firebase Authentication Setup

The app now uses **Firebase Authentication** for both clients and admins.

### 1. Enable Authentication in Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/) → **Authentication**.
2. Click **Get started**.
3. Enable the **Email/Password** provider.
4. Save.

### 2. Create the first admin user
1. In Firebase Console → **Authentication** → **Users**.
2. Click **Add user**.
3. Enter the admin email (must match `VITE_ADMIN_EMAIL` in your `.env`) and a strong password.
4. Click **Add user**.

### 3. Mark the user as an admin in Firestore
1. Go to **Firestore Database**.
2. Create a collection called **`admins`**.
3. Add a document with the ID set to the admin email (e.g., `admin@stellasports.co.za`).
4. The document can be empty, or you can add fields like `role: 'admin'`.

> The `admins` collection is checked by Firestore security rules to determine admin access.

### 4. Deploy the Firestore rules
```bash
cd stella-indoor-source
firebase deploy --only firestore:rules
```

## Important Security Notes

- Firebase service-account keys were removed from this directory. If you previously shared this folder, **rotate the Firebase service-account key** in the Firebase Console.
- The admin password is read from the `VITE_ADMIN_PASSWORD` environment variable at build time. Set it before building and never commit it.
- The admin email is read from `VITE_ADMIN_EMAIL` at build time. It must match the email added in Firebase Authentication and the `admins` collection document ID.
- Firebase Functions VAPID keys are read from runtime environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Generate fresh keys and set them before deploying functions.
- Firestore security rules now enforce authentication and ownership. Make sure you deploy the rules after enabling Firebase Authentication.
