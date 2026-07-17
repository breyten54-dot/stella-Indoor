import { useState } from 'react';
import { useBodyScrollLock } from '@/admin/hooks/useBodyScrollLock';
import {
  ChevronLeft, ChevronRight,
  LayoutGrid, Columns3, Calendar as CalIcon, Repeat,
} from 'lucide-react';
import type { BookingRecord } from '@/types/booking';
import { blockAppliesToDate, type BlockedSlot } from '../hooks/useBlockedSlots';
import { BookingDetailModal } from '../components/BookingDetailModal';
import { BlockDetailModal } from '../components/BlockDetailModal';

type CalendarView = 'day' | 'week' | 'month';

interface Props {
  bookings: BookingRecord[];
  blockedSlots: BlockedSlot[];
  onCancelBooking: (booking: BookingRecord) => Promise<void>;
  onAttendanceChange: (booking: BookingRecord, attendance: import('@/types/booking').BookingAttendance) => Promise<void>;
}

const COURTS = [
  { id: 'big-court', name: 'Big Court', color: 'bg-[#6366f1]', textColor: 'text-[#818cf8]', bgSoft: 'bg-[#6366f1]/10', borderSoft: 'border-[#6366f1]/20' },
  { id: 'multi-1', name: 'Multipurpose 1', color: 'bg-[#8b5cf6]', textColor: 'text-[#a78bfa]', bgSoft: 'bg-[#8b5cf6]/10', borderSoft: 'border-[#8b5cf6]/20' },
  { id: 'multi-2', name: 'Multipurpose 2', color: 'bg-[#ec4899]', textColor: 'text-[#f472b6]', bgSoft: 'bg-[#ec4899]/10', borderSoft: 'border-[#ec4899]/20' },
];

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

interface CalendarEntry {
  type: 'booking' | 'blocked' | 'released';
  data: BookingRecord | BlockedSlot;
  // Minute-accurate coverage of the hour cell, so half-hour
  // bookings/blocks render as partially filled cells
  topPct: number;
  heightPct: number;
  // Only used for released-ghost entries: is there a confirmed booking
  // overlapping the same court/date/time-range?
  isBooked?: boolean;
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

function getEntriesForSlot(
  date: string,
  hour: number,
  courtId: string,
  bookings: BookingRecord[],
  blockedSlots: BlockedSlot[]
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const cellStart = hour * 60;
  const cellEnd = cellStart + 60;

  const coverage = (startTime: string, endTime: string) => {
    const overlapStart = Math.max(cellStart, timeToMinutes(startTime));
    const overlapEnd = Math.min(cellEnd, timeToMinutes(endTime));
    if (overlapEnd <= overlapStart) return null;
    return {
      topPct: ((overlapStart - cellStart) / 60) * 100,
      heightPct: ((overlapEnd - overlapStart) / 60) * 100,
    };
  };

  bookings.filter(b => b.status === 'confirmed').forEach(b => {
    if (b.courtId !== courtId) return;
    if (b.date !== date) return;
    const cov = coverage(b.startTime, b.endTime);
    if (cov) entries.push({ type: 'booking', data: b, ...cov });
  });

  blockedSlots.forEach(block => {
    if (block.courtId !== courtId) return;
    if (!blockAppliesToDate(block, date)) return;
    const cov = coverage(block.startTime, block.endTime);
    if (cov) entries.push({ type: 'blocked', data: block, ...cov });
  });

  // Released-day ghost markers: a recurring block released for this date
  // no longer renders as a solid block, so we show a faint outline that is
  // still clickable to reopen the block card.
  blockedSlots.forEach(block => {
    if (block.courtId !== courtId) return;
    if (!block.releasedDates?.includes(date)) return;
    const cov = coverage(block.startTime, block.endTime);
    if (!cov) return;
    const isBooked = bookings.some(
      b =>
        b.status === 'confirmed' &&
        b.courtId === courtId &&
        b.date === date &&
        timesOverlap(b.startTime, b.endTime, block.startTime, block.endTime),
    );
    entries.push({ type: 'released', data: block, ...cov, isBooked });
  });

  return entries;
}

// ---- SlotCell with click handler for bookings & blocks ----
// Entries render as absolutely-positioned segments sized to the minutes they
// actually cover, so a half-hour booking fills only half the hour cell.
function SlotCell({ entries, courtId, onBookingClick, onBlockClick }: { entries: CalendarEntry[]; courtId: string; onBookingClick?: (booking: BookingRecord) => void; onBlockClick?: (block: BlockedSlot) => void }) {
  const court = COURTS.find(c => c.id === courtId);

  if (entries.length === 0) {
    return <div className="h-full min-h-[52px] hover:bg-[#1a2035]/50 transition-colors" />;
  }

  const blockColors = {
    'block-booking': { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
    'closed': { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
    'maintenance': { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  };

  // Render released ghosts behind blocks/bookings so live entries stay on top,
  // but keep the ghost clickable in the exposed border/label area.
  const renderOrder: Record<CalendarEntry['type'], number> = { released: 0, blocked: 1, booking: 2 };
  const orderedEntries = [...entries].sort((a, b) => renderOrder[a.type] - renderOrder[b.type]);

  return (
    <div className="relative h-full min-h-[52px]">
      {orderedEntries.map((entry, i) => {
        const style = { top: `${entry.topPct}%`, height: `${entry.heightPct}%` };

        if (entry.type === 'booking') {
          const b = entry.data as BookingRecord;
          return (
            <div
              key={`b-${b.id}-${i}`}
              onClick={() => onBookingClick?.(b)}
              style={style}
              className={`absolute inset-x-0 ${court?.bgSoft} ${court?.borderSoft} border rounded-lg px-1.5 flex flex-col justify-center gap-0.5 overflow-hidden cursor-pointer hover:opacity-80 hover:ring-1 hover:ring-[#818cf8]/30 transition-all`}
            >
              <span className={`text-[9px] font-bold ${court?.textColor} truncate`}>
                {b.clientDetails.fullName}
              </span>
              <span className="text-[8px] text-[#64748b] truncate">
                {b.startTime}—{b.endTime} ({b.duration}h)
              </span>
            </div>
          );
        }

        if (entry.type === 'released') {
          const block = entry.data as BlockedSlot;
          const statusLabel = entry.isBooked ? 'Released · booked' : 'Released · open';
          return (
            <div
              key={`r-${block.id}-${i}`}
              data-testid="released-ghost"
              style={style}
              className="absolute inset-0 pointer-events-none"
            >
              {/* Faint dashed outline behind blocks/bookings */}
              <div className="absolute -inset-1 border border-dashed border-[#64748b]/40 rounded-lg transition-colors" />
              {/* Clickable label sits above any booking overlay and reopens the block card */}
              <span
                className="absolute top-0.5 left-1 right-1 text-[8px] font-bold text-[#94a3b8] truncate flex items-center gap-0.5 cursor-pointer hover:text-white z-10 pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onBlockClick?.(block);
                }}
              >
                {block.isRecurring && <Repeat className="w-2 h-2" />}
                {statusLabel}
              </span>
            </div>
          );
        }

        const block = entry.data as BlockedSlot;
        const colors = blockColors[block.type];
        const label = block.type === 'block-booking' ? 'Block' : block.type === 'closed' ? 'Closed' : 'Maint.';

        return (
          <div
            key={`k-${block.id}-${i}`}
            onClick={() => onBlockClick?.(block)}
            style={style}
            className={`absolute inset-x-0 ${colors.bg} ${colors.border} border rounded-lg px-1.5 flex flex-col justify-center gap-0.5 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity`}
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
      })}
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
export function Calendar({ bookings, blockedSlots, onCancelBooking, onAttendanceChange }: Props) {
  const [view, setView] = useState<CalendarView>('day');
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<BlockedSlot | null>(null);
  const [selectedBlockDate, setSelectedBlockDate] = useState<string>('');
  // selectedBlock is a click-time snapshot; derive the live doc so edits (release/undo)
  // re-render the modal immediately without closing and reopening it.
  const liveSelectedBlock = selectedBlock
    ? (blockedSlots.find(b => b.id === selectedBlock.id) ?? selectedBlock)
    : null;
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
            onBlockClick={(block) => { setSelectedBlock(block); setSelectedBlockDate(currentDateStr); }}
          />
        </div>

        {selectedBooking && (
          <BookingDetailModal
            booking={bookings.find(b => b.id === selectedBooking.id) ?? selectedBooking}
            onClose={() => setSelectedBooking(null)}
            onCancel={onCancelBooking}
            onAttendanceChange={onAttendanceChange}
          />
        )}

        {/* Block Detail Modal */}
        {selectedBlock && (
          <BlockDetailModal
            block={liveSelectedBlock!}
            viewDate={selectedBlockDate || currentDateStr}
            bookings={bookings}
            onClose={() => { setSelectedBlock(null); setSelectedBlockDate(''); }}
          />
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
                            }

                            if (entry.type === 'released') {
                              const block = entry.data as BlockedSlot;
                              const court = COURTS.find(c => c.id === block.courtId);
                              const statusLabel = entry.isBooked ? 'Released·booked' : 'Released·open';
                              return (
                                <div
                                  key={ei}
                                  data-testid="released-ghost"
                                  onClick={() => { setSelectedBlock(block); setSelectedBlockDate(dateStr); }}
                                  className="text-[8px] px-1 py-0.5 rounded border border-dashed border-[#64748b]/40 bg-[#64748b]/5 text-[#94a3b8] truncate font-bold cursor-pointer hover:bg-[#64748b]/10 transition-colors"
                                >
                                  {court?.name?.replace('Multipurpose ', 'M')}: {statusLabel}
                                </div>
                              );
                            }

                            const block = entry.data as BlockedSlot;
                            const court = COURTS.find(c => c.id === block.courtId);
                            const colors = block.type === 'block-booking' ? 'bg-amber-500/10 text-amber-400' : block.type === 'closed' ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400';
                            return (
                              <div
                                key={ei}
                                onClick={() => { setSelectedBlock(block); setSelectedBlockDate(dateStr); }}
                                className={`text-[8px] px-1 py-0.5 rounded ${colors} truncate font-bold cursor-pointer hover:opacity-80 transition-opacity`}
                              >
                                {court?.name?.replace('Multipurpose ', 'M')}: {block.type === 'block-booking' ? 'Block' : block.type === 'closed' ? 'Closed' : 'Maint'}
                              </div>
                            );
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
            booking={bookings.find(b => b.id === selectedBooking.id) ?? selectedBooking}
            onClose={() => setSelectedBooking(null)}
            onCancel={onCancelBooking}
            onAttendanceChange={onAttendanceChange}
          />
        )}

        {/* Block Detail Modal */}
        {selectedBlock && (
          <BlockDetailModal
            block={liveSelectedBlock!}
            viewDate={selectedBlockDate || currentDateStr}
            bookings={bookings}
            onClose={() => { setSelectedBlock(null); setSelectedBlockDate(''); }}
          />
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
          booking={bookings.find(b => b.id === selectedBooking.id) ?? selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onCancel={onCancelBooking}
          onAttendanceChange={onAttendanceChange}
        />
      )}

      {/* Block Detail Modal */}
      {selectedBlock && (
        <BlockDetailModal
          block={liveSelectedBlock!}
          viewDate={selectedBlockDate || currentDateStr}
          bookings={bookings}
          onClose={() => { setSelectedBlock(null); setSelectedBlockDate(''); }}
        />
      )}
    </div>
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
