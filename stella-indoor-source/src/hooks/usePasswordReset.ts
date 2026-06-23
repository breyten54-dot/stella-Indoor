import { doc, setDoc, getDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const RESET_CODES_COLLECTION = 'passwordResetCodes';
const CODE_EXPIRY_MINUTES = 60;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create a password reset code and store in Firestore.
 * Returns the code (to be sent via email).
 */
export async function createResetCode(email: string): Promise<string> {
  const code = generateCode();
  const expiresAt = Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000;

  await setDoc(doc(db, RESET_CODES_COLLECTION, email.toLowerCase().trim()), {
    code,
    expiresAt: Timestamp.fromMillis(expiresAt),
    used: false,
    createdAt: Timestamp.fromMillis(Date.now()),
  });

  return code;
}

/**
 * Verify a reset code. Returns true if valid and not expired.
 */
export async function verifyResetCode(email: string, code: string): Promise<boolean> {
  const snap = await getDoc(doc(db, RESET_CODES_COLLECTION, email.toLowerCase().trim()));
  if (!snap.exists()) return false;

  const data = snap.data();
  if (data.used) return false;
  if (data.code !== code) return false;

  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : data.expiresAt;
  if (Date.now() > expiresAt) return false;

  return true;
}

/**
 * Mark a reset code as used.
 */
export async function markCodeUsed(email: string): Promise<void> {
  await deleteDoc(doc(db, RESET_CODES_COLLECTION, email.toLowerCase().trim()));
}
