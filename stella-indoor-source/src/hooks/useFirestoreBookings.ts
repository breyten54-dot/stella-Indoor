import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { BookingRecord, DurationOption, ClientDetails, Addons } from '@/types/booking';
import type { BlockedSlot } from '@/admin/hooks/useBlockedSlots';

const BLOCKED_SLOTS_COLLECTION = 'blockedSlots';

const BOOKINGS_COLLECTION = 'bookings';

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

  await setDoc(doc(db, BOOKINGS_COLLECTION, id), {
    ...booking,
    createdAt: Timestamp.fromMillis(booking.createdAt),
  });

  return booking;
}

// ---- Cancel a booking ----
export async function cancelBooking(id: string): Promise<void> {
  await updateDoc(doc(db, BOOKINGS_COLLECTION, id), {
    status: 'cancelled',
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

export async function getBookingsByCourtAndDate(courtId: string, date: string): Promise<BookingRecord[]> {
  const q = query(
    collection(db, BOOKINGS_COLLECTION),
    where('courtId', '==', courtId),
    where('date', '==', date)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docFromSnapshot).filter(b => b.status === 'confirmed');
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
  });
}

export function subscribeToUserBookings(email: string, callback: (bookings: BookingRecord[]) => void) {
  const q = query(collection(db, BOOKINGS_COLLECTION), where('userEmail', '==', email));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(docFromSnapshot);
    callback(bookings);
  });
}

export function subscribeToUserBookingsByUserId(userId: string, callback: (bookings: BookingRecord[]) => void) {
  const q = query(collection(db, BOOKINGS_COLLECTION), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(docFromSnapshot);
    callback(bookings);
  });
}

// ---- Blocked Slots Check ----

export async function getBlockedSlotsForCourtAndDate(courtId: string, date: string): Promise<BlockedSlot[]> {
  const q = query(collection(db, BLOCKED_SLOTS_COLLECTION), where('courtId', '==', courtId));
  const snapshot = await getDocs(q);
  const checkDate = new Date(date);
  const checkDayOfWeek = checkDate.getDay();

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
      createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : (d.createdAt as number) || Date.now(),
      createdBy: (d.createdBy as string) || 'admin',
      dayOfWeek: (d.dayOfWeek as number) ?? undefined,
    };
  }).filter(block => {
    // Check if block applies to this date
    if (block.isRecurring) {
      const blockStart = new Date(block.startDate);
      const weekDiff = Math.floor((checkDate.getTime() - blockStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weekDiff < 0) return false;
      if (block.endDate && checkDate > new Date(block.endDate)) return false;
      return (block.dayOfWeek ?? new Date(block.startDate).getDay()) === checkDayOfWeek;
    }
    return block.startDate === date;
  });
}

// ---- Overlap Check ----

export async function isSlotAvailable(
  courtId: string,
  date: string,
  startTime: string,
  duration: DurationOption
): Promise<boolean> {
  // Check existing confirmed bookings
  const existing = await getBookingsByCourtAndDate(courtId, date);

  const startDecimal = timeToDecimal(startTime);
  const endDecimal = startDecimal + duration;

  for (const booking of existing) {
    const bStart = timeToDecimal(booking.startTime);
    const bEnd = timeToDecimal(booking.endTime);
    if (startDecimal < bEnd && bStart < endDecimal) {
      return false;
    }
  }

  // Check blocked slots (block bookings, closed, maintenance)
  const blocked = await getBlockedSlotsForCourtAndDate(courtId, date);

  for (const block of blocked) {
    const bStart = timeToDecimal(block.startTime);
    const bEnd = timeToDecimal(block.endTime);
    if (startDecimal < bEnd && bStart < endDecimal) {
      return false;
    }
  }

  return true;
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
  };
}

function timeToDecimal(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + m / 60;
}
