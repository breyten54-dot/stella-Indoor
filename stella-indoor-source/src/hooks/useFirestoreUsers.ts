import { doc, setDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { BookingAttendance } from '@/types/booking';

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
 * Creates the user profile if it does not exist.
 */
export async function markBookingPlayed(userEmail: string): Promise<void> {
  const emailKey = userEmail.toLowerCase().trim();
  if (!emailKey) return;
  const userRef = doc(db, USERS_COLLECTION, emailKey);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      email: emailKey,
      name: '',
      phone: '',
      createdAt: Date.now(),
      banned: false,
      missedBookings: 0,
      attendedBookings: 1,
    });
    return;
  }
  await updateDoc(userRef, {
    attendedBookings: increment(1),
  });
}

/**
 * Mark a booking as missed. Increments missedBookings count.
 * Creates the user profile if it does not exist.
 * Returns { banned: true } if user hits 3 misses and gets banned.
 */
export async function markBookingMissed(userEmail: string): Promise<{ banned: boolean; missedCount: number }> {
  const emailKey = userEmail.toLowerCase().trim();
  if (!emailKey) return { banned: false, missedCount: 0 };
  const userRef = doc(db, USERS_COLLECTION, emailKey);
  const snap = await getDoc(userRef);

  let currentMissed: number;

  if (!snap.exists()) {
    currentMissed = 1;
    if (currentMissed >= 3) {
      await setDoc(userRef, {
        email: emailKey,
        name: 'BANNED',
        phone: '',
        createdAt: Date.now(),
        banned: true,
        banReason: 'Missed 3 bookings',
        missedBookings: currentMissed,
        attendedBookings: 0,
      });
      return { banned: true, missedCount: currentMissed };
    }
    await setDoc(userRef, {
      email: emailKey,
      name: '',
      phone: '',
      createdAt: Date.now(),
      banned: false,
      missedBookings: currentMissed,
      attendedBookings: 0,
    });
    return { banned: false, missedCount: currentMissed };
  }

  const userData = snap.data() as UserProfile;
  currentMissed = (userData.missedBookings ?? 0) + 1;

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

export interface AttendanceCorrectionResult {
  banned: boolean;
  missedCount: number;
  attendedCount: number;
}

/**
 * Adjust a user's attendance counters when an admin changes a booking's attendance status.
 * Handles incrementing/decrementing played/missed counts and auto-unbanning a client
 * when a missed booking is corrected and their missed count drops below 3.
 */
export async function adjustAttendanceCounters(
  userEmail: string,
  previous: BookingAttendance,
  next: BookingAttendance,
  restoreDetails?: { name: string; phone: string }
): Promise<AttendanceCorrectionResult> {
  const emailKey = userEmail.toLowerCase().trim();
  if (!emailKey || previous === next) {
    const profile = await getUserProfile(emailKey);
    return {
      banned: profile?.banned ?? false,
      missedCount: profile?.missedBookings ?? 0,
      attendedCount: profile?.attendedBookings ?? 0,
    };
  }

  const userRef = doc(db, USERS_COLLECTION, emailKey);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    // No profile yet — create a blank one and apply the net change.
    let attended = 0;
    let missed = 0;
    if (previous === 'pending' && next === 'played') attended = 1;
    else if (previous === 'pending' && next === 'missed') missed = 1;
    else if (previous === 'played' && next === 'missed') { attended = 0; missed = 1; }
    else if (previous === 'missed' && next === 'played') { attended = 1; missed = 0; }

    await setDoc(userRef, {
      email: emailKey,
      name: '',
      phone: '',
      createdAt: Date.now(),
      banned: missed >= 3,
      banReason: missed >= 3 ? 'Missed 3 bookings' : null,
      missedBookings: missed,
      attendedBookings: attended,
    });
    return { banned: missed >= 3, missedCount: missed, attendedCount: attended };
  }

  const userData = snap.data() as UserProfile;
  let attended = userData.attendedBookings ?? 0;
  let missed = userData.missedBookings ?? 0;
  let banned = userData.banned ?? false;
  let banReason: string | null = userData.banReason ?? null;
  let name = userData.name;
  let phone = userData.phone;

  // Reverse previous state
  if (previous === 'played') attended = Math.max(0, attended - 1);
  else if (previous === 'missed') missed = Math.max(0, missed - 1);

  // Apply new state
  if (next === 'played') attended += 1;
  else if (next === 'missed') missed += 1;

  // Ban / unban logic
  if (next === 'missed' && missed >= 3) {
    banned = true;
    banReason = 'Missed 3 bookings';
    name = 'BANNED';
    phone = '';
  } else if (previous === 'missed' && userData.banned && missed < 3) {
    // Unban by correcting a missed booking
    banned = false;
    banReason = null;
    name = restoreDetails?.name ?? userData.name;
    if (name === 'BANNED') name = '';
    phone = restoreDetails?.phone ?? userData.phone;
  }

  await updateDoc(userRef, {
    attendedBookings: attended,
    missedBookings: missed,
    banned,
    banReason,
    name,
    phone,
  });

  return { banned, missedCount: missed, attendedCount: attended };
}
