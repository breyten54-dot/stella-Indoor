import { LogOut, Home, Settings } from 'lucide-react';
import type { AuthState } from '@/types/booking';
import type { NotificationRecord } from '@/types/notification';
import { NotificationBell } from '@/components/NotificationBell';
import { ContactMenu } from '@/components/ContactMenu';
import { InstallButton } from '@/components/InstallButton';

interface NavbarProps {
  auth: AuthState;
  onLogout: () => void;
  onMyBookings?: () => void;
  onHighlights?: () => void;
  onHome?: () => void;
  onSettings?: () => void;
  notifications?: NotificationRecord[];
  unreadCount?: number;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onDeleteNotification?: (id: string) => void;
  onBookNow?: (n: NotificationRecord) => void;
}

export function Navbar({ auth, onLogout, onHome, onSettings, notifications, unreadCount, onMarkRead, onMarkAllRead, onDeleteNotification, onBookNow }: NavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#0A0A0A] border-b border-[#2A2A2A]">
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo-original.jpg" alt="Stella Indoor" className="w-8 h-8 rounded-full object-cover" />
          <span className="text-white font-extrabold text-base tracking-tight">STELLA INDOOR</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Home button (if onHome handler provided) */}
          {auth.isLoggedIn && onHome && (
            <button onClick={onHome}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-[#1B7A40] transition-colors active:scale-95"
              aria-label="Home" title="Home">
              <Home className="w-4 h-4" />
            </button>
          )}

          {/* Settings button (if onSettings handler provided) */}
          {auth.isLoggedIn && onSettings && (
            <button onClick={onSettings}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-[#1B7A40] transition-colors active:scale-95"
              aria-label="Settings" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Contact dropdown menu */}
          <ContactMenu />

          {/* Install button next to notification bell */}
          {auth.isLoggedIn && <InstallButton variant="icon" />}

          {auth.isLoggedIn && notifications && onMarkRead && onMarkAllRead && onDeleteNotification && (
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount || 0}
              onMarkRead={onMarkRead}
              onMarkAllRead={onMarkAllRead}
              onDelete={onDeleteNotification}
              onBookNow={onBookNow}
            />
          )}
          {auth.isLoggedIn && (
            <button onClick={onLogout}
              className="w-9 h-9 rounded-full border border-[#2A2A2A] flex items-center justify-center text-[#8A8A8A] hover:text-white hover:border-[#E53935] transition-colors active:scale-95"
              aria-label="Log out" title="Log out">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
