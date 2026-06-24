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

const idToken = auth.idToken;

async function listDocs(collection) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/stella-indoor/databases/(default)/documents/${collection}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  const data = await res.json();
  return data.documents || [];
}

async function deleteDoc(name) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  console.log('deleted', name, 'status', res.status);
}

const bookings = await listDocs('bookings');
for (const doc of bookings) {
  if (doc.name.includes('smoke-test-booking')) await deleteDoc(doc.name);
}

const subs = await listDocs('adminSubscriptions');
for (const doc of subs) {
  if (doc.fields?.deviceInfo?.stringValue === 'CLI smoke test') await deleteDoc(doc.name);
}
