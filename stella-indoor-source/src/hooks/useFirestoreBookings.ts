import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { BookingRecord, DurationOption, ClientDetails, Addons, CancellationSource } from '@/types/booking';
import { blockAppliesToDate, type BlockedSlot } from '@/admin/hooks/useBlockedSlots';

const BLOCKED_SLOTS_COLLECTION = 'blockedSlots';

const BOOKINGS_COLLECTION = 'bookings';

const CREATE_BOOKING_URL = import.meta.env.VITE_CREATE_BOOKING_FUNCTION_URL
  || 'https://europe-west1-stella-indoor.cloudfunctions.net/createBooking';

const GENERATE_INVITE_URL = import.meta.env.VITE_GENERATE_BOOKING_INVITE_FUNCTION_URL
  || 'https://europe-west1-stella-indoor.cloudfunctions.net/generateBookingInvite';

const JOIN_BOOKING_URL = import.meta.env.VITE_JOIN_BOOKING_INVITE_FUNCTION_URL
  || 'https://europe-west1-stella-indoor.cloudfunctions.net/joinBookingByInvite';

const BOOKING_INVITES_COLLECTION = 'bookingInvites';

// ---- Create a confirmed booking (cash payment) ----
export async function createConfirmedBooking(data: {
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: DurationOption;
  clientDetails: ClientDetails;
  addons: Addons;
  totalPrice: number;
  userEmail: string;
  userId?: string;
}): Promise<BookingRecord> {
  const now = Date.now();
  const id = `ST-${now.toString(36).toUpperCase()}`;

  const booking: BookingRecord = {
    id,
    courtId: data.courtId,
    courtName: data.courtName,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    duration: data.duration,
    status: 'confirmed',
    attendance: 'pending',
    createdAt: now,
    clientDetails: data.clientDetails,
    addons: data.addons,
    totalPrice: data.totalPrice,
    userEmail: data.userEmail,
    userId: data.userId,
  };

  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('User not authenticated');
  }

  const res = await fetch(CREATE_BOOKING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, idToken, id }),
  });

  const result = (await res.json()) as { success?: boolean; bookingId?: string; error?: string };
  if (!res.ok || !result.success) {
    throw new Error(result.error || `Booking failed (${res.status})`);
  }

  return booking;
}

// ---- Cancel a booking ----
// cancelledBy drives the server-side notification fan-out (functions/src/index.ts
// onBookingCancelled): 'admin' -> client gets in-app notice + email, no admin echo;
// 'client' -> admins get push, client gets confirmation email.
export async function cancelBooking(id: string, cancelledBy: 'client' | 'admin'): Promise<void> {
  await updateDoc(doc(db, BOOKINGS_COLLECTION, id), {
    status: 'cancelled',
    cancelledBy,
    cancelledAt: Date.now(),
  });
}

// ---- Check if cancellation is valid (>3 hours before booking) ----
export function canCancelBooking(date: string, startTime: string): boolean {
  const bookingStart = new Date(`${date}T${startTime}`);
  const cancelDeadline = new Date(bookingStart.getTime() - 3 * 60 * 60 * 1000);
  return Date.now() < cancelDeadline.getTime();
}

// ---- Delete a single booking ----
export async function deleteBooking(id: string): Promise<void> {
  await deleteDoc(doc(db, BOOKINGS_COLLECTION, id));
}

// ---- Delete ALL bookings (admin danger zone) ----
export async function deleteAllBookings(): Promise<void> {
  const snapshot = await getDocs(collection(db, BOOKINGS_COLLECTION));
  const promises = snapshot.docs.map(d => deleteDoc(d.ref));
  await Promise.all(promises);
}

// ---- Read Operations ----

export async function getBookingsByUser(email: string): Promise<BookingRecord[]> {
  const q = query(
    collection(db, BOOKINGS_COLLECTION),
    where('userEmail', '==', email)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docFromSnapshot);
}

export async function getBookingById(id: string): Promise<BookingRecord | null> {
  const snap = await getDoc(doc(db, BOOKINGS_COLLECTION, id));
  if (!snap.exists()) return null;
  return docFromSnapshot(snap);
}

// ---- Real-time Listeners ----

export function subscribeToBookings(callback: (bookings: BookingRecord[]) => void) {
  return onSnapshot(collection(db, BOOKINGS_COLLECTION), (snapshot) => {
    const bookings = snapshot.docs.map(docFromSnapshot).filter(b => b.status === 'confirmed');
    callback(bookings);
  }, (err) => {
    console.warn('[subscribeToBookings] snapshot error:', err);
  });
}

export function subscribeToUserBookings(email: string, callback: (bookings: BookingRecord[]) => void) {
  const lowerEmail = email.toLowerCase();
  const qOwner = query(collection(db, BOOKINGS_COLLECTION), where('userEmail', '==', lowerEmail));
  const qMember = query(collection(db, BOOKINGS_COLLECTION), where('members', 'array-contains', lowerEmail));

  let ownerBookings: BookingRecord[] = [];
  let memberBookings: BookingRecord[] = [];

  const merge = () => {
    const map = new Map<string, BookingRecord>();
    ownerBookings.forEach(b => map.set(b.id, b));
    memberBookings.forEach(b => map.set(b.id, b));
    callback(Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt));
  };

  const unsubscribeOwner = onSnapshot(qOwner, (snapshot) => {
    ownerBookings = snapshot.docs.map(docFromSnapshot);
    merge();
  }, (err) => {
    console.warn('[subscribeToUserBookings] owner snapshot error:', err);
  });

  const unsubscribeMember = onSnapshot(qMember, (snapshot) => {
    memberBookings = snapshot.docs.map(docFromSnapshot);
    merge();
  }, (err) => {
    console.warn('[subscribeToUserBookings] member snapshot error:', err);
  });

  return () => {
    unsubscribeOwner();
    unsubscribeMember();
  };
}

export function subscribeToUserBookingsByUserId(userId: string, callback: (bookings: BookingRecord[]) => void) {
  const q = query(collection(db, BOOKINGS_COLLECTION), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(docFromSnapshot);
    callback(bookings);
  }, (err) => {
    console.warn('[subscribeToUserBookingsByUserId] snapshot error:', err);
  });
}

// ---- Blocked Slots Check ----

export async function getBlockedSlotsForCourtAndDate(courtId: string, date: string): Promise<BlockedSlot[]> {
  const q = query(collection(db, BLOCKED_SLOTS_COLLECTION), where('courtId', '==', courtId));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((snap) => {
    const d = snap.data();
    return {
      id: snap.id,
      courtId: d.courtId as string,
      courtName: d.courtName as string,
      startDate: d.startDate as string,
      endDate: (d.endDate as string | null) ?? null,
      startTime: d.startTime as string,
      endTime: d.endTime as string,
      type: d.type as BlockedSlot['type'],
      clientName: (d.clientName as string) || undefined,
      clientPhone: (d.clientPhone as string) || undefined,
      clientEmail: (d.clientEmail as string) || undefined,
      reason: (d.reason as string) || undefined,
      isRecurring: (d.isRecurring as boolean) || false,
      intervalWeeks: (d.intervalWeeks as number | undefined) ?? undefined,
      exactDates: Array.isArray(d.exactDates) ? (d.exactDates as string[]) : undefined,
      overrides: d.overrides && typeof d.overrides === 'object'
        ? (d.overrides as Record<string, boolean>)
        : undefined,
      // Without this field the blockAppliesToDate guard never sees a release and
      // the client re-blocks slots the admin has opened (fixed 2026-07-16).
      releasedDates: Array.isArray(d.releasedDates) ? (d.releasedDates as string[]) : undefined,
      createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : (d.createdAt as number) || Date.now(),
      createdBy: (d.createdBy as string) || 'admin',
      dayOfWeek: (d.dayOfWeek as number) ?? undefined,
    };
  }).filter(block => blockAppliesToDate(block, date));
}

// ---- Court availability (server-side) ----
// Clients cannot query all bookings due to security rules, so we use a
// Cloud Function that returns only the booked time intervals.

const CHECK_SLOT_FUNCTION_URL = import.meta.env.VITE_CHECK_SLOT_FUNCTION_URL
  || 'https://europe-west1-stella-indoor.cloudfunctions.net/getCourtBookedIntervals';

export async function getCourtBookedIntervals(courtId: string, date: string): Promise<{ startTime: string; endTime: string }[]> {
  try {
    const response = await fetch(CHECK_SLOT_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courtId, date }),
    });

    if (!response.ok) {
      console.warn('[getCourtBookedIntervals] HTTP', response.status);
      return [];
    }

    const data = (await response.json()) as {
      success?: boolean;
      bookings?: { startTime: string; endTime: string }[];
      blocked?: { startTime: string; endTime: string }[];
      intervals?: { startTime: string; endTime: string }[];
    };

    return [
      ...(data.bookings || []),
      ...(data.blocked || []),
      ...(data.intervals || []),
    ];
  } catch (err) {
    console.error('[getCourtBookedIntervals] Error:', err);
    return [];
  }
}

// ---- Invite helpers ----

export async function generateBookingInvite(bookingId: string): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('User not authenticated');
  }

  const res = await fetch(GENERATE_INVITE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, bookingId }),
  });

  const result = (await res.json()) as { success?: boolean; token?: string; error?: string };
  if (!res.ok || !result.success || !result.token) {
    throw new Error(result.error || `Invite generation failed (${res.status})`);
  }
  return result.token;
}

export interface BookingInvite {
  bookingId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  uses: number;
  maxUses: number;
  active: boolean;
}

export async function getBookingInvite(token: string): Promise<BookingInvite | null> {
  const snap = await getDoc(doc(db, BOOKING_INVITES_COLLECTION, token));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    bookingId: data.bookingId as string,
    courtName: data.courtName as string,
    date: data.date as string,
    startTime: data.startTime as string,
    endTime: data.endTime as string,
    uses: (data.uses as number) || 0,
    maxUses: (data.maxUses as number) || 0,
    active: data.active !== false,
  };
}

export async function joinBookingByInvite(token: string): Promise<{ bookingId: string }> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('User not authenticated');
  }

  const res = await fetch(JOIN_BOOKING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, token }),
  });

  const result = (await res.json()) as { success?: boolean; bookingId?: string; error?: string };
  if (!res.ok || !result.success || !result.bookingId) {
    throw new Error(result.error || `Join booking failed (${res.status})`);
  }
  return { bookingId: result.bookingId };
}

// ---- Helpers ----

function docFromSnapshot(snap: { id: string; data: () => Record<string, unknown> }): BookingRecord {
  const data = snap.data();
  return {
    id: snap.id,
    courtId: data.courtId as string,
    courtName: data.courtName as string,
    date: data.date as string,
    startTime: data.startTime as string,
    endTime: data.endTime as string,
    duration: data.duration as DurationOption,
    status: data.status as 'confirmed' | 'cancelled',
    attendance: (data.attendance as 'pending' | 'played' | 'missed') || 'pending',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt as number,
    clientDetails: data.clientDetails as ClientDetails,
    addons: data.addons as Addons,
    totalPrice: data.totalPrice as number,
    userEmail: (data.userEmail as string) || '',
    userId: (data.userId as string) || undefined,
    members: (data.members as string[] | undefined) || undefined,
    cancelledBy: (data.cancelledBy as CancellationSource | undefined) || undefined,
  };
}

