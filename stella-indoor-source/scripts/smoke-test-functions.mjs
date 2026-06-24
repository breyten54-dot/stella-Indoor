// Smoke-test Firebase Functions after deployment
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('='))
);

const API_KEY = env.VITE_FIREBASE_API_KEY;
const email = env.VITE_ADMIN_EMAIL;
const password = env.VITE_ADMIN_PASSWORD;

async function signIn() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!data.idToken) {
    throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  }
  return data.idToken;
}

async function createBooking(idToken) {
  const bookingId = `smoke-test-booking-${Date.now()}`;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/stella-indoor/databases/(default)/documents/bookings/${bookingId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          courtId: { stringValue: 'court-1' },
          courtName: { stringValue: 'Court 1' },
          date: { stringValue: '2026-06-25' },
          startTime: { stringValue: '10:00' },
          endTime: { stringValue: '11:00' },
          status: { stringValue: 'confirmed' },
          userEmail: { stringValue: email },
          clientDetails: {
            mapValue: {
              fields: {
                fullName: { stringValue: 'Smoke Test' },
                phone: { stringValue: '000' },
              },
            },
          },
        },
      }),
    }
  );
  return res.json();
}

const idToken = await signIn();
const result = await createBooking(idToken);
console.log(JSON.stringify(result, null, 2));
