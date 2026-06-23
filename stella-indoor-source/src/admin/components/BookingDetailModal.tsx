import { useState } from 'react';
import { ModalPortal } from '@/admin/components/ModalPortal';
import {
  X, User, Phone, Mail, Clock, MapPin, CreditCard, CalendarDays,
  Trash2, AlertTriangle, CheckCircle2, XCircle, AlertOctagon, Ticket
} from 'lucide-react';
import type { BookingRecord } from '@/types/booking';

interface Props {
  booking: BookingRecord;
  onClose: () => void;
  onCancel: (booking: BookingRecord) => Promise<void>;
  onPlayed: (booking: BookingRecord) => Promise<void>;
  onMissed: (booking: BookingRecord) => Promise<{ banned: boolean; missedCount: number }>;
}

export function BookingDetailModal({ booking, onClose, onCancel, onPlayed, onMissed }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [markingAttendance, setMarkingAttendance] = useState<'played' | 'missed' | null>(null);
  const [banResult, setBanResult] = useState<{ banned: boolean; missedCount: number } | null>(null);

  const alreadyMarked = booking.attendance === 'played' || booking.attendance === 'missed';

  const handleCancel = async () => {
    setCancelling(true);
    try { await onCancel(booking); onClose(); } finally { setCancelling(false); }
  };

  const handlePlayed = async () => {
    setMarkingAttendance('played');
    try { await onPlayed(booking); } finally { setMarkingAttendance(null); }
  };

  const handleMissed = async () => {
    setMarkingAttendance('missed');
    try {
      const result = await onMissed(booking);
      setBanResult(result);
      if (result.banned) setTimeout(() => onClose(), 3000);
    } finally { setMarkingAttendance(null); }
  };

  return (
    <ModalPortal>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container - fills viewport, centers modal */}
      <div className="fixed inset-0 z-[99999] flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
        {/* Modal Card */}
        <div
          className="bg-[#13182b] rounded-2xl border border-[#1e293b] shadow-2xl w-full max-w-[calc(100%-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto my-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[#1e293b]">
            <h3 className="text-base font-bold text-white">Booking Details</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1e293b] flex items-center justify-center text-[#64748b] hover:text-white hover:bg-[#334155] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Status badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${booking.status === 'confirmed' ? 'bg-[#6366f1]/10 text-[#818cf8]' : 'bg-red-500/10 text-red-400'}`}>
                {booking.status.toUpperCase()}
              </span>
              {booking.attendance === 'played' && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> PLAYED
                </span>
              )}
              {booking.attendance === 'missed' && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> MISSED
                </span>
              )}
              {booking.attendance === 'pending' && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#1e293b] text-[#64748b]">
                  ATTENDANCE PENDING
                </span>
              )}
            </div>

            {/* Client Name */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Client Name</p>
                <p className="text-white font-semibold">{booking.clientDetails.fullName}</p>
                {booking.clientDetails.teamName && (
                  <p className="text-[#94a3b8] text-sm">{booking.clientDetails.teamName}</p>
                )}
              </div>
            </div>

            {/* Phone */}
            {booking.clientDetails.phone && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Contact Number</p>
                  <p className="text-white font-semibold">{booking.clientDetails.phone}</p>
                </div>
              </div>
            )}

            {/* Email */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Email</p>
                <p className="text-white font-semibold">{booking.clientDetails.email || booking.userEmail || '—'}</p>
              </div>
            </div>

            {/* Court */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Court</p>
                <p className="text-white font-semibold">{booking.courtName}</p>
              </div>
            </div>

            {/* Date & Time */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Date & Time</p>
                <p className="text-white font-semibold">{booking.date}</p>
                <p className="text-[#94a3b8] text-sm">{booking.startTime} — {booking.endTime} ({booking.duration}h)</p>
              </div>
            </div>

            {/* Price */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Payment</p>
                <p className="text-white font-semibold">R{booking.totalPrice}</p>
                <p className="text-[#94a3b8] text-sm">Cash on arrival</p>
              </div>
            </div>

            {/* Booking ID */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                <Ticket className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <p className="text-[#64748b] text-xs">Booking ID</p>
                <p className="text-white font-mono text-sm">{booking.id.slice(0, 12)}</p>
              </div>
            </div>

            {/* Special Requests */}
            {booking.clientDetails.specialRequests && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Special Requests</p>
                  <p className="text-white text-sm">{booking.clientDetails.specialRequests}</p>
                </div>
              </div>
            )}

            {/* Add-ons */}
            {(booking.addons.soccerBall > 0 || booking.addons.bibs > 0) && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-5 h-5 text-[#7ED321]" />
                </div>
                <div>
                  <p className="text-[#64748b] text-xs">Add-ons</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {booking.addons.soccerBall > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-[#8b5cf6]/20 text-[#8b5cf6] text-xs font-semibold">
                        {booking.addons.soccerBall}x Soccer Ball
                      </span>
                    )}
                    {booking.addons.bibs > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-[#ec4899]/20 text-[#ec4899] text-xs font-semibold">
                        {booking.addons.bibs}x Bibs
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Ban Result */}
            {banResult?.banned && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertOctagon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-400">Client Banned</p>
                  <p className="text-xs text-red-300 mt-1">This client has missed 3 bookings and has been permanently banned.</p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-5 border-t border-[#1e293b] space-y-3">
            {/* Attendance Buttons */}
            {booking.status === 'confirmed' && !alreadyMarked && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={handlePlayed} disabled={markingAttendance !== null}
                    className="h-12 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                    {markingAttendance === 'played' ? (
                      <span className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-500 rounded-full animate-spin" />
                    ) : (<><CheckCircle2 className="w-4 h-4" /> Played</>)}
                  </button>
                  <button onClick={handleMissed} disabled={markingAttendance !== null}
                    className="h-12 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                    {markingAttendance === 'missed' ? (
                      <span className="w-4 h-4 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin" />
                    ) : (<><XCircle className="w-4 h-4" /> Missed</>)}
                  </button>
                </div>
                <div className="flex items-start gap-2 text-[10px] text-amber-400/70">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>3 misses results in a permanent ban.</span>
                </div>
              </>
            )}

            {/* Already marked */}
            {alreadyMarked && (
              <div className={`rounded-xl p-3 flex items-center gap-2 text-xs font-semibold ${booking.attendance === 'played' ? 'bg-emerald-500/5 text-emerald-400' : 'bg-amber-500/5 text-amber-400'}`}>
                {booking.attendance === 'played' ? (
                  <><CheckCircle2 className="w-4 h-4" /> Client attended this booking</>
                ) : (
                  <><XCircle className="w-4 h-4" /> Client missed this booking</>
                )}
              </div>
            )}

            {/* Cancel Booking */}
            {!confirming ? (
              <button onClick={() => setConfirming(true)}
                className="w-full h-10 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 font-bold text-xs flex items-center justify-center gap-2 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Cancel Booking
              </button>
            ) : (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">Cancel this booking? This cannot be undone.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(false)}
                    className="flex-1 h-9 rounded-xl bg-[#1e293b] text-[#94a3b8] hover:text-white text-xs font-bold transition-colors">
                    Keep
                  </button>
                  <button onClick={handleCancel} disabled={cancelling}
                    className="flex-1 h-9 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-50">
                    {cancelling ? <span className="w-3 h-3 border border-red-300 border-t-red-500 rounded-full animate-spin" /> : <><Trash2 className="w-3 h-3" /> Cancel</>}
                  </button>
                </div>
              </div>
            )}

            {/* Close */}
            <button onClick={onClose}
              className="w-full h-10 rounded-xl bg-[#1e293b] text-[#94a3b8] hover:text-white text-xs font-bold transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
