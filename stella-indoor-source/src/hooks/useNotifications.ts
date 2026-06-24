import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, query, where, orderBy, writeBatch, setDoc, getDocs
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getErrorMessage } from '@/lib/error';
import type { NotificationRecord, NotificationType } from '@/types/notification';

const COLLECTION = 'notifications';

function docFromSnapshot(snap: { id: string; data: () => Record<string, unknown> }): NotificationRecord {
  const d = snap.data();
  return {
    id: snap.id,
    type: d.type as NotificationType,
    userEmail: d.userEmail as string,
    bookingId: d.bookingId as string,
    courtName: d.courtName as string,
    date: d.date as string,
    startTime: d.startTime as string,
    title: d.title as string,
    message: d.message as string,
    read: (d.read as boolean) || false,
    createdAt: d.createdAt as number,
    scheduledFor: d.scheduledFor as number | undefined,
    shown: (d.shown as boolean) || false,
  };
}

// Request browser notification permission
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

// Show a browser notification
function showBrowserNotification(title: string, body: string, icon: string = '/logo-original.jpg') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon,
      badge: icon,
      tag: title,
      requireInteraction: true,
    });
  } catch {
    // Silent fail
  }
}

export function useNotifications(userEmail: string | null) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Request permission on mount
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      setPermissionGranted(true);
    } else if (Notification.permission === 'default' && userEmail) {
      requestNotificationPermission().then(setPermissionGranted);
    }
  }, [userEmail]);

  // Subscribe to notifications for this user
  useEffect(() => {
    if (!userEmail) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const emailKey = userEmail.toLowerCase().trim();
    const q = query(
      collection(db, COLLECTION),
      where('userEmail', '==', emailKey),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(docFromSnapshot);
      setNotifications(data);

      // Show browser notifications for unread + unshown ones
      const unread = data.filter(n => !n.read);
      setUnreadCount(unread.length);

      // Show browser notifications for new ones (not yet shown)
      data.filter(n => !n.shown && !n.read).forEach(n => {
        showBrowserNotification(n.title, n.message);
        // Mark as shown (best effort)
        updateDoc(doc(db, COLLECTION, n.id), { shown: true }).catch((err) => {
          console.warn('[useNotifications] mark shown failed:', err);
        });
      });
    }, (err) => {
      console.warn('[useNotifications] snapshot error:', err);
    });

    return () => unsubscribe();
  }, [userEmail]);

  // Check for reminder notifications that are due
  useEffect(() => {
    if (!userEmail) return;

    const interval = setInterval(() => {
      const now = Date.now();
      notifications.forEach(n => {
        if (n.scheduledFor && !n.shown && !n.read && n.scheduledFor <= now) {
          showBrowserNotification(n.title, n.message);
          updateDoc(doc(db, COLLECTION, n.id), { shown: true }).catch((err) => {
            console.warn('[useNotifications] mark shown failed:', err);
          });
        }
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [notifications, userEmail]);

  const markRead = useCallback(async (id: string) => {
    await updateDoc(doc(db, COLLECTION, id), { read: true });
  }, []);

  const markAllRead = useCallback(async () => {
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, COLLECTION, n.id), { read: true });
    });
    await batch.commit();
  }, [notifications]);

  const deleteNotification = useCallback(async (id: string) => {
    await deleteDoc(doc(db, COLLECTION, id));
  }, []);

  return {
    notifications,
    unreadCount,
    permissionGranted,
    markRead,
    markAllRead,
    deleteNotification,
  };
}

// ---- Create a cancellation notification (called from admin) ----
export async function createCancellationNotification(
  userEmail: string,
  bookingId: string,
  courtName: string,
  date: string,
  startTime: string
): Promise<void> {
  const id = `cancel-${bookingId}-${Date.now()}`;
  await setDoc(doc(db, COLLECTION, id), {
    type: 'admin-cancelled',
    userEmail: userEmail.toLowerCase().trim(),
    bookingId,
    courtName,
    date,
    startTime,
    title: 'Booking Cancelled',
    message: `Your booking for ${courtName} on ${date} at ${startTime} has been cancelled by the admin.`,
    read: false,
    createdAt: Date.now(),
    shown: false,
  });
}

// ---- Schedule reminder notifications (called when booking is confirmed) ----
export async function scheduleBookingReminders(
  userEmail: string,
  bookingId: string,
  courtName: string,
  date: string,
  startTime: string
): Promise<void> {
  const emailKey = userEmail.toLowerCase().trim();

  // Parse booking start time
  const [h, m] = startTime.split(':').map(Number);
  const bookingDate = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  const bookingTimestamp = bookingDate.getTime();

  // Only schedule if booking is in the future
  if (bookingTimestamp <= Date.now()) return;

  const reminders = [
    { type: 'reminder-1h' as NotificationType, minutesBefore: 60, label: '1 hour' },
    { type: 'reminder-30m' as NotificationType, minutesBefore: 30, label: '30 minutes' },
    { type: 'reminder-5m' as NotificationType, minutesBefore: 5, label: '5 minutes' },
  ];

  for (const r of reminders) {
    const scheduledFor = bookingTimestamp - r.minutesBefore * 60 * 1000;
    // Only schedule if the reminder time is in the future
    if (scheduledFor > Date.now()) {
      const id = `reminder-${r.type}-${bookingId}`;
      await setDoc(doc(db, COLLECTION, id), {
        type: r.type,
        userEmail: emailKey,
        bookingId,
        courtName,
        date,
        startTime,
        title: 'Booking Reminder',
        message: `Your booking for ${courtName} on ${date} at ${startTime} is in ${r.label}.`,
        read: false,
        createdAt: Date.now(),
        scheduledFor,
        shown: false,
      });
    }
  }
}

// ---- Delete reminders for a cancelled booking ----
export async function deleteRemindersForBooking(bookingId: string): Promise<number> {
  console.log(`[Notifications] Deleting reminders for booking ${bookingId}`);
  let deletedCount = 0;

  // Query by bookingId field instead of hardcoded document IDs
  try {
    const q = query(
      collection(db, COLLECTION),
      where('bookingId', '==', bookingId)
    );
    const snapshot = await getDocs(q);
    console.log(`[Notifications] Found ${snapshot.docs.length} reminders for ${bookingId}`);

    for (const snap of snapshot.docs) {
      try {
        await deleteDoc(snap.ref);
        deletedCount++;
        console.log(`[Notifications] Deleted reminder: ${snap.id}`);
      } catch (err: unknown) {
        console.warn(`[Notifications] Could not delete ${snap.id}: ${getErrorMessage(err)}`);
      }
    }
  } catch (err: unknown) {
    console.error(`[Notifications] Query failed for booking ${bookingId}: ${getErrorMessage(err)}`);
  }

  console.log(`[Notifications] Deleted ${deletedCount} reminders for ${bookingId}`);
  return deletedCount;
}
