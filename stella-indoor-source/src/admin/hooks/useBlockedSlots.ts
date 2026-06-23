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
  isRecurring: boolean;  // true = every week on this day
  createdAt: number;
  createdBy: string;
  // Computed: which day of week (0-6) for recurring
  dayOfWeek?: number;
}

const COLLECTION = 'blockedSlots';

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
    const updateData: Record<string, unknown> = { ...data };
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

    const checkDate = new Date(date);
    const checkDayOfWeek = checkDate.getDay();

    for (const block of slots) {
      // Check court match
      if (block.courtId !== courtId) continue;

      // Check if block applies to this date
      let applies = false;

      if (block.isRecurring) {
        // Recurring: check if the day of week matches AND we're on or after start date
        if (block.dayOfWeek === checkDayOfWeek || new Date(block.startDate).getDay() === checkDayOfWeek) {
          const blockStart = new Date(block.startDate);
          // Set blockStart to the same day of week for comparison
          const weekDiff = Math.floor((checkDate.getTime() - blockStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
          if (weekDiff >= 0) {
            // Check if there's an end date
            if (block.endDate) {
              const blockEnd = new Date(block.endDate);
              if (checkDate <= blockEnd) {
                applies = true;
              }
            } else {
              // No end date = indefinite
              applies = true;
            }
          }
        }
      } else {
        // One-time: exact date match
        applies = block.startDate === date;
      }

      if (!applies) continue;

      // Check time overlap
      const [bStartH, bStartM] = block.startTime.split(':').map(Number);
      const [bEndH, bEndM] = block.endTime.split(':').map(Number);
      const blockStartMin = bStartH * 60 + bStartM;
      const blockEndMin = bEndH * 60 + bEndM;

      // Overlap check: slot starts before block ends AND slot ends after block starts
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
    const checkDate = new Date(date);
    const checkDayOfWeek = checkDate.getDay();

    return slots.filter(block => {
      if (block.courtId === '') return false; // Skip if no court

      if (block.isRecurring) {
        const blockStart = new Date(block.startDate);
        const weekDiff = Math.floor((checkDate.getTime() - blockStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weekDiff < 0) return false;
        if (block.endDate && checkDate > new Date(block.endDate)) return false;
        return (block.dayOfWeek ?? new Date(block.startDate).getDay()) === checkDayOfWeek;
      }

      return block.startDate === date;
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
