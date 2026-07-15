import { useState, useMemo, useCallback, useEffect } from 'react';
import { useBodyScrollLock } from '@/admin/hooks/useBodyScrollLock';
import { ModalPortal } from '@/admin/components/ModalPortal';
import {
  Ban, Clock, Lock, Plus,
  Phone, User, FileText, Repeat, Trash2, X, Wrench,
  Calendar as CalIcon, AlertTriangle
} from 'lucide-react';
import { blockAppliesToDate, type BlockedSlot, type BlockType } from '../hooks/useBlockedSlots';

interface Props {
  slots: BlockedSlot[];
  loading: boolean;
  onCreate: (data: Omit<BlockedSlot, 'id' | 'createdAt'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, data: Partial<Omit<BlockedSlot, 'id' | 'createdAt'>>) => Promise<void>;
}

const COURTS = [
  { id: 'big-court', name: 'Big Court', color: 'bg-[#6366f1]', textColor: 'text-[#818cf8]', bgSoft: 'bg-[#6366f1]/10', borderSoft: 'border-[#6366f1]/20' },
  { id: 'multi-1', name: 'Multipurpose 1', color: 'bg-[#8b5cf6]', textColor: 'text-[#a78bfa]', bgSoft: 'bg-[#8b5cf6]/10', borderSoft: 'border-[#8b5cf6]/20' },
  { id: 'multi-2', name: 'Multipurpose 2', color: 'bg-[#ec4899]', textColor: 'text-[#f472b6]', bgSoft: 'bg-[#ec4899]/10', borderSoft: 'border-[#ec4899]/20' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Opening hours: 8am to 9pm (last booking slot, closes at 10pm)
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8, 9, 10, ... 21

const BLOCK_TYPE_CONFIG: Record<BlockType, { label: string; icon: typeof Ban; color: string; bgColor: string; borderColor: string }> = {
  'block-booking': { label: 'Block Booking', icon: Lock, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  'closed': { label: 'Closed', icon: Ban, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  'maintenance': { label: 'Maintenance', icon: Wrench, color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
};

// Convert JS day (0=Sun, 1=Mon) to our index (0=Mon, 6=Sun)
function jsDayToIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Local YYYY-MM-DD (toISOString would shift the date across the UTC boundary)
function toLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Our UI weekday index (0=Mon … 6=Sun) → JS getDay() (0=Sun … 6=Sat)
function uiIndexToJsDay(ui: number): number {
  return ui === 6 ? 0 : ui + 1;
}

// The next calendar date matching a UI weekday — today if today already matches.
// Used as the default for a one-off (specific future date).
function nextDateForWeekday(ui: number): string {
  const target = uiIndexToJsDay(ui);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const delta = (target - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return toLocalYMD(d);
}

// The most recent occurrence of a UI weekday on or before today. Recurring blocks
// anchor here so a newly-created block is active from the CURRENT week (the
// closest past/today occurrence), not the next one.
function recentDateForWeekday(ui: number): string {
  const target = uiIndexToJsDay(ui);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const delta = (d.getDay() - target + 7) % 7;
  d.setDate(d.getDate() - delta);
  return toLocalYMD(d);
}

// A block should vanish from the slot-control view once its coverage is entirely
// in the past: a recurring block after its end date, a one-off after its date.
function isBlockExpired(block: BlockedSlot, today: string): boolean {
  if (block.exactDates && block.exactDates.length > 0) {
    return block.exactDates.every(dt => dt < today);
  }
  if (block.isRecurring) {
    return !!block.endDate && block.endDate < today;
  }
  return block.startDate < today;
}

// A block's coverage of one hour cell, as percentages of the cell height —
// lets half-hour blocks render as half-filled cells
interface CellBlock {
  block: BlockedSlot;
  topPct: number;
  heightPct: number;
}

export function BlockedSlots({ slots, loading, onCreate, onDelete, onUpdate }: Props) {
  const [selectedCourt, setSelectedCourt] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [formDay, setFormDay] = useState(0); // 0 = Monday
  const [formHour, setFormHour] = useState(10);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Block detail & edit state
  const [viewBlock, setViewBlock] = useState<BlockedSlot | null>(null);
  const [editBlock, setEditBlock] = useState<BlockedSlot | null>(null);
  const [editForm, setEditForm] = useState<Partial<BlockedSlot>>({});
  const [overrideDate, setOverrideDate] = useState('');
  useBodyScrollLock(viewBlock !== null || editBlock !== null || showForm);

  // Keep the open detail modal in sync with live Firestore updates
  // (e.g. so saved overrides appear immediately without reopening)
  useEffect(() => {
    setViewBlock(current => {
      if (!current) return current;
      return slots.find(s => s.id === current.id) ?? null;
    });
  }, [slots]);

  // Today (local) — expired blocks are hidden from the whole slot-control view.
  const todayStr = useMemo(() => toLocalYMD(new Date()), []);

  // Filter slots by selected court AND drop any block whose end date has passed
  // (req: a block set to end on the 30th disappears from slot control after the 30th).
  const filteredSlots = useMemo(() => {
    const active = slots.filter(s => !isBlockExpired(s, todayStr));
    if (selectedCourt === 'all') return active;
    return active.filter(s => s.courtId === selectedCourt);
  }, [slots, selectedCourt, todayStr]);

  // Get blocks overlapping a specific day index (0=Mon, 6=Sun) and hour,
  // with each block's minute-accurate coverage of the hour cell
  const getBlocksForSlot = useCallback((dayIndex: number, hour: number): CellBlock[] => {
    const cellStart = hour * 60;
    const cellEnd = cellStart + 60;
    const result: CellBlock[] = [];
    for (const block of filteredSlots) {
      const blockDayIndex = jsDayToIndex(block.dayOfWeek ?? new Date(block.startDate).getDay());
      if (blockDayIndex !== dayIndex) continue;

      const overlapStart = Math.max(cellStart, timeToMinutes(block.startTime));
      const overlapEnd = Math.min(cellEnd, timeToMinutes(block.endTime));
      if (overlapEnd <= overlapStart) continue;

      result.push({
        block,
        topPct: ((overlapStart - cellStart) / 60) * 100,
        heightPct: ((overlapEnd - overlapStart) / 60) * 100,
      });
    }
    return result;
  }, [filteredSlots]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try { await onDelete(id); } finally { setDeletingId(null); }
  };

  // Edit handlers
  const startEdit = (block: BlockedSlot) => {
    setViewBlock(null);
    setEditBlock(block);
    setEditForm({
      courtId: block.courtId,
      courtName: block.courtName,
      clientName: block.clientName,
      clientPhone: block.clientPhone,
      clientEmail: block.clientEmail,
      startTime: block.startTime,
      endTime: block.endTime,
      startDate: block.startDate,
      endDate: block.endDate,
      reason: block.reason,
      isRecurring: block.isRecurring,
      intervalWeeks: block.intervalWeeks,
    });
  };

  const saveEdit = async () => {
    if (!editBlock) return;
    const update = { ...editForm };
    const court = COURTS.find(c => c.id === update.courtId);
    if (court) {
      update.courtName = court.name;
    }
    await onUpdate(editBlock.id, update);
    setEditBlock(null);
    setEditForm({});
  };

  // Group blocks by type for summary
  const blockBookings = filteredSlots.filter(s => s.type === 'block-booking');
  const closedSlots = filteredSlots.filter(s => s.type === 'closed');
  const maintenanceSlots = filteredSlots.filter(s => s.type === 'maintenance');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">Weekly Slot Control</h2>
          <p className="text-xs text-[#64748b] mt-0.5">Block bookings, close slots, and manage availability by day and time</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedCourt}
            onChange={e => setSelectedCourt(e.target.value)}
            className="h-10 px-3 rounded-xl border border-[#1e293b] bg-[#13182b] text-white text-sm focus:outline-none focus:border-[#6366f1]"
          >
            <option value="all">All Courts</option>
            {COURTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={() => { setFormDay(0); setFormHour(10); setShowForm(true); }}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-bold flex items-center gap-2 hover:from-[#5558e0] hover:to-[#7c4ee5] transition-all"
          >
            <Plus className="w-4 h-4" /> Add Block
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#13182b] rounded-2xl p-4 border border-amber-500/20">
          <Lock className="w-5 h-5 text-amber-400 mb-2" />
          <p className="text-2xl font-black">{blockBookings.length}</p>
          <p className="text-[10px] text-[#64748b] font-medium uppercase tracking-wider">Block Bookings</p>
        </div>
        <div className="bg-[#13182b] rounded-2xl p-4 border border-red-500/20">
          <Ban className="w-5 h-5 text-red-400 mb-2" />
          <p className="text-2xl font-black">{closedSlots.length}</p>
          <p className="text-[10px] text-[#64748b] font-medium uppercase tracking-wider">Closed Slots</p>
        </div>
        <div className="bg-[#13182b] rounded-2xl p-4 border border-orange-500/20">
          <Wrench className="w-5 h-5 text-orange-400 mb-2" />
          <p className="text-2xl font-black">{maintenanceSlots.length}</p>
          <p className="text-[10px] text-[#64748b] font-medium uppercase tracking-wider">Maintenance</p>
        </div>
      </div>

      {/* Weekly Calendar Grid */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-8 border-b border-[#1e293b]">
          <div className="p-3 border-r border-[#1e293b] bg-[#0b0f1e]">
            <span className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Time</span>
          </div>
          {DAYS_SHORT.map((day, i) => (
            <div key={day} className="p-3 text-center border-r border-[#1e293b] last:border-r-0">
              <p className="text-xs font-bold text-[#94a3b8]">{day}</p>
              <p className="text-[10px] text-[#475569]">{DAYS[i]}</p>
            </div>
          ))}
        </div>

        {/* Time slots */}
        <div className="divide-y divide-[#1e293b]">
          {HOURS.map(hour => (
            <div key={hour} className="grid grid-cols-8">
              {/* Time label */}
              <div className="p-2 border-r border-[#1e293b] bg-[#0b0f1e] flex items-center justify-center">
                <span className="text-[11px] font-semibold text-[#475569] tab-nums">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>

              {/* Day cells */}
              {DAYS_SHORT.map((_, dayIndex) => {
                const cellBlocks = getBlocksForSlot(dayIndex, hour);
                const hasBlock = cellBlocks.length > 0;

                return (
                  <div
                    key={dayIndex}
                    onClick={() => { setFormDay(dayIndex); setFormHour(hour); setShowForm(true); }}
                    className="min-h-[52px] border-r border-[#1e293b] last:border-r-0 relative cursor-pointer bg-transparent hover:bg-[#1a2035] transition-colors group"
                  >
                    {cellBlocks.map(({ block, topPct, heightPct }) => {
                      const config = BLOCK_TYPE_CONFIG[block.type];
                      const court = COURTS.find(c => c.id === block.courtId);
                      const compact = heightPct < 75;

                      return (
                        <div
                          key={block.id}
                          onClick={e => { e.stopPropagation(); setViewBlock(block); }}
                          style={{ top: `${topPct}%`, height: `${heightPct}%` }}
                          className={`absolute inset-x-0 ${config.bgColor} ${config.borderColor} border overflow-hidden flex flex-col items-center justify-center text-center hover:opacity-80 transition-opacity`}
                        >
                          <span className={`text-[9px] font-bold ${config.color} block truncate max-w-full px-0.5`}>
                            {config.label}
                          </span>
                          {!compact && selectedCourt === 'all' && court && (
                            <span className={`text-[8px] ${court.textColor} block truncate max-w-full px-0.5 mt-0.5`}>
                              {court.name}
                            </span>
                          )}
                          {!compact && block.isRecurring && (
                            <Repeat className="w-2.5 h-2.5 text-[#64748b] mx-auto mt-0.5" />
                          )}
                        </div>
                      );
                    })}
                    {!hasBlock && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Plus className="w-4 h-4 text-[#475569]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {Object.entries(BLOCK_TYPE_CONFIG).map(([type, config]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${config.bgColor} border ${config.borderColor}`} />
            <span className={`text-[11px] font-bold ${config.color}`}>{config.label}</span>
          </div>
        ))}
        {COURTS.map(c => (
          <div key={c.id} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${c.color}`} />
            <span className="text-[11px] text-[#64748b]">{c.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <Repeat className="w-3 h-3 text-[#64748b]" />
          <span className="text-[11px] text-[#64748b]">Recurring</span>
        </div>
      </div>

      {/* Block Detail Modal */}
      {viewBlock && (
        <ModalPortal>
          <div className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm" onClick={() => setViewBlock(null)} />
          <div className="fixed inset-0 z-[99999] flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
            <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] shadow-2xl w-full max-w-[calc(100%-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto my-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#1e293b]">
              <h3 className="text-base font-bold text-white">Block Booking Details</h3>
              <button onClick={() => setViewBlock(null)} className="w-8 h-8 rounded-lg bg-[#1e293b] flex items-center justify-center text-[#64748b] hover:text-white hover:bg-[#334155] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Client Name */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Client Name</p>
                  <p className="text-white font-semibold">{viewBlock.clientName || '—'}</p>
                </div>
              </div>

              {/* Contact */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Contact Number</p>
                  <p className="text-white font-semibold">{viewBlock.clientPhone || '—'}</p>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#7ED321]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Email</p>
                  <p className="text-white font-semibold">{viewBlock.clientEmail || '—'}</p>
                </div>
              </div>

              {/* Court & Time */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Court & Time</p>
                  <p className="text-white font-semibold">{viewBlock.courtName}</p>
                  <p className="text-[#94a3b8] text-sm">{viewBlock.startTime} - {viewBlock.endTime}</p>
                </div>
              </div>

              {/* Schedule */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  {viewBlock.isRecurring ? <Repeat className="w-5 h-5 text-[#7ED321]" /> : <CalIcon className="w-5 h-5 text-[#7ED321]" />}
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Schedule</p>
                  {viewBlock.isRecurring ? (
                    <>
                      <p className="text-white font-semibold">
                        Every {viewBlock.intervalWeeks === 1 || !viewBlock.intervalWeeks ? 'week' : `${viewBlock.intervalWeeks} weeks`} on {DAYS[jsDayToIndex(viewBlock.dayOfWeek ?? new Date(viewBlock.startDate).getDay())]}s
                      </p>
                      <p className="text-[#94a3b8] text-sm">{viewBlock.startDate} → {viewBlock.endDate || 'Indefinite'}</p>
                    </>
                  ) : (
                    <p className="text-white font-semibold">{viewBlock.startDate}</p>
                  )}
                </div>
              </div>

              {/* Reason/Notes */}
              {viewBlock.reason && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-[#7ED321]" />
                  </div>
                  <div>
                    <p className="text-[#64748b] text-xs">Notes</p>
                    <p className="text-white text-sm">{viewBlock.reason}</p>
                  </div>
                </div>
              )}

              {/* Per-date override */}
              <div className="border-t border-[#1e293b] pt-4 space-y-3">
                <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Override Single Date</p>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={overrideDate}
                    onChange={e => setOverrideDate(e.target.value)}
                    className="flex-1 h-11 px-4 rounded-xl border border-[#1e293b] bg-[#0b0f1e] text-white text-sm focus:outline-none focus:border-[#6366f1] transition-all"
                  />
                  {overrideDate && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!viewBlock) return;
                        const currentlyActive = blockAppliesToDate(viewBlock, overrideDate);
                        const nextOverrides = { ...(viewBlock.overrides || {}), [overrideDate]: !currentlyActive };
                        await onUpdate(viewBlock.id, { overrides: nextOverrides });
                        setOverrideDate('');
                      }}
                      className="h-11 px-4 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-white text-xs font-bold transition-colors whitespace-nowrap"
                    >
                      {blockAppliesToDate(viewBlock, overrideDate) ? 'Open this date' : 'Close this date'}
                    </button>
                  )}
                </div>
                {overrideDate && (
                  <p className="text-[10px] text-[#475569]">
                    On {overrideDate} this block is currently <span className={blockAppliesToDate(viewBlock, overrideDate) ? 'text-amber-400' : 'text-emerald-400'}>
                      {blockAppliesToDate(viewBlock, overrideDate) ? 'closed' : 'open'}
                    </span>
                  </p>
                )}
                {viewBlock.overrides && Object.keys(viewBlock.overrides).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-[#64748b]">Saved overrides</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(viewBlock.overrides).map(([date, active]) => (
                        <span key={date} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${active ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {date}: {active ? 'closed' : 'open'}
                          <button
                            type="button"
                            onClick={async () => {
                              if (!viewBlock) return;
                              const nextOverrides = { ...viewBlock.overrides };
                              delete nextOverrides[date];
                              await onUpdate(viewBlock.id, { overrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : {} });
                            }}
                            className="hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-[#1e293b] flex gap-3">
              <button
                onClick={() => startEdit(viewBlock)}
                className="flex-1 h-11 rounded-xl bg-[#1B7A40] text-white font-bold text-sm hover:bg-[#145C32] transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              <button
                onClick={() => { handleDelete(viewBlock.id); setViewBlock(null); }}
                disabled={deletingId === viewBlock.id}
                className="flex-1 h-11 rounded-xl bg-red-500/10 text-red-400 font-bold text-sm hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deletingId === viewBlock.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Block Edit Modal */}
      {editBlock && (
        <ModalPortal>
          <div className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm" onClick={() => setEditBlock(null)} />
          <div className="fixed inset-0 z-[99999] flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
            <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] shadow-2xl w-full max-w-[calc(100%-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto my-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#1e293b]">
              <h3 className="text-base font-bold text-white">Edit Block Booking</h3>
              <button onClick={() => setEditBlock(null)} className="w-8 h-8 rounded-lg bg-[#1e293b] flex items-center justify-center text-[#64748b] hover:text-white hover:bg-[#334155] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              {/* Client Name */}
              <div>
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Client Name</label>
                <input
                  type="text"
                  value={editForm.clientName || ''}
                  onChange={e => setEditForm({ ...editForm, clientName: e.target.value })}
                  className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm placeholder-[#475569] focus:border-[#1B7A40] focus:outline-none transition-colors"
                />
              </div>

              {/* Contact */}
              <div>
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Contact Number</label>
                <input
                  type="tel"
                  value={editForm.clientPhone || ''}
                  onChange={e => setEditForm({ ...editForm, clientPhone: e.target.value })}
                  className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm placeholder-[#475569] focus:border-[#1B7A40] focus:outline-none transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Email</label>
                <input
                  type="email"
                  value={editForm.clientEmail || ''}
                  onChange={e => setEditForm({ ...editForm, clientEmail: e.target.value })}
                  className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm placeholder-[#475569] focus:border-[#1B7A40] focus:outline-none transition-colors"
                />
              </div>

              {/* Court */}
              <div>
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Court</label>
                <select
                  value={editForm.courtId || ''}
                  onChange={e => setEditForm({ ...editForm, courtId: e.target.value })}
                  className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm focus:border-[#1B7A40] focus:outline-none transition-colors appearance-none"
                >
                  {COURTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Start Time</label>
                  <input
                    type="time"
                    value={editForm.startTime || ''}
                    onChange={e => setEditForm({ ...editForm, startTime: e.target.value })}
                    className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm focus:border-[#1B7A40] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">End Time</label>
                  <input
                    type="time"
                    value={editForm.endTime || ''}
                    onChange={e => setEditForm({ ...editForm, endTime: e.target.value })}
                    className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm focus:border-[#1B7A40] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Schedule — recurring picks a weekday (anchor date auto-derived);
                  one-off picks the specific date. No redundant "first date" step. */}
              {editForm.isRecurring ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Day of Week</label>
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS_SHORT.map((day, i) => {
                        const currentIdx = editForm.startDate ? jsDayToIndex(new Date(editForm.startDate + 'T00:00:00').getDay()) : 0;
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setEditForm({ ...editForm, startDate: recentDateForWeekday(i) })}
                            className={`h-10 rounded-lg text-xs font-bold transition-all
                              ${currentIdx === i ? 'bg-[#6366f1] text-white' : 'bg-[#0b0f1e] border border-[#1e293b] text-[#64748b] hover:border-[#334155]'}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">
                      End Date <span className="text-[#475569] normal-case">(optional — blank = indefinite)</span>
                    </label>
                    <input
                      type="date"
                      value={editForm.endDate || ''}
                      onChange={e => setEditForm({ ...editForm, endDate: e.target.value || null })}
                      className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm focus:border-[#1B7A40] focus:outline-none transition-colors"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Date</label>
                  <input
                    type="date"
                    value={editForm.startDate || ''}
                    onChange={e => setEditForm({ ...editForm, startDate: e.target.value })}
                    className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm focus:border-[#1B7A40] focus:outline-none transition-colors"
                  />
                </div>
              )}

              {/* Recurrence interval */}
              {editForm.isRecurring && (
                <div>
                  <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Repeat every</label>
                  <select
                    value={editForm.intervalWeeks || 1}
                    onChange={e => setEditForm({ ...editForm, intervalWeeks: parseInt(e.target.value) })}
                    className="w-full h-11 bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 text-white text-sm focus:border-[#1B7A40] focus:outline-none transition-colors appearance-none"
                  >
                    {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n} week{n === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Notes</label>
                <textarea
                  value={editForm.reason || ''}
                  onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                  rows={3}
                  className="w-full bg-[#0f1629] border border-[#1e293b] rounded-xl px-4 py-3 text-white text-sm placeholder-[#475569] focus:border-[#1B7A40] focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-[#1e293b] flex gap-3">
              <button
                onClick={saveEdit}
                className="flex-1 h-11 rounded-xl bg-[#1B7A40] text-white font-bold text-sm hover:bg-[#145C32] transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save Changes
              </button>
              <button
                onClick={() => setEditBlock(null)}
                className="flex-1 h-11 rounded-xl bg-[#1e293b] text-[#94a3b8] font-bold text-sm hover:bg-[#334155] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Active Blocks List */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-5">
        <h3 className="text-sm font-bold text-[#94a3b8] mb-4 flex items-center gap-2">
          <CalIcon className="w-4 h-4" />
          Active Blocks ({filteredSlots.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#6366f1]/30 border-t-[#6366f1] rounded-full animate-spin" />
          </div>
        ) : filteredSlots.length === 0 ? (
          <div className="text-center py-8">
            <Ban className="w-8 h-8 text-[#1e293b] mx-auto mb-2" />
            <p className="text-sm text-[#64748b]">No blocked slots</p>
            <p className="text-[10px] text-[#475569] mt-1">Click any empty slot on the calendar or "Add Block" to create one</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSlots.map(block => {
              const config = BLOCK_TYPE_CONFIG[block.type];
              const court = COURTS.find(c => c.id === block.courtId);
              const dayName = DAYS[jsDayToIndex(block.dayOfWeek ?? new Date(block.startDate).getDay())];

              return (
                <div key={block.id} className={`bg-[#0b0f1e] rounded-xl p-3 border ${config.borderColor} space-y-2`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}>
                      {config.label.toUpperCase()}
                    </span>
                    {block.isRecurring && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#6366f1]/10 text-[#818cf8] flex items-center gap-0.5">
                        <Repeat className="w-2.5 h-2.5" /> Every {(block.intervalWeeks || 1) === 1 ? 'week' : `${block.intervalWeeks || 1} weeks`}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
                      <CalIcon className="w-3 h-3 text-[#64748b]" />
                      {dayName}s
                      {block.endDate && <span className="text-[#475569]">→ {block.endDate}</span>}
                      {!block.endDate && block.isRecurring && <span className="text-[#475569]">(indefinite)</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
                      <Clock className="w-3 h-3 text-[#64748b]" />
                      {block.startTime} — {block.endTime}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
                      <div className={`w-2 h-2 rounded-full ${court?.color ?? 'bg-[#6366f1]'}`} />
                      {court?.name ?? block.courtName}
                    </div>
                    {block.type === 'block-booking' && block.clientName && (
                      <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
                        <User className="w-3 h-3 text-[#64748b]" /> {block.clientName}
                      </div>
                    )}
                    {(block.type === 'closed' || block.type === 'maintenance') && block.reason && (
                      <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
                        <FileText className="w-3 h-3 text-[#64748b]" /> {block.reason}
                      </div>
                    )}
                  </div>

                  <div className="pt-1 flex justify-end gap-2">
                    <button
                      onClick={() => startEdit(block)}
                      className="h-7 px-3 rounded-lg bg-[#1B7A40]/10 text-[#7ED321] hover:bg-[#1B7A40]/20 text-[10px] font-bold flex items-center gap-1 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(block.id)}
                      disabled={deletingId === block.id}
                      className="h-7 px-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {deletingId === block.id ? (
                        <span className="w-3 h-3 border border-red-300 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Block Form Modal */}
      {showForm && (
        <CreateBlockModal
          initialDay={formDay}
          initialHour={formHour}
          onClose={() => setShowForm(false)}
          onCreate={onCreate}
        />
      )}
    </div>
  );
}

// Create Block Modal
function CreateBlockModal({
  initialDay,
  initialHour,
  onClose,
  onCreate
}: {
  initialDay: number;
  initialHour: number;
  onClose: () => void;
  onCreate: Props['onCreate'];
}) {
  const [type, setType] = useState<BlockType>('block-booking');
  const [courtId, setCourtId] = useState('big-court');
  const [dayOfWeek, setDayOfWeek] = useState(initialDay); // 0=Mon, 6=Sun
  const [startTime, setStartTime] = useState(`${initialHour.toString().padStart(2, '0')}:00`);
  const [endTime, setEndTime] = useState(`${(initialHour + 1).toString().padStart(2, '0')}:00`);
  const [isRecurring, setIsRecurring] = useState(true);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  // Recurring blocks anchor to the next occurrence of the chosen weekday (no
  // manual "first date" step). One-off blocks target a specific calendar date.
  const [oneOffDate, setOneOffDate] = useState(() => nextDateForWeekday(initialDay));
  const [endDate, setEndDate] = useState('');

  // Client info (for block bookings)
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // Reason (for closed/maintenance)
  const [reason, setReason] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Clear error when modal opens
  useEffect(() => {
    setSubmitError('');
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!courtId) e.courtId = 'Select a court';
    if (!startTime) e.startTime = 'Select a start time';
    if (!endTime) e.endTime = 'Select an end time';
    const startM = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    const endM = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
    if (endM <= startM) e.endTime = 'End time must be after start time';
    if (!isRecurring && !oneOffDate) e.oneOffDate = 'Select a date';
    if (type === 'block-booking' && !clientName.trim()) e.clientName = 'Client name is required';
    if ((type === 'closed' || type === 'maintenance') && !reason.trim()) e.reason = 'Reason is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;
    setSubmitting(true);

    const court = COURTS.find(c => c.id === courtId)!;

    // Recurring → anchor to the closest past/today occurrence of the selected
    // weekday, so the block is active from the current week onward.
    // One-off → the specific date the admin picked. The hook derives dayOfWeek
    // from this, so the weekday is always consistent with the stored date.
    const startDate = isRecurring ? recentDateForWeekday(dayOfWeek) : oneOffDate;

    try {
      await onCreate({
        courtId,
        courtName: court.name,
        startDate,
        endDate: isRecurring ? (endDate || null) : null,
        startTime,
        endTime,
        type,
        clientName: type === 'block-booking' ? clientName.trim() : null,
        clientPhone: type === 'block-booking' ? (clientPhone.trim() || null) : null,
        reason: type !== 'block-booking' ? reason.trim() : null,
        isRecurring,
        intervalWeeks: isRecurring ? intervalWeeks : 1,
        createdBy: 'admin',
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('permission')) {
        setSubmitError('Firebase permission denied. Please check your Firestore security rules allow writes to blockedSlots.');
      } else {
        setSubmitError(`Failed to create block: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full h-11 px-4 rounded-xl border border-[#1e293b] bg-[#0b0f1e] text-white text-sm placeholder:text-[#475569] focus:outline-none focus:border-[#6366f1] transition-all';
  const selectClass = 'w-full h-11 px-4 rounded-xl border border-[#1e293b] bg-[#0b0f1e] text-white text-sm focus:outline-none focus:border-[#6366f1] transition-all appearance-none';

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[99999] flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] shadow-2xl w-full max-w-[calc(100%-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto my-auto pointer-events-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1e293b]">
          <h3 className="text-base font-black">Create Block</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1e293b] hover:bg-[#334155] flex items-center justify-center text-[#64748b] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Block Type */}
          <div>
            <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Block Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(BLOCK_TYPE_CONFIG).map(([t, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setType(t as BlockType); setErrors({}); }}
                    className={`h-14 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all
                      ${type === t ? `${config.bgColor} ${config.color} ${config.borderColor} border` : 'border-[#1e293b] text-[#64748b] hover:border-[#334155]'}`}
                  >
                    <Icon className="w-4 h-4" /> {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Court */}
          <div>
            <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Court</label>
            <select value={courtId} onChange={e => setCourtId(e.target.value)} className={selectClass}>
              {COURTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Recurring toggle — weekly slot vs a one-off single date */}
          <div className="flex items-center justify-between py-2 border-t border-[#1e293b]">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-[#818cf8]" />
              <div>
                <span className="text-sm text-[#cbd5e1]">{isRecurring ? `Repeat on ${DAYS[dayOfWeek]}s` : 'One-off date'}</span>
                <p className="text-[10px] text-[#475569]">{isRecurring ? 'Blocks this weekday — choose how often below' : 'Blocks a single specific date'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsRecurring(!isRecurring)}
              className={`w-11 h-6 rounded-full transition-colors relative ${isRecurring ? 'bg-[#6366f1]' : 'bg-[#1e293b]'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${isRecurring ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {/* Day of week (recurring) — picking a day locks it in; no separate "first date" step.
              One-off — a single date picker (its weekday is derived automatically). */}
          {isRecurring ? (
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Day of Week</label>
              <div className="grid grid-cols-7 gap-1">
                {DAYS_SHORT.map((day, i) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setDayOfWeek(i)}
                    className={`h-10 rounded-lg text-xs font-bold transition-all
                      ${dayOfWeek === i ? 'bg-[#6366f1] text-white' : 'bg-[#0b0f1e] border border-[#1e293b] text-[#64748b] hover:border-[#334155]'}`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#475569] mt-1">Blocks every {DAYS[dayOfWeek]} from this week onward.</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Date</label>
              <input
                type="date"
                value={oneOffDate}
                min={toLocalYMD(new Date())}
                onChange={e => {
                  setOneOffDate(e.target.value);
                  if (e.target.value) setDayOfWeek(jsDayToIndex(new Date(e.target.value + 'T00:00:00').getDay()));
                }}
                className={inputClass}
              />
              {errors.oneOffDate && <p className="text-xs text-red-400 mt-1">{errors.oneOffDate}</p>}
              <p className="text-[10px] text-[#475569] mt-1">The single date this block applies to.</p>
            </div>
          )}

          {/* Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
              {errors.endTime && <p className="text-xs text-red-400 mt-1">{errors.endTime}</p>}
            </div>
          </div>

          {/* Repeat interval (only if recurring) */}
          {isRecurring && (
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Repeat every</label>
              <select
                value={intervalWeeks}
                onChange={e => setIntervalWeeks(parseInt(e.target.value))}
                className={selectClass}
              >
                {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n} week{n === 1 ? '' : 's'}</option>
                ))}
              </select>
              <p className="text-[10px] text-[#475569] mt-1">
                Choose 2 weeks for a team that plays every second {DAYS[dayOfWeek]}
              </p>
            </div>
          )}

          {/* End Date (only if recurring) */}
          {isRecurring && (
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">
                End Date <span className="text-[#475569] normal-case">(optional — leave blank for indefinite)</span>
              </label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={toLocalYMD(new Date())} className={inputClass} />
              {!endDate && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <p className="text-[10px] text-amber-400">This block will run indefinitely until you remove it</p>
                </div>
              )}
            </div>
          )}

          {/* Client info for block bookings */}
          {type === 'block-booking' && (
            <div className="space-y-3 border-t border-[#1e293b] pt-4">
              <h4 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider">Client Information</h4>
              <div>
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Client Name *</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
                  <input type="text" placeholder="e.g. John Smith" value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    className={`${inputClass} pl-10`} />
                </div>
                {errors.clientName && <p className="text-xs text-red-400 mt-1">{errors.clientName}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
                  <input type="tel" placeholder="+27 62 284 0601" value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    className={`${inputClass} pl-10`} />
                </div>
              </div>
            </div>
          )}

          {/* Reason for closed/maintenance */}
          {type !== 'block-booking' && (
            <div className="space-y-3 border-t border-[#1e293b] pt-4">
              <h4 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider">Reason</h4>
              <div>
                <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Reason *</label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-3 w-4 h-4 text-[#475569]" />
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder={type === 'closed' ? 'e.g. Private event' : 'e.g. Court resurfacing'}
                    className={`${inputClass} pl-10 pt-3 min-h-[80px] resize-none`}
                  />
                </div>
                {errors.reason && <p className="text-xs text-red-400 mt-1">{errors.reason}</p>}
              </div>
            </div>
          )}

          {/* Error message */}
          {submitError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{submitError}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#1e293b]">
            <button type="button" onClick={onClose}
              className="h-11 px-5 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-white text-sm font-semibold transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50">
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Block {DAYS[dayOfWeek]} {startTime}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
}
