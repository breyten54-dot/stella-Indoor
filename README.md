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
# Edit .env and fill in your Firebase config, admin password, and VAPID public key
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

### Netlify (manual)
- Deploy `stella-client-app/` for the client booking app (includes `/admin` path).
- Deploy `stella-admin-attendance/` for the standalone admin dashboard.

## Important Security Notes

- Firebase service-account keys were removed from this directory. If you previously shared this folder, **rotate the Firebase service-account key** in the Firebase Console.
- The admin password is read from the `VITE_ADMIN_PASSWORD` environment variable at build time. Set it before building and never commit it.
- Firebase Functions VAPID keys are read from runtime environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Generate fresh keys and set them before deploying functions.
- Firestore rules now validate data shape but still allow public access because the app does not yet use Firebase Authentication. Add authentication and tighten rules before handling sensitive data.
