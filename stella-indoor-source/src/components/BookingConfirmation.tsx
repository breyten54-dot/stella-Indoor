import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Calendar, Clock, MapPin, Banknote, Users, Copy, Share2 } from 'lucide-react';
import { generateBookingInvite } from '@/hooks/useFirestoreBookings';
import type { BookingState } from '@/types/booking';

interface BookingConfirmationProps {
  state: BookingState;
  totalPrice: number;
  onBookAnother: () => void;
  bookingRef: string;
}

export function BookingConfirmation({ state, totalPrice, onBookAnother, bookingRef }: BookingConfirmationProps) {
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleGenerateInvite = async () => {
    if (!bookingRef || inviteLoading) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const token = await generateBookingInvite(bookingRef);
      const link = `${window.location.origin}${window.location.pathname}?join=${token}#/`;
      setInviteLink(link);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create invite link';
      setInviteError(message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      window.prompt('Copy this invite link:', inviteLink);
    }
  };

  const handleNativeShare = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my Stella Indoor booking', url: inviteLink });
        return;
      } catch {
        // fall through to copy
      }
    }
    handleCopyInvite();
  };

  useEffect(() => {
    const canvas = confettiRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#1B7A40', '#7ED321', '#FFFFFF', '#145C32', '#A8E06C'];
    const particles = Array.from({ length: 120 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20 - 10,
      gravity: 0.25,
      friction: 0.98,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
    }));

    let frame = 0;
    function animate() {
      if (!ctx || !canvas || frame >= 180) { ctx?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.vx *= p.friction; p.vy *= p.friction; p.vy += p.gravity;
        p.x += p.vx; p.y += p.vy; p.rotation += p.rotationSpeed; p.opacity -= 0.004;
        if (p.opacity <= 0) continue;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity); ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
      }
      frame++; requestAnimationFrame(animate);
    }
    animate();
  }, []);

  const { court, dateTime, addons } = state;

  const getEndTime = () => {
    if (!dateTime) return '';
    const [h, m] = dateTime.time.split(':').map(Number);
    const totalMinutes = h * 60 + m + dateTime.duration * 60;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  };

  const hasAddons = addons.soccerBall > 0 || addons.bibs > 0;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0A0A0A] flex items-center justify-center p-4 overflow-auto">
      <canvas ref={confettiRef} className="absolute inset-0 pointer-events-none z-10" />
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-[#1B7A40]/20 to-transparent pointer-events-none" />

      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0.2 }}
        className="relative z-20 w-full max-w-md text-center">

        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 400, delay: 0.3 }}
          className="w-20 h-20 rounded-full bg-[#1B7A40] flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-white" strokeWidth={3} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <h1 className="text-3xl font-black text-white mb-2">Booking Confirmed!</h1>
          <p className="text-[#8A8A8A] mb-4">Your court is reserved. A confirmation email has been sent.</p>
          <p className="text-lg font-mono text-[#7ED321] font-bold tracking-wider mb-6">{bookingRef}</p>
        </motion.div>

        {/* Invite players */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52 }}
          className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 mb-4 text-left">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-[#7ED321]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Invite Players</p>
              <p className="text-xs text-[#8A8A8A] mt-0.5">Share this booking so teammates can join and view Stella Clips.</p>

              {!inviteLink ? (
                <button
                  onClick={handleGenerateInvite}
                  disabled={inviteLoading}
                  className="mt-3 w-full h-11 rounded-xl bg-[#1B7A40] hover:bg-[#145C32] disabled:bg-[#1B7A40]/50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {inviteLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Share2 className="w-4 h-4" /> Create Invite Link</>
                  )}
                </button>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl px-3 py-2">
                    <input
                      readOnly
                      value={inviteLink}
                      className="flex-1 min-w-0 bg-transparent text-xs text-[#B0B0A8] outline-none"
                    />
                    <button
                      onClick={handleCopyInvite}
                      className="shrink-0 h-8 px-3 rounded-lg bg-[#2A2A2A] hover:bg-[#3A3A3A] text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      {inviteCopied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                  </div>
                  <button
                    onClick={handleNativeShare}
                    className="w-full h-10 rounded-xl border border-[#2A2A2A] hover:border-[#1B7A40] text-[#8A8A8A] hover:text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Share2 className="w-4 h-4" /> Share Link
                  </button>
                </div>
              )}
              {inviteError && (
                <p className="mt-2 text-xs text-red-400">{inviteError}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Cash payment notice */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          className="bg-[#1B7A40]/20 border border-[#1B7A40]/30 rounded-xl p-4 mb-6 text-left">
          <div className="flex items-start gap-3">
            <Banknote className="w-5 h-5 text-[#7ED321] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-white">Cash Payment on Arrival</p>
              <p className="text-xs text-[#8A8A8A] mt-0.5">Pay <span className="text-[#7ED321] font-bold">R{totalPrice}</span> in cash when you arrive. No online payment required.</p>
            </div>
          </div>
        </motion.div>

        {/* Summary */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="bg-[#141414] rounded-2xl p-6 text-left mb-8 space-y-4">
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-[#7ED321] shrink-0" />
            <div>
              <p className="text-xs text-[#8A8A8A]">Court</p>
              <p className="text-sm font-semibold text-white">{court?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-[#7ED321] shrink-0" />
            <div>
              <p className="text-xs text-[#8A8A8A]">Duration</p>
              <p className="text-sm font-semibold text-white">{dateTime?.duration} hour{dateTime?.duration !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-[#7ED321] shrink-0" />
            <div>
              <p className="text-xs text-[#8A8A8A]">Date & Time</p>
              <p className="text-sm font-semibold text-white">
                {dateTime && new Date(dateTime.date).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })} at {dateTime?.time} — {getEndTime()}
              </p>
            </div>
          </div>
          {hasAddons && (
            <div className="pt-3 border-t border-[#2A2A2A]">
              <p className="text-xs text-[#8A8A8A] mb-2">Add-ons</p>
              {addons.soccerBall > 0 && <p className="text-sm text-[#B0B0A8]">Soccer Ball x{addons.soccerBall}</p>}
              {addons.bibs > 0 && <p className="text-sm text-[#B0B0A8]">Bibs x{addons.bibs}</p>}
            </div>
          )}
          <div className="pt-3 border-t border-[#2A2A2A] flex justify-between items-center">
            <span className="text-sm text-[#8A8A8A]">Amount Due (Cash)</span>
            <span className="text-2xl font-extrabold text-[#7ED321] tab-nums">R{totalPrice}</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="flex flex-col gap-3">
          <button onClick={onBookAnother}
            className="w-full h-14 bg-[#1B7A40] hover:bg-[#145C32] text-white rounded-xl font-bold text-base transition-colors duration-200">
            Book Another Court
          </button>
          <a href="https://wa.me/27622840601" target="_blank" rel="noopener noreferrer"
            className="w-full h-12 border border-[#2A2A2A] hover:border-[#1B7A40] text-[#8A8A8A] hover:text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors duration-200">
            Contact us on WhatsApp
          </a>
        </motion.div>
      </motion.div>
    </div>
  );
}
