import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, '../.env'), 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('='))
);

const API_KEY = env.VITE_FIREBASE_API_KEY;
const email = env.VITE_ADMIN_EMAIL;
const password = env.VITE_ADMIN_PASSWORD;

const auth = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }
).then((r) => r.json());

const res = await fetch(
  'https://firestore.googleapis.com/v1/projects/stella-indoor/databases/(default)/documents/adminSubscriptions',
  { headers: { Authorization: `Bearer ${auth.idToken}` } }
);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
