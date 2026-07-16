import { useState, useRef, useEffect } from 'react';
import { Bell, BellRing, Check, Trash2, Clock, AlertTriangle, Calendar } from 'lucide-react';
import type { NotificationRecord } from '@/types/notification';

interface Props {
  notifications: NotificationRecord[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof Clock; color: string; bgColor: string }> = {
  'admin-cancelled': { icon: AlertTriangle, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  'reminder-1h': { icon: Clock, color: 'text-[#7ED321]', bgColor: 'bg-[#1B7A40]/10' },
  'reminder-30m': { icon: Clock, color: 'text-[#22c55e]', bgColor: 'bg-[#22c55e]/10' },
  'reminder-5m': { icon: BellRing, color: 'text-[#7ED321]', bgColor: 'bg-[#1B7A40]/10' },
};

export function NotificationBell({ notifications, unreadCount, onMarkRead, onMarkAllRead, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-full bg-[#1B7A40] flex items-center justify-center text-white hover:bg-[#145C32] transition-colors active:scale-95"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E53935] text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-[#13182b] border border-[#1e293b] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-50 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
            <h3 className="text-sm font-bold text-white">Notifications</h3>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <button
                  onClick={() => { onMarkAllRead(); }}
                  className="p-1.5 rounded-lg hover:bg-[#1B7A40]/10 text-[#64748b] hover:text-[#7ED321] transition-colors"
                  title="Mark all read"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-8 h-8 text-[#1e293b] mx-auto mb-2" />
                <p className="text-xs text-[#64748b]">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const config = TYPE_CONFIG[n.type] || { icon: Bell, color: 'text-[#64748b]', bgColor: 'bg-[#1e293b]' };
                const Icon = config.icon;
                return (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.read) onMarkRead(n.id); }}
                    className={`px-4 py-3 border-b border-[#1e293b] last:border-0 cursor-pointer transition-colors ${n.read ? 'opacity-60' : `${config.bgColor} hover:bg-[#1B7A40]/5`}`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!n.read && <div className="w-2 h-2 rounded-full bg-[#7ED321] mt-1.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Icon className={`w-3 h-3 ${config.color}`} />
                          <span className={`text-[10px] font-bold ${config.color}`}>
                            {n.type === 'admin-cancelled' ? 'CANCELLED' : 'REMINDER'}
                          </span>
                          <span className="text-[9px] text-[#475569] ml-auto">
                            {new Date(n.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#cbd5e1] truncate">{n.title}</p>
                        <p className="text-[11px] text-[#64748b] mt-0.5 line-clamp-2">{n.message}</p>
                        <div className="flex items-center gap-1 mt-1 text-[9px] text-[#475569]">
                          <Calendar className="w-2.5 h-2.5" />
                          {n.courtName} &middot; {n.date} &middot; {n.startTime}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                        className="p-1 rounded hover:bg-red-500/10 text-[#475569] hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
