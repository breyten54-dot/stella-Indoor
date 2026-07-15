export type NotificationType =
  | 'admin-cancelled'
  | 'reminder-1h'
  | 'reminder-30m'
  | 'reminder-5m'
  | 'slot-released';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  userEmail: string;
  bookingId: string;
  courtName: string;
  date: string;
  startTime: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
  scheduledFor?: number; // For reminders — when to show
  shown?: boolean;       // Whether browser notification was shown
}

export interface NotificationState {
  notifications: NotificationRecord[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}
