// Shared teardown helper for Stella audit/debug/timing scripts.
// Deletes the Firebase Auth account and the Firestore `users/{email}` doc
// created by the test registration flow. Uses the Firebase REST API so we
// don't add a dependency on firebase/auth to tmp-audit.
import fs from 'fs';

const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';

function envVal(name) {
  const line = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find((l) => l.startsWith(name + '='));
  return line ? line.slice(name.length + 1).trim() : '';
}

const API_KEY = envVal('VITE_FIREBASE_API_KEY');
const PROJECT_ID = envVal('VITE_FIREBASE_PROJECT_ID');
const ADMIN_EMAIL = envVal('VITE_ADMIN_EMAIL');
const ADMIN_PASSWORD = envVal('VITE_ADMIN_PASSWORD');

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data.error?.message || data.raw || JSON.stringify(data);
    throw new Error(`Firebase request failed (${res.status}): ${msg}`);
  }
  return data;
}

export async function cleanupUser(email, password) {
  if (!email || !password) {
    console.log('[cleanup] no credentials, skipping');
    return;
  }
  const lowerEmail = email.toLowerCase().trim();
  try {
    // 1. Delete the Firestore user doc (requires admin token — rules only allow admin delete).
    const adminSignIn = await postJson(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, returnSecureToken: true },
    );
    const encodedEmail = encodeURIComponent(lowerEmail);
    const fsUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodedEmail}`;
    const fsRes = await fetch(fsUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminSignIn.idToken}` },
    });
    if (!fsRes.ok && fsRes.status !== 404) {
      const txt = await fsRes.text();
      throw new Error(`Firestore delete failed (${fsRes.status}): ${txt}`);
    }

    // 2. Delete the Firebase Auth account (the owner can delete their own account).
    const userSignIn = await postJson(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      { email: lowerEmail, password, returnSecureToken: true },
    );
    await postJson(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`,
      { idToken: userSignIn.idToken },
    );

    console.log(`[cleanup] removed ${email}`);
  } catch (err) {
    // If the user never existed or was already cleaned, don't fail the run.
    if (
      err.message.includes('INVALID_LOGIN_CREDENTIALS') ||
      err.message.includes('EMAIL_NOT_FOUND') ||
      err.message.includes('USER_DISABLED')
    ) {
      console.log(`[cleanup] ${email} already gone or credentials invalid, skipping`);
      return;
    }
    console.error(`[cleanup] failed for ${email}:`, err.message);
    // We intentionally do not throw — teardown failures should not mask test results.
  }
}
