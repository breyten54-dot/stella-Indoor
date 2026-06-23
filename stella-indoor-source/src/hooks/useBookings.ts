import { useEffect, useRef } from 'react';
import {
  createConfirmedBooking,
  cancelBooking as cancelBookingDb,
  canCancelBooking,
  isSlotAvailable as checkSlotAvailable,
  subscribeToBookings,
} from './useFirestoreBookings';
import type { BookingRecord, DurationOption } from '@/types/booking';

export function useBookings() {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToBookings(() => {});
    unsubscribeRef.current = unsubscribe;
    return () => unsubscribe();
  }, []);

  const createBooking = async (data: Parameters<typeof createConfirmedBooking>[0]): Promise<BookingRecord> => {
    return createConfirmedBooking(data);
  };

  const cancelUserBooking = async (id: string): Promise<void> => {
    await cancelBookingDb(id);
  };

  const isSlotAvailable = async (
    courtId: string,
    date: string,
    startTime: string,
    duration: DurationOption
  ): Promise<boolean> => {
    return checkSlotAvailable(courtId, date, startTime, duration);
  };

  const canCancel = (date: string, startTime: string): boolean => {
    return canCancelBooking(date, startTime);
  };

  return {
    createBooking,
    cancelUserBooking,
    isSlotAvailable,
    canCancel,
  };
}
