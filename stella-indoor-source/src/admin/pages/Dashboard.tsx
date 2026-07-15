import { useState, useMemo } from 'react';
import { useBodyScrollLock } from '@/admin/hooks/useBodyScrollLock';
import { CalendarDays, Clock, CreditCard, Users, TrendingUp, Phone } from 'lucide-react';
import type { BookingRecord, BookingAttendance } from '@/types/booking';
import type { DailyStats } from '../hooks/useAdminBookings';
import { BookingDetailModal } from '../components/BookingDetailModal';

interface Props {
  bookings: BookingRecord[];
  stats: { totalBookings: number; cancelledBookings: number; todayBookings: number; totalRevenue: number };
  dailyStats: DailyStats[];
  courtStats: { id: string; name: string; bookings: number; revenue: number }[];
  onAttendanceChange: (booking: BookingRecord, attendance: BookingAttendance) => Promise<void>;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="bg-[#13182b] rounded-2xl p-5 border border-[#1e293b] hover:border-[#334155] transition-colors">
      <div className="w-10 h-10 rounded-xl bg-[#6366f1]/10 flex items-center justify-center text-[#818cf8]">
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-black mt-3 tab-nums">{value}</p>
      <p className="text-xs text-[#64748b] font-medium uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

export function Dashboard({ bookings, stats, dailyStats, courtStats, onAttendanceChange }: Props) {
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
  useBodyScrollLock(selectedBooking !== null);

  const recent = useMemo(() =>
    [...bookings].filter(b => b.status === 'confirmed').sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
    [bookings]);

  const todayStr = new Date().toISOString().split('T')[0];
  const todays = useMemo(() =>
    bookings.filter(b => b.date === todayStr && b.status === 'confirmed').sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [bookings, todayStr]);

  const maxBookings = Math.max(...dailyStats.map(d => d.bookings), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Bookings" value={stats.totalBookings.toLocaleString()} icon={CalendarDays} />
        <StatCard label="Today" value={stats.todayBookings.toString()} icon={Clock} />
        <StatCard label="Cancelled" value={stats.cancelledBookings.toString()} icon={CreditCard} />
        <StatCard label="Revenue" value={`R${stats.totalRevenue.toLocaleString()}`} icon={Users} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#13182b] rounded-2xl border border-[#1e293b] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#94a3b8]">Bookings — Last 30 Days</h3>
            <TrendingUp className="w-4 h-4 text-[#6366f1]" />
          </div>
          <div className="flex items-end gap-[3px] h-40">
            {dailyStats.map((d, i) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="relative w-full flex justify-center">
                  <div className={`w-full max-w-[18px] rounded-sm ${d.bookings > 0 ? 'bg-[#6366f1]' : 'bg-[#1e293b]'}`}
                    style={{ height: `${Math.max((d.bookings / maxBookings) * 128, 4)}px`, opacity: 0.6 + (d.bookings / maxBookings) * 0.4 }} />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#1e293b] border border-[#334155] text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                    {d.date}: {d.bookings} bookings, R{d.revenue}
                  </div>
                </div>
                {i % 5 === 0 && <span className="text-[8px] text-[#475569]">{d.date.slice(8)}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-5">
          <h3 className="text-sm font-bold text-[#94a3b8] mb-4">Court Performance</h3>
          <div className="space-y-4">
            {courtStats.map(c => {
              const maxRev = Math.max(...courtStats.map(x => x.revenue), 1);
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <span className="text-xs text-[#64748b]">{c.bookings} bookings</span>
                  </div>
                  <div className="w-full h-2 bg-[#1e293b] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" style={{ width: `${(c.revenue / maxRev) * 100}%` }} />
                  </div>
                  <p className="text-xs text-[#818cf8] mt-1 tab-nums">R{c.revenue.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1e293b] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#94a3b8]">Recent Bookings</h3>
            <span className="text-[10px] text-[#475569] bg-[#1e293b] px-2 py-0.5 rounded-full">{recent.length} shown</span>
          </div>
          <div className="divide-y divide-[#1e293b]">
            {recent.length === 0 ? (
              <p className="text-sm text-[#64748b] text-center py-8">No bookings yet</p>
            ) : recent.map(b => (
              <div
                key={b.id}
                onClick={() => setSelectedBooking(b)}
                className="px-5 py-3 flex items-center justify-between hover:bg-[#1a2035] transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{b.clientDetails.fullName}</p>
                  <p className="text-xs text-[#64748b]">{b.courtName} — {b.date} at {b.startTime}</p>
                  {b.clientDetails.phone && (
                    <p className="text-[11px] text-[#475569] flex items-center gap-1 mt-0.5">
                      <Phone className="w-2.5 h-2.5" /> {b.clientDetails.phone}
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold text-[#818cf8] tab-nums shrink-0 ml-4">R{b.totalPrice}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1e293b]">
            <h3 className="text-sm font-bold text-[#94a3b8]">
              Today — {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
          </div>
          <div className="divide-y divide-[#1e293b]">
            {todays.length === 0 ? (
              <p className="text-sm text-[#64748b] text-center py-8">No bookings today</p>
            ) : todays.map(b => (
              <div
                key={b.id}
                onClick={() => setSelectedBooking(b)}
                className="px-5 py-3 flex items-center gap-3 hover:bg-[#1a2035] transition-colors cursor-pointer"
              >
                <div className="w-2 h-2 rounded-full shrink-0 bg-[#6366f1]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{b.startTime} — {b.endTime}</p>
                  <p className="text-xs text-[#64748b] truncate">{b.courtName} — {b.clientDetails.fullName}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-[#6366f1]/10 text-[#818cf8]">
                  CONFIRMED
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <BookingDetailModal
          booking={bookings.find(b => b.id === selectedBooking.id) ?? selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onCancel={async () => {}}
          onAttendanceChange={onAttendanceChange}
          allowCancel={false}
        />
      )}
    </div>
  );
}

