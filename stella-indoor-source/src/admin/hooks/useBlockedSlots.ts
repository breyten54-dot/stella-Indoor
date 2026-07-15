import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, addDoc, deleteDoc, updateDoc, doc, Timestamp, query, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type BlockType = 'block-booking' | 'closed' | 'maintenance';

export interface BlockedSlot {
  id: string;
  courtId: string;
  courtName: string;
  startDate: string;     // e.g. "2026-06-05"
  endDate: string | null; // null = indefinite
  startTime: string;     // e.g. "10:00"
  endTime: string;       // e.g. "12:00"
  type: BlockType;
  clientName?: string | null;  // For block bookings
  clientPhone?: string | null;
  clientEmail?: string | null;
  reason?: string | null;       // For closed/maintenance
  isRecurring: boolean;  // true = recurring on this day
  intervalWeeks?: number; // 1 = weekly, 2 = bi-weekly, etc. (default 1)
  exactDates?: string[]; // when set, block only applies on these specific YYYY-MM-DD dates
  overrides?: Record<string, boolean>; // per-date override: true = blocked, false = open
  createdAt: number;
  createdBy: string;
  // Computed: which day of week (0-6) for recurring
  dayOfWeek?: number;
}

const COLLECTION = 'blockedSlots';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Determine whether a block applies to a given YYYY-MM-DD date.
 * Order of precedence:
 * 1. Per-date override (if set)
 * 2. Exact-dates list (if set)
 * 3. Recurring rule with optional interval/end date
 * 4. One-time rule
 */
export function blockAppliesToDate(
  block: Pick<BlockedSlot, 'startDate' | 'endDate' | 'isRecurring' | 'dayOfWeek' | 'intervalWeeks' | 'exactDates' | 'overrides'>,
  date: string
): boolean {
  const overrides = block.overrides || {};
  if (overrides[date] !== undefined) {
    return overrides[date];
  }

  if (block.exactDates && block.exactDates.length > 0) {
    return block.exactDates.includes(date);
  }

  if (block.isRecurring) {
    const checkDate = new Date(date);
    const checkDay = checkDate.getDay();
    const blockDay = block.dayOfWeek ?? new Date(block.startDate).getDay();
    if (checkDay !== blockDay) return false;

    const blockStart = new Date(block.startDate);
    if (checkDate.getTime() < blockStart.getTime()) return false;

    if (block.endDate) {
      const blockEnd = new Date(block.endDate);
      if (checkDate.getTime() > blockEnd.getTime()) return false;
    }

    const weekDiff = Math.floor((checkDate.getTime() - blockStart.getTime()) / MS_PER_WEEK);
    const interval = block.intervalWeeks || 1;
    return weekDiff % interval === 0;
  }

  return block.startDate === date;
}

function docFromSnapshot(snap: { id: string; data: () => Record<string, unknown> }): BlockedSlot {
  const d = snap.data();
  return {
    id: snap.id,
    courtId: d.courtId as string,
    courtName: d.courtName as string,
    startDate: d.startDate as string,
    endDate: (d.endDate as string | null) ?? null,
    startTime: d.startTime as string,
    endTime: d.endTime as string,
    type: d.type as BlockType,
    clientName: (d.clientName as string | null) ?? null,
    clientPhone: (d.clientPhone as string | null) ?? null,
    clientEmail: (d.clientEmail as string | null) ?? null,
    reason: (d.reason as string | null) ?? null,
    isRecurring: (d.isRecurring as boolean) || false,
    intervalWeeks: (d.intervalWeeks as number | undefined) ?? undefined,
    exactDates: Array.isArray(d.exactDates) ? (d.exactDates as string[]) : undefined,
    overrides: d.overrides && typeof d.overrides === 'object'
      ? (d.overrides as Record<string, boolean>)
      : undefined,
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : (d.createdAt as number) || Date.now(),
    createdBy: (d.createdBy as string) || 'admin',
    dayOfWeek: (d.dayOfWeek as number) ?? undefined,
  };
}

export function useBlockedSlots() {
  const [slots, setSlots] = useState<BlockedSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(docFromSnapshot);
      setSlots(data);
      setLoading(false);
    }, () => {
      setSlots([]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const createBlockedSlot = useCallback(async (data: Omit<BlockedSlot, 'id' | 'createdAt'>): Promise<void> => {
    const dayOfWeek = new Date(data.startDate).getDay();
    await addDoc(collection(db, COLLECTION), {
      ...data,
      dayOfWeek,
      createdAt: Date.now(),
    });
  }, []);

  const deleteBlockedSlot = useCallback(async (id: string): Promise<void> => {
    await deleteDoc(doc(db, COLLECTION, id));
  }, []);

  const updateBlockedSlot = useCallback(async (id: string, data: Partial<Omit<BlockedSlot, 'id' | 'createdAt'>>): Promise<void> => {
    // Firestore rejects undefined field values, so only send fields that are set
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updateData[key] = value;
    }
    if (data.startDate) {
      updateData.dayOfWeek = new Date(data.startDate).getDay();
    }
    await updateDoc(doc(db, COLLECTION, id), updateData);
  }, []);

  // Check if a specific slot is blocked (used by booking app)
  const isSlotBlocked = useCallback((
    courtId: string,
    date: string,
    time: string,
    duration: number
  ): { blocked: boolean; reason?: string; blockInfo?: BlockedSlot } => {
    const [h, m] = time.split(':').map(Number);
    const slotStart = h * 60 + m;
    const slotEnd = slotStart + duration * 60;

    for (const block of slots) {
      if (block.courtId !== courtId) continue;
      if (!blockAppliesToDate(block, date)) continue;

      const [bStartH, bStartM] = block.startTime.split(':').map(Number);
      const [bEndH, bEndM] = block.endTime.split(':').map(Number);
      const blockStartMin = bStartH * 60 + bStartM;
      const blockEndMin = bEndH * 60 + bEndM;

      if (slotStart < blockEndMin && slotEnd > blockStartMin) {
        const reason = block.type === 'block-booking'
          ? `Block booking: ${block.clientName}`
          : block.reason || `Slot ${block.type}`;
        return { blocked: true, reason, blockInfo: block };
      }
    }

    return { blocked: false };
  }, [slots]);

  // Get all blocked slots for a specific date (for calendar view)
  const getBlocksForDate = useCallback((date: string): BlockedSlot[] => {
    return slots.filter(block => {
      if (!block.courtId) return false;
      return blockAppliesToDate(block, date);
    });
  }, [slots]);

  return {
    slots,
    loading,
    createBlockedSlot,
    deleteBlockedSlot,
    updateBlockedSlot,
    isSlotBlocked,
    getBlocksForDate,
  };
}
