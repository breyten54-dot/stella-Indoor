import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Users, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { getBookingInvite, joinBookingByInvite, type BookingInvite } from '@/hooks/useFirestoreBookings';

interface JoinBookingProps {
  token: string;
  userEmail: string;
  onJoined: () => void;
}

export function JoinBooking({ token, userEmail, onJoined }: JoinBookingProps) {
  const [invite, setInvite] = useState<BookingInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBookingInvite(token)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError('This invite link is invalid or has expired.');
        } else if (!data.active) {
          setError('This invite link is no longer active.');
        } else if (data.uses >= data.maxUses) {
          setError('This invite link has reached its usage limit.');
        } else {
          setInvite(data);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load invite');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const handleJoin = async () => {
    if (!invite || joining) return;
    setJoining(true);
    setError(null);
    try {
      await joinBookingByInvite(token);
      setJoined(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join booking');
    } finally {
      setJoining(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-[#1B7A40] animate-spin mb-4" />
        <p className="text-[#8A8A8A] text-sm">Loading invite...</p>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Invite unavailable</h1>
        <p className="text-[#8A8A8A] text-sm text-center max-w-xs">{error}</p>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 rounded-full bg-[#1B7A40] flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-white" strokeWidth={3} />
        </motion.div>
        <h1 className="text-2xl font-black text-white mb-2">You&apos;re in!</h1>
        <p className="text-[#8A8A8A] text-sm text-center max-w-xs mb-8">
          You&apos;ve been added to the booking. You can now view it in My Bookings and watch Stella Clips for this game.
        </p>
        <button
          onClick={onJoined}
          className="h-14 px-8 rounded-xl bg-[#1B7A40] hover:bg-[#145C32] text-white font-bold text-base transition-colors"
        >
          Go to Home
        </button>
      </div>
    );
  }

  if (!invite) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#1B7A40]/20 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-[#7ED321]" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">Join Booking</h1>
          <p className="text-[#8A8A8A] text-sm">You&apos;ve been invited to a game</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5 space-y-4 mb-6"
        >
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-[#7ED321] shrink-0" />
            <div>
              <p className="text-xs text-[#8A8A8A]">Court</p>
              <p className="text-sm font-semibold text-white">{invite.courtName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-[#7ED321] shrink-0" />
            <div>
              <p className="text-xs text-[#8A8A8A]">Date</p>
              <p className="text-sm font-semibold text-white">{formatDate(invite.date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-[#7ED321] shrink-0" />
            <div>
              <p className="text-xs text-[#8A8A8A]">Time</p>
              <p className="text-sm font-semibold text-white">{invite.startTime} — {invite.endTime}</p>
            </div>
          </div>
          <div className="pt-3 border-t border-[#2A2A2A]">
            <p className="text-xs text-[#8A8A8A]">Signed in as</p>
            <p className="text-sm font-semibold text-white">{userEmail}</p>
          </div>
        </motion.div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full h-14 rounded-xl bg-[#1B7A40] hover:bg-[#145C32] disabled:bg-[#1B7A40]/50 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors"
        >
          {joining ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Joining...</>
          ) : (
            'Join Booking'
          )}
        </button>

        <p className="mt-4 text-center text-xs text-[#5A5A5A]">
          Joining gives you access to this booking and its Stella Clips footage.
        </p>
      </div>
    </div>
  );
}
