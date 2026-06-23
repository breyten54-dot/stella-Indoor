import { doc, setDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USERS_COLLECTION = 'users';

export interface UserProfile {
  email: string;
  name: string;
  phone: string;
  createdAt: number;
  banned?: boolean;
  missedBookings?: number;
  banReason?: string;
  attendedBookings?: number;
}

export async function createUserProfile(data: {
  email: string;
  name: string;
  phone: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const emailKey = data.email.toLowerCase().trim();
    const userRef = doc(db, USERS_COLLECTION, emailKey);

    const existing = await getDoc(userRef);
    if (existing.exists()) {
      const userData = existing.data() as UserProfile;
      if (userData.banned) {
        return { success: false, message: 'This account has been banned due to missing games' };
      }
      // Profile already exists — update name/phone in case they changed.
      await updateDoc(userRef, {
        name: data.name.trim(),
        phone: data.phone.trim(),
      });
      return { success: true, message: 'Profile updated successfully!' };
    }

    await setDoc(userRef, {
      email: emailKey,
      name: data.name.trim(),
      phone: data.phone.trim(),
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

export async function getUserProfile(email: string): Promise<UserProfile | null> {
  const emailKey = email.toLowerCase().trim();
  const snap = await getDoc(doc(db, USERS_COLLECTION, emailKey));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
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
    await updateDoc(userRef, {
      missedBookings: currentMissed,
      banned: true,
      banReason: 'Missed 3 bookings',
      name: 'BANNED',
      phone: '',
    });
    return { banned: true, missedCount: currentMissed };
  } else {
    await updateDoc(userRef, {
      missedBookings: currentMissed,
    });
    return { banned: false, missedCount: currentMissed };
  }
}
