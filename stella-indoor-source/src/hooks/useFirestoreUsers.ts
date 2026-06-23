import { doc, setDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USERS_COLLECTION = 'users';

export interface UserProfile {
  email: string;
  name: string;
  phone: string;
  password: string;
  createdAt: number;
  banned?: boolean;
  missedBookings?: number;
  banReason?: string;
  attendedBookings?: number;
}

export async function registerUser(data: {
  email: string;
  name: string;
  phone: string;
  password: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const emailKey = data.email.toLowerCase().trim();
    const userRef = doc(db, USERS_COLLECTION, emailKey);

    // Check if a banned user tries to re-register
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      const userData = existing.data() as UserProfile;
      if (userData.banned) {
        return { success: false, message: 'This account has been banned due to missing games' };
      }
      return { success: false, message: 'An account with this email already exists. Please sign in instead.' };
    }

    // Create new user
    await setDoc(userRef, {
      email: emailKey,
      name: data.name.trim(),
      phone: data.phone.trim(),
      password: data.password,
      createdAt: Date.now(),
      banned: false,
      missedBookings: 0,
      attendedBookings: 0,
    });

    return { success: true, message: 'Account created successfully!' };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('permission-denied') || errorMessage.includes('Missing or insufficient permissions')) {
      return { success: false, message: 'Firebase permission denied. Please set your Firestore security rules to allow reads and writes.' };
    }
    return { success: false, message: `Error: ${errorMessage}` };
  }
}

export async function loginUser(email: string, password: string): Promise<{ success: boolean; name: string; phone: string; message: string }> {
  try {
    const emailKey = email.toLowerCase().trim();
    const userRef = doc(db, USERS_COLLECTION, emailKey);

    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      return { success: false, name: '', phone: '', message: 'No account found with this email. Please register first.' };
    }

    const userData = snap.data() as UserProfile;

    // Check if user is banned FIRST — before password check
    if (userData.banned) {
      return { success: false, name: '', phone: '', message: 'This account has been banned due to missing games' };
    }

    // Then check password
    if (!userData.password || userData.password !== password) {
      return { success: false, name: '', phone: '', message: 'Incorrect password. Please try again.' };
    }

    return { success: true, name: userData.name, phone: userData.phone, message: 'Login successful!' };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('permission-denied') || errorMessage.includes('Missing or insufficient permissions')) {
      return { success: false, name: '', phone: '', message: 'Firebase permission denied. Please set your Firestore security rules to allow reads and writes.' };
    }
    return { success: false, name: '', phone: '', message: `Error: ${errorMessage}` };
  }
}

export async function getUserProfile(email: string): Promise<UserProfile | null> {
  const emailKey = email.toLowerCase().trim();
  const snap = await getDoc(doc(db, USERS_COLLECTION, emailKey));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

/**
 * Reset a user's password (used by the custom password reset flow)
 */
export async function resetUserPassword(email: string, newPassword: string): Promise<void> {
  const emailKey = email.toLowerCase().trim();
  const userRef = doc(db, USERS_COLLECTION, emailKey);
  await updateDoc(userRef, { password: newPassword });
}

/**
 * Mark a booking as attended (Played). Increments attendance counter.
 */
export async function markBookingPlayed(userEmail: string): Promise<void> {
  const emailKey = userEmail.toLowerCase().trim();
  const userRef = doc(db, USERS_COLLECTION, emailKey);
  await updateDoc(userRef, {
    attendedBookings: increment(1),
  });
}

/**
 * Mark a booking as missed. Increments missedBookings count.
 * Returns { banned: true } if user hits 3 misses and gets banned.
 */
export async function markBookingMissed(userEmail: string): Promise<{ banned: boolean; missedCount: number }> {
  const emailKey = userEmail.toLowerCase().trim();
  const userRef = doc(db, USERS_COLLECTION, emailKey);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    return { banned: false, missedCount: 0 };
  }

  const userData = snap.data() as UserProfile;
  const currentMissed = (userData.missedBookings ?? 0) + 1;

  if (currentMissed >= 3) {
    // Ban the user — keep the doc for ban lookup but clear personal data
    await updateDoc(userRef, {
      missedBookings: currentMissed,
      banned: true,
      banReason: 'Missed 3 bookings',
      name: 'BANNED',
      phone: '',
      password: '',
    });
    return { banned: true, missedCount: currentMissed };
  } else {
    await updateDoc(userRef, {
      missedBookings: currentMissed,
    });
    return { banned: false, missedCount: currentMissed };
  }
}
