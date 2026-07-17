import { useState, useEffect, useMemo } from 'react';
import { onSnapshot, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { localDateStr } from '@/lib/dates';
import type { BookingRecord } from '@/types/booking';

export interface DailyStats {
  date: string;
  bookings: number;
  revenue: number;
}

function docFromSnapshot(snap: { id: string; data: () => Record<string, unknown> }): BookingRecord {
  const data = snap.data();
  return {
    id: snap.id,
    courtId: data.courtId as string,
    courtName: data.courtName as string,
    date: data.date as string,
    startTime: data.startTime as string,
    endTime: data.endTime as string,
    duration: data.duration as 1 | 1.5 | 2,
    status: data.status as 'confirmed' | 'cancelled',
    attendance: (data.attendance as 'pending' | 'played' | 'missed') || 'pending',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt as number,
    clientDetails: data.clientDetails as BookingRecord['clientDetails'],
    addons: data.addons as BookingRecord['addons'],
    totalPrice: data.totalPrice as number,
    userEmail: (data.userEmail as string) || '',
  };
}

export function useAdminBookings() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const data = snapshot.docs.map(docFromSnapshot);
      setBookings(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    const confirmed = bookings.filter(b => b.status === 'confirmed');
    return {
      totalBookings: confirmed.length,
      cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
      todayBookings: confirmed.filter(b => {
        const today = localDateStr(new Date());
        return b.date === today;
      }).length,
      totalRevenue: confirmed.reduce((s, b) => s + b.totalPrice, 0),
    };
  }, [bookings]);

  const dailyStats = useMemo((): DailyStats[] => {
    const map = new Map<string, { bookings: number; revenue: number }>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      map.set(localDateStr(d), { bookings: 0, revenue: 0 });
    }
    bookings.filter(b => b.status === 'confirmed').forEach(b => {
      const existing = map.get(b.date);
      if (existing) { existing.bookings += 1; existing.revenue += b.totalPrice; }
    });
    return Array.from(map.entries()).map(([date, data]) => ({ date, ...data }));
  }, [bookings]);

  const courtStats = useMemo(() => {
    const courts = [
      { id: 'big-court', name: 'Big Court' },
      { id: 'multi-1', name: 'Multipurpose 1' },
      { id: 'multi-2', name: 'Multipurpose 2' },
    ];
    return courts.map(c => ({
      ...c,
      bookings: bookings.filter(b => b.courtId === c.id && b.status === 'confirmed').length,
      revenue: bookings.filter(b => b.courtId === c.id && b.status === 'confirmed').reduce((s, b) => s + b.totalPrice, 0),
    }));
  }, [bookings]);

  return { bookings, stats, loading, dailyStats, courtStats };
}
