import { useMemo, useState } from 'react';
import { ModalPortal } from '@/admin/components/ModalPortal';
import {
  Ban, Calendar as CalIcon, Clock, FileText, Lock, Phone, User, X,
  Check, RotateCcw, AlertTriangle, Banknote, Pencil
} from 'lucide-react';
import type { BookingRecord } from '@/types/booking';
import { blockAppliesToDate, type BlockedSlot, useBlockedSlots } from '@/admin/hooks/useBlockedSlots';
import { useBlockNotes, type PaymentCadence } from '@/admin/hooks/useBlockNotes';
import { useAdminAuth } from '@/admin/hooks/useAdminAuth';
import { localDateStr } from '@/lib/dates';

interface BlockDetailModalProps {
  block: BlockedSlot;
  viewDate: string;
  bookings: BookingRecord[];
  onClose: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function jsDayToIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatCurrency(n: number): string {
  return `R${n.toLocaleString('en-ZA', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}

function cadenceLabel(c: PaymentCadence): string {
  return c === 'on-the-day' ? 'On the day' : 'Monthly';
}

export function BlockDetailModal({ block, viewDate, bookings, onClose }: BlockDetailModalProps) {
  const { updateBlockedSlot } = useBlockedSlots();
  const { firebaseUser } = useAdminAuth();
  const adminEmail = firebaseUser?.email || '';
  const { note, saveNote } = useBlockNotes(block.id);

  const [releaseLoading, setReleaseLoading] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingNote, setEditingNote] = useState(false);
  const [noteCadence, setNoteCadence] = useState<PaymentCadence>('on-the-day');
  const [noteRate, setNoteRate] = useState<string>('0');

  const isToday = viewDate === localDateStr(new Date());
  const applies = blockAppliesToDate(block, viewDate);
  const released = block.releasedDates?.includes(viewDate) ?? false;

  const overlappingBooking = useMemo(() => {
    const bStart = timeToMinutes(block.startTime);
    const bEnd = timeToMinutes(block.endTime);
    return bookings.find((b) => {
      if (b.status !== 'confirmed' || b.date !== viewDate || b.courtId !== block.courtId) return false;
      const start = timeToMinutes(b.startTime);
      const end = timeToMinutes(b.endTime);
      return start < bEnd && end > bStart;
    });
  }, [bookings, block, viewDate]);

  const startEditNote = () => {
    setNoteCadence(note?.paymentCadence || 'on-the-day');
    setNoteRate(String(note?.rate || 0));
    setEditingNote(true);
  };

  const handleSaveNote = async () => {
    if (!adminEmail) return;
    try {
      await saveNote(
        {
          paymentCadence: noteCadence,
          rate: Number(noteRate) || 0,
        },
        adminEmail
      );
      setEditingNote(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payment note');
    }
  };

  const handleRelease = async () => {
    setReleaseLoading(true);
    setError(null);
    try {
      const next = Array.from(new Set([...(block.releasedDates || []), viewDate]));
      await updateBlockedSlot(block.id, { releasedDates: next });
      setConfirmRelease(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Release failed');
    } finally {
      setReleaseLoading(false);
    }
  };

  const handleUndo = async () => {
    if (overlappingBooking) return;
    setReleaseLoading(true);
    setError(null);
    try {
      const next = (block.releasedDates || []).filter((d) => d !== viewDate);
      await updateBlockedSlot(block.id, { releasedDates: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed');
    } finally {
      setReleaseLoading(false);
    }
  };

  const blockColors = {
    'block-booking': { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    'closed': { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    'maintenance': { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  };
  const colors = blockColors[block.type];
  const label = block.type === 'block-booking' ? 'Block Booking' : block.type === 'closed' ? 'Closed' : 'Maintenance';

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
              <span className={`text-xs font-bold ${colors.text}`}>{label}</span>
            </div>

            {/* Client Name (block bookings only) */}
            {block.clientName && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#6366f1]/20 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[#818cf8]" />
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
                <div className="w-10 h-10 rounded-xl bg-[#6366f1]/20 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5 text-[#818cf8]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Contact Number</p>
                  <p className="text-white font-semibold">{block.clientPhone}</p>
                </div>
              </div>
            )}

            {/* Court & Time */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#6366f1]/20 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-[#818cf8]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Court & Time</p>
                <p className="text-white font-semibold">{block.courtName}</p>
                <p className="text-[#94a3b8] text-sm">{block.startTime} - {block.endTime}</p>
              </div>
            </div>

            {/* Day / Schedule */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#6366f1]/20 flex items-center justify-center shrink-0">
                <CalIcon className="w-5 h-5 text-[#818cf8]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Schedule</p>
                {block.exactDates && block.exactDates.length > 0 ? (
                  <p className="text-white font-semibold">Exact dates: {block.exactDates.join(', ')}</p>
                ) : block.isRecurring ? (
                  <p className="text-white font-semibold">
                    {DAYS[jsDayToIndex(block.dayOfWeek ?? new Date(block.startDate).getDay())]}s
                    <span className="text-[#64748b] text-xs ml-1">
                      (every {block.intervalWeeks === 1 || !block.intervalWeeks ? 'week' : `${block.intervalWeeks} weeks`})
                    </span>
                  </p>
                ) : (
                  <p className="text-white font-semibold">{block.startDate}</p>
                )}
              </div>
            </div>

            {/* Date Range */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#6366f1]/20 flex items-center justify-center shrink-0">
                <CalIcon className="w-5 h-5 text-[#818cf8]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Date Range</p>
                <p className="text-white font-semibold">{block.startDate} {block.endDate ? `→ ${block.endDate}` : '→ Indefinite'}</p>
              </div>
            </div>

            {/* Reason/Notes */}
            {block.reason && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#6366f1]/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-[#818cf8]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Notes</p>
                  <p className="text-white text-sm">{block.reason}</p>
                </div>
              </div>
            )}

            {/* Payment note (admin-only) */}
            <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-[#818cf8]" />
                <span className="text-xs font-bold text-white">Payment note</span>
              </div>

              {!editingNote ? (
                <div className="space-y-2">
                  {note ? (
                    <div className="text-sm text-[#94a3b8]">
                      <p className="text-white font-semibold">
                        Pays {cadenceLabel(note.paymentCadence).toLowerCase()} · {formatCurrency(note.rate)}
                      </p>
                      <p className="text-[10px] mt-1">Updated {new Date(note.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} by {note.updatedBy}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-[#64748b]">No payment note yet — add one.</p>
                  )}
                  <button
                    onClick={startEditNote}
                    className="flex items-center gap-1.5 text-xs font-bold text-[#818cf8] hover:text-white transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> {note ? 'Edit' : 'Add'} payment note
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNoteCadence('on-the-day')}
                      className={`flex-1 h-9 rounded-lg text-xs font-bold border transition-colors ${noteCadence === 'on-the-day' ? 'bg-[#6366f1] border-[#6366f1] text-white' : 'border-[#1e293b] text-[#94a3b8] hover:border-[#6366f1]'}`}
                    >
                      On the day
                    </button>
                    <button
                      onClick={() => setNoteCadence('monthly')}
                      className={`flex-1 h-9 rounded-lg text-xs font-bold border transition-colors ${noteCadence === 'monthly' ? 'bg-[#6366f1] border-[#6366f1] text-white' : 'border-[#1e293b] text-[#94a3b8] hover:border-[#6366f1]'}`}
                    >
                      Monthly
                    </button>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1">Rate (ZAR)</label>
                    <input
                      type="number"
                      min={0}
                      value={noteRate}
                      onChange={(e) => setNoteRate(e.target.value)}
                      className="w-full h-10 rounded-lg bg-[#0b0f1e] border border-[#1e293b] text-white text-sm px-3 focus:outline-none focus:border-[#6366f1]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingNote(false)}
                      className="flex-1 h-9 rounded-lg bg-[#1e293b] text-[#94a3b8] text-xs font-bold hover:bg-[#334155] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNote}
                      className="flex-1 h-9 rounded-lg bg-[#6366f1] text-white text-xs font-bold hover:bg-[#4f46e5] transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2 text-xs text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="p-5 border-t border-[#1e293b] space-y-3">
            {block.isRecurring && applies && !released && !overlappingBooking && (
              <>
                {!confirmRelease ? (
                  <button
                    onClick={() => setConfirmRelease(true)}
                    disabled={releaseLoading}
                    className="w-full h-11 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {isToday ? 'Release for today' : 'Release for this day'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-[#94a3b8] text-center">
                      Release <span className="text-white font-semibold">{new Date(viewDate).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short' })}</span>, {block.startTime}–{block.endTime}, {block.courtName} and notify all clients?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmRelease(false)}
                        disabled={releaseLoading}
                        className="flex-1 h-10 rounded-lg bg-[#1e293b] text-[#94a3b8] text-xs font-bold hover:bg-[#334155] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRelease}
                        disabled={releaseLoading}
                        className="flex-1 h-10 rounded-lg bg-[#6366f1] text-white text-xs font-bold hover:bg-[#4f46e5] transition-colors disabled:opacity-50"
                      >
                        {releaseLoading ? 'Releasing...' : 'Confirm release'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {released && (
              <>
                {overlappingBooking ? (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400 text-center">
                    Booked by {overlappingBooking.clientDetails.fullName} — cancel the booking to reclaim this slot.
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg bg-[#6366f1]/10 border border-[#6366f1]/20 p-3 text-xs text-[#818cf8] text-center">
                      Released for this day — open to clients
                    </div>
                    <button
                      onClick={handleUndo}
                      disabled={releaseLoading}
                      className="w-full h-11 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-[#94a3b8] hover:text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Undo release
                    </button>
                  </>
                )}
              </>
            )}

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
