import { useState } from 'react';
import { useBodyScrollLock } from '@/admin/hooks/useBodyScrollLock';
import { ModalPortal } from '@/admin/components/ModalPortal';
import {
  ChevronLeft, ChevronRight,
  LayoutGrid, Columns3, Calendar as CalIcon, Repeat,
  Ban, Clock, Lock, Phone, User, FileText, X
} from 'lucide-react';
import type { BookingRecord } from '@/types/booking';
import type { BlockedSlot } from '../hooks/useBlockedSlots';
import { BookingDetailModal } from '../components/BookingDetailModal';

type CalendarView = 'day' | 'week' | 'month';

interface Props {
  bookings: BookingRecord[];
  blockedSlots: BlockedSlot[];
  onCancelBooking: (booking: BookingRecord) => Promise<void>;
  onPlayed: (booking: BookingRecord) => Promise<void>;
  onMissed: (booking: BookingRecord) => Promise<{ banned: boolean; missedCount: number }>;
}

const COURTS = [
  { id: 'big-court', name: 'Big Court', color: 'bg-[#6366f1]', textColor: 'text-[#818cf8]', bgSoft: 'bg-[#6366f1]/10', borderSoft: 'border-[#6366f1]/20' },
  { id: 'multi-1', name: 'Multipurpose 1', color: 'bg-[#8b5cf6]', textColor: 'text-[#a78bfa]', bgSoft: 'bg-[#8b5cf6]/10', borderSoft: 'border-[#8b5cf6]/20' },
  { id: 'multi-2', name: 'Multipurpose 2', color: 'bg-[#ec4899]', textColor: 'text-[#f472b6]', bgSoft: 'bg-[#ec4899]/10', borderSoft: 'border-[#ec4899]/20' },
];

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function jsDayToIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

interface CalendarEntry {
  type: 'booking' | 'blocked';
  data: BookingRecord | BlockedSlot;
}

function getEntriesForSlot(
  date: string,
  hour: number,
  courtId: string,
  bookings: BookingRecord[],
  blockedSlots: BlockedSlot[]
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  bookings.filter(b => b.status === 'confirmed').forEach(b => {
    if (b.courtId !== courtId) return;
    if (b.date !== date) return;
    const startH = parseInt(b.startTime.split(':')[0]);
    const endH = parseInt(b.endTime.split(':')[0]);
    if (hour >= startH && hour < endH) {
      entries.push({ type: 'booking', data: b });
    }
  });

  blockedSlots.forEach(block => {
    if (block.courtId !== courtId) return;
    let applies = false;
    const checkDate = new Date(date);
    if (block.isRecurring) {
      const blockDayIndex = jsDayToIndex(block.dayOfWeek ?? new Date(block.startDate).getDay());
      const checkDayIndex = jsDayToIndex(checkDate.getDay());
      if (blockDayIndex === checkDayIndex) {
        const blockStart = new Date(block.startDate);
        const weekDiff = Math.floor((checkDate.getTime() - blockStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weekDiff >= 0) {
          if (block.endDate) {
            if (checkDate <= new Date(block.endDate)) applies = true;
          } else {
            applies = true;
          }
        }
      }
    } else {
      applies = block.startDate === date;
    }
    if (!applies) return;
    const startH = parseInt(block.startTime.split(':')[0]);
    const endH = parseInt(block.endTime.split(':')[0]);
    if (hour >= startH && hour < endH) {
      entries.push({ type: 'blocked', data: block });
    }
  });

  return entries;
}

// ---- SlotCell with click handler for bookings & blocks ----
function SlotCell({ entries, courtId, onBookingClick, onBlockClick }: { entries: CalendarEntry[]; courtId: string; onBookingClick?: (booking: BookingRecord) => void; onBlockClick?: (block: BlockedSlot) => void }) {
  const court = COURTS.find(c => c.id === courtId);

  if (entries.length === 0) {
    return <div className="h-full min-h-[52px] hover:bg-[#1a2035]/50 transition-colors" />;
  }

  const entry = entries[0];

  if (entry.type === 'booking') {
    const b = entry.data as BookingRecord;
    return (
      <div
        onClick={() => onBookingClick?.(b)}
        className={`h-full min-h-[52px] ${court?.bgSoft} ${court?.borderSoft} border rounded-lg p-1.5 flex flex-col justify-center gap-0.5 cursor-pointer hover:opacity-80 hover:ring-1 hover:ring-[#818cf8]/30 transition-all`}
      >
        <span className={`text-[9px] font-bold ${court?.textColor} truncate`}>
          {b.clientDetails.fullName}
        </span>
        <span className="text-[8px] text-[#64748b]">
          {b.startTime}—{b.endTime} ({b.duration}h)
        </span>
      </div>
    );
  }

  const block = entry.data as BlockedSlot;
  const blockColors = {
    'block-booking': { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
    'closed': { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
    'maintenance': { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  };
  const colors = blockColors[block.type];
  const label = block.type === 'block-booking' ? 'Block' : block.type === 'closed' ? 'Closed' : 'Maint.';

  return (
    <div
      onClick={() => onBlockClick?.(block)}
      className={`h-full min-h-[52px] ${colors.bg} ${colors.border} border rounded-lg p-1.5 flex flex-col justify-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity`}
    >
      <span className={`text-[9px] font-bold ${colors.text} truncate flex items-center gap-0.5`}>
        {block.isRecurring && <Repeat className="w-2 h-2" />}
        {label}
      </span>
      {block.type === 'block-booking' && block.clientName && (
        <span className="text-[8px] text-[#64748b] truncate">{block.clientName}</span>
      )}
      {(block.type === 'closed' || block.type === 'maintenance') && block.reason && (
        <span className="text-[8px] text-[#64748b] truncate">{block.reason}</span>
      )}
    </div>
  );
}

// ---- Time grid rows ----
function TimeGridRows({
  columns,
  getCellEntries,
  onBookingClick,
  onBlockClick,
}: {
  columns: { label: string; sublabel?: string }[];
  getCellEntries: (colIndex: number, hour: number) => CalendarEntry[];
  onBookingClick: (booking: BookingRecord) => void;
  onBlockClick: (block: BlockedSlot) => void;
}) {
  return (
    <div className="divide-y divide-[#1e293b]">
      {HOURS.map(hour => (
        <div key={hour} className="grid" style={{ gridTemplateColumns: `60px repeat(${columns.length}, 1fr)` }}>
          <div className="p-2 border-r border-[#1e293b] bg-[#0b0f1e] flex items-start justify-center pt-3">
            <span className="text-[11px] font-semibold text-[#475569] tab-nums">
              {hour.toString().padStart(2, '0')}:00
            </span>
          </div>
          {columns.map((col, colIndex) => (
            <div key={col.label} className="p-1 border-r border-[#1e293b] last:border-r-0">
              <SlotCell
                entries={getCellEntries(colIndex, hour)}
                courtId={COURTS[colIndex]?.id || ''}
                onBookingClick={onBookingClick}
                onBlockClick={onBlockClick}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export function Calendar({ bookings, blockedSlots, onCancelBooking, onPlayed, onMissed }: Props) {
  const [view, setView] = useState<CalendarView>('day');
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<BlockedSlot | null>(null);
  useBodyScrollLock(selectedBooking !== null || selectedBlock !== null);

  const todayStr = new Date().toISOString().split('T')[0];

  const prevDay = () => setViewDate(d => { const nd = new Date(d); nd.setDate(d.getDate() - 1); return nd; });
  const nextDay = () => setViewDate(d => { const nd = new Date(d); nd.setDate(d.getDate() + 1); return nd; });
  const goToday = () => setViewDate(new Date());

  const prevWeek = () => setViewDate(d => { const nd = new Date(d); nd.setDate(d.getDate() - 7); return nd; });
  const nextWeek = () => setViewDate(d => { const nd = new Date(d); nd.setDate(d.getDate() + 7); return nd; });

  const prevMonth = () => setViewDate(d => { const nd = new Date(d); nd.setMonth(d.getMonth() - 1); return nd; });
  const nextMonth = () => setViewDate(d => { const nd = new Date(d); nd.setMonth(d.getMonth() + 1); return nd; });

  const currentDateStr = viewDate.toISOString().split('T')[0];

  // ---- DAY VIEW ----
  if (view === 'day') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={prevDay} className="w-9 h-9 rounded-xl bg-[#13182b] border border-[#1e293b] hover:border-[#6366f1] flex items-center justify-center text-[#64748b] hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-lg font-black">
                {viewDate.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h2>
              {currentDateStr === todayStr && <span className="text-[10px] font-bold text-[#6366f1]">TODAY</span>}
            </div>
            <button onClick={nextDay} className="w-9 h-9 rounded-xl bg-[#13182b] border border-[#1e293b] hover:border-[#6366f1] flex items-center justify-center text-[#64748b] hover:text-white transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={goToday} className="h-9 px-3 rounded-xl bg-[#1e293b] text-[#64748b] hover:text-white text-xs font-bold transition-colors">
              Today
            </button>
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>

        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] overflow-hidden">
          <div className="grid grid-cols-4 border-b border-[#1e293b]">
            <div className="p-3 border-r border-[#1e293b] bg-[#0b0f1e]">
              <span className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Time</span>
            </div>
            {COURTS.map(c => (
              <div key={c.id} className="p-3 text-center border-r border-[#1e293b] last:border-r-0">
                <div className={`w-3 h-3 rounded-full ${c.color} mx-auto mb-1`} />
                <p className="text-xs font-bold text-[#94a3b8]">{c.name}</p>
              </div>
            ))}
          </div>

          <TimeGridRows
            columns={COURTS.map(c => ({ label: c.name }))}
            getCellEntries={(colIndex, hour) =>
              getEntriesForSlot(currentDateStr, hour, COURTS[colIndex].id, bookings, blockedSlots)
            }
            onBookingClick={setSelectedBooking}
            onBlockClick={setSelectedBlock}
          />
        </div>

        {selectedBooking && (
          <BookingDetailModal
            booking={selectedBooking}
            onClose={() => setSelectedBooking(null)}
            onCancel={onCancelBooking}
            onPlayed={onPlayed}
            onMissed={onMissed}
          />
        )}

        {/* Block Detail Modal */}
        {selectedBlock && (
          <BlockDetailModal block={selectedBlock} onClose={() => setSelectedBlock(null)} />
        )}
      </div>
    );
  }

  // ---- WEEK VIEW ----
  if (view === 'week') {
    const weekStart = new Date(viewDate);
    weekStart.setDate(viewDate.getDate() - viewDate.getDay() + (viewDate.getDay() === 0 ? -6 : 1));
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={prevWeek} className="w-9 h-9 rounded-xl bg-[#13182b] border border-[#1e293b] hover:border-[#6366f1] flex items-center justify-center text-[#64748b] hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-lg font-black">
              {weekDays[0].toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
            </h2>
            <button onClick={nextWeek} className="w-9 h-9 rounded-xl bg-[#13182b] border border-[#1e293b] hover:border-[#6366f1] flex items-center justify-center text-[#64748b] hover:text-white transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={goToday} className="h-9 px-3 rounded-xl bg-[#1e293b] text-[#64748b] hover:text-white text-xs font-bold transition-colors">
              This Week
            </button>
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>

        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] overflow-hidden">
          <div className="grid grid-cols-8 border-b border-[#1e293b]">
            <div className="p-3 border-r border-[#1e293b] bg-[#0b0f1e]">
              <span className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Time</span>
            </div>
            {weekDays.map((d, i) => {
              const dateStr = d.toISOString().split('T')[0];
              const isToday = dateStr === todayStr;
              return (
                <div key={i} className={`p-3 text-center border-r border-[#1e293b] last:border-r-0 ${isToday ? 'bg-[#6366f1]/5' : ''}`}>
                  <p className={`text-xs font-bold ${isToday ? 'text-[#818cf8]' : 'text-[#94a3b8]'}`}>{DAYS_SHORT[d.getDay()]}</p>
                  <p className={`text-[10px] ${isToday ? 'text-[#6366f1]' : 'text-[#475569]'}`}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-[#1e293b]">
            {HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-8">
                <div className="p-2 border-r border-[#1e293b] bg-[#0b0f1e] flex items-start justify-center pt-3">
                  <span className="text-[11px] font-semibold text-[#475569] tab-nums">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
                {weekDays.map((day, dayIndex) => {
                  const dateStr = day.toISOString().split('T')[0];
                  const entries = [
                    ...getEntriesForSlot(dateStr, hour, 'big-court', bookings, blockedSlots),
                    ...getEntriesForSlot(dateStr, hour, 'multi-1', bookings, blockedSlots),
                    ...getEntriesForSlot(dateStr, hour, 'multi-2', bookings, blockedSlots),
                  ];

                  return (
                    <div key={dayIndex} className="p-1 border-r border-[#1e293b] last:border-r-0">
                      {entries.length > 0 ? (
                        <div className="space-y-0.5">
                          {entries.slice(0, 2).map((entry, ei) => {
                            if (entry.type === 'booking') {
                              const b = entry.data as BookingRecord;
                              const court = COURTS.find(c => c.id === b.courtId);
                              return (
                                <div
                                  key={ei}
                                  onClick={() => setSelectedBooking(b)}
                                  className={`text-[8px] px-1 py-0.5 rounded ${court?.bgSoft} ${court?.textColor} truncate font-bold cursor-pointer hover:opacity-80 transition-opacity`}
                                >
                                  {court?.name?.replace('Multipurpose ', 'M')}: {b.clientDetails.fullName.split(' ')[0]}
                                </div>
                              );
                            } else {
                              const block = entry.data as BlockedSlot;
                              const court = COURTS.find(c => c.id === block.courtId);
                              const colors = block.type === 'block-booking' ? 'bg-amber-500/10 text-amber-400' : block.type === 'closed' ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400';
                              return (
                                <div
                                  key={ei}
                                  onClick={() => setSelectedBlock(block)}
                                  className={`text-[8px] px-1 py-0.5 rounded ${colors} truncate font-bold cursor-pointer hover:opacity-80 transition-opacity`}
                                >
                                  {court?.name?.replace('Multipurpose ', 'M')}: {block.type === 'block-booking' ? 'Block' : block.type === 'closed' ? 'Closed' : 'Maint'}
                                </div>
                              );
                            }
                          })}
                          {entries.length > 2 && (
                            <span className="text-[8px] text-[#64748b] pl-1">+{entries.length - 2} more</span>
                          )}
                        </div>
                      ) : (
                        <div className="h-full min-h-[40px] hover:bg-[#1a2035]/50 transition-colors" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {selectedBooking && (
          <BookingDetailModal
            booking={selectedBooking}
            onClose={() => setSelectedBooking(null)}
            onCancel={onCancelBooking}
            onPlayed={onPlayed}
            onMissed={onMissed}
          />
        )}

        {/* Block Detail Modal */}
        {selectedBlock && (
          <BlockDetailModal block={selectedBlock} onClose={() => setSelectedBlock(null)} />
        )}
      </div>
    );
  }

  // ---- MONTH VIEW ----
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const safeBlocks = Array.isArray(blockedSlots) ? blockedSlots : [];

  const calendarDays: { date: number; dateStr: string; hasBooking: boolean; hasBlock: boolean; totalCount: number }[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push({ date: 0, dateStr: '', hasBooking: false, hasBlock: false, totalCount: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayBookings = safeBookings.filter(b => b.date === dateStr && b.status === 'confirmed').length;
    let dayBlocks = 0;
    for (const block of safeBlocks) {
      if (!block.startDate) continue;
      try {
        if (block.isRecurring) {
          const bs = new Date(block.startDate);
          const cd = new Date(dateStr);
          if (isNaN(bs.getTime()) || isNaN(cd.getTime())) continue;
          if ((block.dayOfWeek ?? bs.getDay()) !== cd.getDay()) continue;
          if (Math.floor((cd.getTime() - bs.getTime()) / (7 * 86400000)) < 0) continue;
          if (block.endDate) {
            const be = new Date(block.endDate);
            if (!isNaN(be.getTime()) && cd > be) continue;
          }
          dayBlocks++;
        } else if (block.startDate === dateStr) {
          dayBlocks++;
        }
      } catch { /* skip bad block */ }
    }
    calendarDays.push({ date: d, dateStr, hasBooking: dayBookings > 0, hasBlock: dayBlocks > 0, totalCount: dayBookings + dayBlocks });
  }

  const panelBookings = safeBookings.filter(b => b.date === currentDateStr && b.status === 'confirmed').sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-[#13182b] border border-[#1e293b] hover:border-[#6366f1] flex items-center justify-center text-[#64748b] hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-black min-w-[180px] text-center">{MONTHS[month]} {year}</h2>
          <button onClick={nextMonth} className="w-9 h-9 rounded-xl bg-[#13182b] border border-[#1e293b] hover:border-[#6366f1] flex items-center justify-center text-[#64748b] hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="flex flex-wrap gap-3">
        {COURTS.map(c => (
          <div key={c.id} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${c.color}`} />
            <span className="text-[10px] text-[#64748b]">{c.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
          <span className="text-[10px] text-[#64748b]">Block Booking</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
          <span className="text-[10px] text-[#64748b]">Closed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
          <span className="text-[10px] text-[#64748b]">Maintenance</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#13182b] rounded-2xl border border-[#1e293b] p-5">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS_SHORT.map(d => <div key={d} className="text-center text-[10px] font-bold text-[#475569] uppercase py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              if (day.date === 0) return <div key={`e${i}`} className="aspect-square" />;
              const isToday = day.dateStr === todayStr;
              return (
                <button
                  key={day.dateStr}
                  onClick={() => { setViewDate(new Date(day.dateStr)); setView('day'); }}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all hover:bg-[#1a2035] ${isToday ? 'border border-[#6366f1]/30' : ''}`}
                >
                  <span className={`text-sm font-bold ${isToday ? 'text-[#6366f1]' : 'text-white'}`}>{day.date}</span>
                  {(day.hasBooking || day.hasBlock) && (
                    <div className="flex gap-0.5">
                      {day.hasBooking && COURTS.map(c => {
                        const hasBooking = safeBookings.some(b => b.date === day.dateStr && b.courtId === c.id && b.status === 'confirmed');
                        return hasBooking ? <div key={c.id} className={`w-1.5 h-1.5 rounded-full ${c.color}`} /> : null;
                      })}
                      {day.hasBlock && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </div>
                  )}
                  {day.totalCount > 0 && <span className="text-[8px] text-[#64748b]">{day.totalCount}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side Panel with clickable bookings */}
        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-5">
          <h3 className="text-sm font-bold text-[#94a3b8] mb-1">
            {new Date(currentDateStr).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <p className="text-xs text-[#475569] mb-4">{panelBookings.length} booking{panelBookings.length !== 1 ? 's' : ''}</p>
          <div className="space-y-3 max-h-[500px] overflow-auto">
            {panelBookings.length === 0 && (
              <div className="text-center py-8 text-sm text-[#64748b]">No entries on this day</div>
            )}
            {panelBookings.map(b => {
              const court = COURTS.find(c => c.id === b.courtId);
              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedBooking(b)}
                  className="bg-[#0b0f1e] rounded-xl p-3 border border-[#1e293b] space-y-1.5 cursor-pointer hover:border-[#6366f1]/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${court?.color ?? 'bg-[#6366f1]'}`} />
                    <span className="text-xs font-bold text-[#94a3b8]">{court?.name ?? b.courtName}</span>
                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#6366f1]/10 text-[#818cf8]">BOOKING</span>
                  </div>
                  <div className="text-xs text-[#64748b]">{b.startTime} — {b.endTime} ({b.duration}h)</div>
                  <div className="text-xs text-[#64748b]">{b.clientDetails.fullName}</div>
                  {b.clientDetails.phone && <div className="text-xs text-[#475569]">{b.clientDetails.phone}</div>}
                  <div className="flex justify-between pt-1 border-t border-[#1e293b]">
                    <span className="text-[10px] text-[#475569] font-mono">{b.id.slice(0, 8)}</span>
                    <span className="text-sm font-bold text-[#818cf8] tab-nums">R{b.totalPrice}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onCancel={onCancelBooking}
          onPlayed={onPlayed}
          onMissed={onMissed}
        />
      )}

      {/* Block Detail Modal */}
      {selectedBlock && (
        <BlockDetailModal block={selectedBlock} onClose={() => setSelectedBlock(null)} />
      )}
    </div>
  );
}

// ============================================
// BLOCK DETAIL MODAL (shared)
// ============================================
function BlockDetailModal({ block, onClose }: { block: BlockedSlot; onClose: () => void }) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-[50%] left-[50%] z-[9999] translate-x-[-50%] translate-y-[-50%] w-full max-w-[calc(100%-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto">
        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[#1e293b]">
            <h3 className="text-base font-bold text-white">
              {block.type === 'block-booking' ? 'Block Booking Details' : block.type === 'closed' ? 'Closed Slot Details' : 'Maintenance Details'}
            </h3>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1e293b] flex items-center justify-center text-[#64748b] hover:text-white hover:bg-[#334155] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Type Badge */}
            <div className="flex items-center gap-2">
              {block.type === 'block-booking' && <Lock className="w-4 h-4 text-amber-400" />}
              {block.type === 'closed' && <Ban className="w-4 h-4 text-red-400" />}
              {block.type === 'maintenance' && <FileText className="w-4 h-4 text-orange-400" />}
              <span className={`text-xs font-bold ${
                block.type === 'block-booking' ? 'text-amber-400' : block.type === 'closed' ? 'text-red-400' : 'text-orange-400'
              }`}>
                {block.type === 'block-booking' ? 'Block Booking' : block.type === 'closed' ? 'Closed' : 'Maintenance'}
              </span>
            </div>

            {/* Client Name (block bookings only) */}
            {block.clientName && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Client Name</p>
                  <p className="text-white font-semibold">{block.clientName}</p>
                </div>
              </div>
            )}

            {/* Contact Number */}
            {block.clientPhone && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Contact Number</p>
                  <p className="text-white font-semibold">{block.clientPhone}</p>
                </div>
              </div>
            )}

            {/* Court & Time */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Court & Time</p>
                <p className="text-white font-semibold">{block.courtName}</p>
                <p className="text-[#94a3b8] text-sm">{block.startTime} - {block.endTime}</p>
              </div>
            </div>

            {/* Day */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <CalIcon className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Day</p>
                <p className="text-white font-semibold">
                  {DAYS[jsDayToIndex(block.dayOfWeek ?? new Date(block.startDate).getDay())]}
                  {block.isRecurring && <span className="text-[#64748b] text-xs ml-1">(recurring weekly)</span>}
                </p>
              </div>
            </div>

            {/* Date Range */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <CalIcon className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Date Range</p>
                <p className="text-white font-semibold">{block.startDate} {block.endDate ? `→ ${block.endDate}` : '→ Indefinite'}</p>
              </div>
            </div>

            {/* Reason/Notes */}
            {block.reason && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Notes</p>
                  <p className="text-white text-sm">{block.reason}</p>
                </div>
              </div>
            )}
          </div>

          {/* Close Button */}
          <div className="p-5 border-t border-[#1e293b]">
            <button
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-[#1e293b] text-[#94a3b8] font-bold text-sm hover:bg-[#334155] hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ---- View Toggle ----
function ViewToggle({ view, onChange }: { view: CalendarView; onChange: (v: CalendarView) => void }) {
  const views: { key: CalendarView; label: string; icon: typeof Columns3 }[] = [
    { key: 'day', label: 'Day', icon: Columns3 },
    { key: 'week', label: 'Week', icon: LayoutGrid },
    { key: 'month', label: 'Month', icon: CalIcon },
  ];

  return (
    <div className="flex items-center bg-[#13182b] rounded-xl border border-[#1e293b] p-0.5">
      {views.map(v => {
        const Icon = v.icon;
        return (
          <button
            key={v.key}
            onClick={() => onChange(v.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all
              ${view === v.key ? 'bg-[#6366f1] text-white' : 'text-[#64748b] hover:text-white'}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
