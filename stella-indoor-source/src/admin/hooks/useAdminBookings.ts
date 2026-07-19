import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { onSnapshot, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { localDateStr } from '@/lib/dates';
import type { BookingRecord, CancellationSource } from '@/types/booking';

export interface DailyStats {
  date: string;
  bookings: number;
  revenue: number;
}

export interface BookingNotification {
  id: string;
  message: string;
  bookingId: string;
  clientName: string;
  courtName: string;
  time: string;
  read: boolean;
  createdAt: number;
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
    cancelledBy: (data.cancelledBy as CancellationSource | undefined) || undefined,
  };
}

export function useAdminBookings(authReady: boolean) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<BookingNotification[]>([]);
  const prevBookings = useRef<BookingRecord[]>([]);
  const notifRequested = useRef(false);

  // Request browser notification permission on first load
  useEffect(() => {
    if (!notifRequested.current && 'Notification' in window) {
      notifRequested.current = true;
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    // Don't subscribe until admin auth is confirmed (K-15 — see useAdminClients).
    if (!authReady) return;
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const data = snapshot.docs.map(docFromSnapshot);
      const prevById = new Map(prevBookings.current.map(b => [b.id, b]));

      // Detect new confirmed bookings and cancellations
      const newBookings = data.filter(b => {
        const isNew = !prevById.has(b.id);
        const isConfirmed = b.status === 'confirmed';
        return isNew && isConfirmed && prevBookings.current.length > 0;
      });

      const cancelledBookings = data.filter(b => {
        const prev = prevById.get(b.id);
        return prev && prev.status === 'confirmed' && b.status === 'cancelled' && b.cancelledBy !== 'admin';
      });

      const changedBookings = [...newBookings, ...cancelledBookings];

      if (changedBookings.length > 0) {
        changedBookings.forEach(b => {
          const isCancelled = cancelledBookings.some(cb => cb.id === b.id);
          const message = isCancelled
            ? `${b.clientDetails.fullName} cancelled ${b.courtName}`
            : `${b.clientDetails.fullName} booked ${b.courtName}`;

          const notif: BookingNotification = {
            id: `notif-${b.id}-${Date.now()}`,
            message,
            bookingId: b.id,
            clientName: b.clientDetails.fullName,
            courtName: b.courtName,
            time: `${b.date} at ${b.startTime}`,
            read: false,
            createdAt: Date.now(),
          };
          setNotifications(prev => [notif, ...prev].slice(0, 50));

          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              const title = isCancelled ? 'Booking Cancelled — Stella Indoor' : 'New Booking — Stella Indoor';
              const options: NotificationOptions & { badge?: string; vibrate?: number[]; renotify?: boolean; silent?: boolean } = {
                body: `${b.clientDetails.fullName} ${isCancelled ? 'cancelled' : 'booked'} ${b.courtName} for ${b.date} at ${b.startTime}`,
                icon: '/logo-admin.png',
                // Android masks the badge into a status-bar icon; a colour photo
                // becomes a plain white square. badge-admin.png is a white crest
                // silhouette on transparency.
                badge: '/badge-admin.png',
                tag: b.id,
                requireInteraction: true,
                vibrate: [300, 100, 300],
                renotify: true,
                silent: false,
              };
              new Notification(title, options);
            } catch {
              // Browser notifications may fail silently
            }
          }
        });
      }

      prevBookings.current = data;
      setBookings(data);
      setError(null);
      setLoading(false);
    }, (err) => {
      // Fail LOUD, never silently zero (BUILD-STANDARDS #16)
      console.warn('[useAdminBookings] snapshot error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [authReady]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
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

  return {
    bookings, stats, loading, error, dailyStats, courtStats,
    notifications, unreadCount, markAllRead, markRead, clearNotifications,
  };
}
