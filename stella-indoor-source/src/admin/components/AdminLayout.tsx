import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { LayoutDashboard, Calendar, Users, Settings, LogOut, Menu, X, Loader2, Bell, BellRing, Check, Trash2, Ban } from 'lucide-react';
import type { BookingNotification } from '../hooks/useAdminBookings';

interface AdminUser {
  name: string;
  role: string;
}

interface Props {
  children: React.ReactNode;
  user: AdminUser;
  onLogout: () => void;
  loading: boolean;
  notifications: BookingNotification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onClearNotifications: () => void;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/blocked-slots', label: 'Slot Control', icon: Ban },
  // { path: '/clip-recorder', label: 'Clip Recorder', icon: Video },  // Removed per admin request
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout({ children, user, onLogout, loading, notifications, unreadCount, onMarkAllRead, onMarkRead, onClearNotifications }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close notification dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0f1e] text-white flex">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#13182b] border-r border-[#1e293b] flex flex-col
        transform transition-transform duration-300 lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-16 flex items-center gap-3 px-5 border-b border-[#1e293b]">
          <div className="w-9 h-9 rounded-lg overflow-hidden">
            <img src="/logo-admin.png" alt="Stella Admin" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-sm tracking-tight">Stella Admin</span>
          <button className="ml-auto lg:hidden text-[#64748b]" onClick={() => setSidebarOpen(false)}><X className="w-5 h-5" /></button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all
                  ${isActive ? 'bg-[#6366f1]/15 text-[#818cf8] border border-[#6366f1]/20' : 'text-[#64748b] hover:text-white hover:bg-[#1e293b]/50'}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#1e293b]">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-white">{user.name}</p>
            <p className="text-[10px] text-[#64748b]">{user.role}</p>
          </div>
          <button onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-[#13182b]/80 backdrop-blur border-b border-[#1e293b] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-[#64748b] hover:text-white p-1">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-bold lg:text-base">
            {navItems.find(n => n.path === location.pathname)?.label ?? 'Dashboard'}
          </h2>
          <div className="flex items-center gap-3">
            {loading && <Loader2 className="w-4 h-4 text-[#6366f1] animate-spin" />}

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative w-9 h-9 rounded-xl bg-[#1e293b] hover:bg-[#334155] flex items-center justify-center text-[#64748b] hover:text-white transition-all"
              >
                {unreadCount > 0 ? <BellRing className="w-4 h-4 text-[#818cf8]" /> : <Bell className="w-4 h-4" />}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E53935] text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 bg-[#13182b] border border-[#1e293b] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
                    <h3 className="text-sm font-bold">Notifications</h3>
                    <div className="flex items-center gap-1">
                      {notifications.length > 0 && (
                        <button onClick={onClearNotifications}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#64748b] hover:text-red-400 transition-colors"
                          title="Clear all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {unreadCount > 0 && (
                        <button onClick={onMarkAllRead}
                          className="p-1.5 rounded-lg hover:bg-[#6366f1]/10 text-[#64748b] hover:text-[#818cf8] transition-colors"
                          title="Mark all read">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {notifications.length === 0 ? (
                      <div className="text-center py-8">
                        <Bell className="w-8 h-8 text-[#1e293b] mx-auto mb-2" />
                        <p className="text-xs text-[#64748b]">No notifications yet</p>
                        <p className="text-[10px] text-[#475569] mt-1">New bookings will appear here</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => onMarkRead(n.id)}
                          className={`px-4 py-3 border-b border-[#1e293b] last:border-0 cursor-pointer transition-colors
                            ${n.read ? 'opacity-60' : 'bg-[#6366f1]/5 hover:bg-[#6366f1]/10'}`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read && <div className="w-2 h-2 rounded-full bg-[#6366f1] mt-1.5 shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{n.message}</p>
                              <p className="text-[10px] text-[#64748b] mt-0.5">{n.time}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold">
              {user.name.split(' ').map(w => w[0]).join('')}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
