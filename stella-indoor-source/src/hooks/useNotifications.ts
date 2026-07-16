import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, query, where, orderBy, writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

// Extended NotificationOptions for Chromium/Android-specific fields that TypeScript's
// DOM lib omits in some build configurations.
interface ExtendedNotificationOptions extends NotificationOptions {
  badge?: string;
  vibrate?: number[];
  renotify?: boolean;
  silent?: boolean;
}

// Show a browser notification
function showBrowserNotification(title: string, body: string, icon: string = '/logo-original.jpg') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const options: ExtendedNotificationOptions = {
      body,
      icon,
      // Android uses the badge as a MASK for the status-bar icon. It must be a
      // white-on-transparent silhouette; a colour photo renders as a plain white
      // square. badge-client-v2.png is a 96×96 monochrome client-logo silhouette.
      badge: '/badge-client-v2.png',
      tag: title,
      requireInteraction: true,
      vibrate: [300, 100, 300],
      renotify: true,
      silent: false,
    };
    new Notification(title, options);
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

      // Show browser notifications for new ones (not yet shown). Scheduled
      // reminders (scheduledFor in the future) must NOT fire here — the
      // 30s interval below fires them when their time arrives.
      const now = Date.now();
      data.filter(n => !n.shown && !n.read && (!n.scheduledFor || n.scheduledFor <= now)).forEach(n => {
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

// Server-side Cloud Functions now own notification lifecycle creation
// (createReminderNotifications / cleanupBookingSideEffects in functions/src/index.ts)
// so the client only reads and manages read/shown state.
