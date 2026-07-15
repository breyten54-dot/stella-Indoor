import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Download, Share2, X, Play, ChevronDown, Video, Calendar, Clock, ChevronLeft, Plus, Check } from 'lucide-react';
import { useClips } from '@/hooks/useClips';
import { subscribeToUserBookings } from '@/hooks/useFirestoreBookings';
import type { Clip } from '@/types/clips';
import type { BookingRecord } from '@/types/booking';

export interface SharedClipSlot {
  date: string;
  startTime: string;
  endTime: string;
  camera?: 'cam1' | 'cam2';
}

interface StellaClipsProps {
  userEmail: string;
  sharedSlot?: SharedClipSlot;
  onClose: () => void;
}

// Only the Big Court has cameras today.
const CLIPS_COURT_ID = 'big-court';
const CAMERA_BUFFER_MINUTES = 30;

type Step = 'bookings' | 'cameras' | 'feed';

function VideoCard({ clip, isActive, onToggleLike, isLiked }: {
  clip: Clip; isActive: boolean; onToggleLike: (id: string) => void; isLiked: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isActive]);

  const handleDownload = async () => {
    try {
      const response = await fetch(clip.videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stella_clip_${clip.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(clip.videoUrl, '_blank');
    }
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        src={clip.videoUrl}
        poster={clip.thumbnailUrl}
        className="w-full h-full object-contain"
        loop
        playsInline
        onClick={() => {
          const v = videoRef.current;
          if (!v) return;
          if (v.paused) { v.play(); setIsPlaying(true); }
          else { v.pause(); setIsPlaying(false); }
        }}
      />

      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
              <Play className="w-8 h-8 text-white ml-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        <button onClick={(e) => { e.stopPropagation(); onToggleLike(clip.id); }} className="flex flex-col items-center gap-1 group">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-[#1B7A40]' : 'bg-white/10 backdrop-blur-sm'}`}>
            <Heart className={`w-6 h-6 transition-all ${isLiked ? 'text-white fill-white scale-110' : 'text-white group-hover:scale-110'}`} />
          </div>
          <span className="text-white text-xs font-bold">{clip.likes}</span>
        </button>

        <button onClick={(e) => { e.stopPropagation(); handleDownload(); }} className="flex flex-col items-center gap-1 group">
          <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/20 transition-all">
            <Download className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-bold">Save</span>
        </button>

        <button onClick={(e) => { e.stopPropagation(); if (navigator.share) navigator.share({ url: window.location.href }).catch(()=>{}); }} className="flex flex-col items-center gap-1 group">
          <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/20 transition-all">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-bold">Share</span>
        </button>
      </div>
    </div>
  );
}

function Header({ title, onBack, onClose, backLabel }: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
  backLabel?: string;
}) {
  return (
    <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
      {onBack ? (
        <button onClick={onBack} className="flex items-center gap-1 text-white/80 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          {backLabel && <span className="text-xs font-bold">{backLabel}</span>}
        </button>
      ) : (
        <div className="w-10" />
      )}
      <h2 className="text-white font-bold text-sm tracking-wider">{title}</h2>
      <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
        <X className="w-5 h-5 text-white" />
      </button>
    </div>
  );
}

function BookingSelector({ userEmail, onSelect, onClose }: {
  userEmail: string;
  onSelect: (booking: BookingRecord) => void;
  onClose: () => void;
}) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToUserBookings(userEmail, (data) => {
      // Only show confirmed Big Court bookings (the only court with cameras today).
      const eligible = data
        .filter(b => b.status === 'confirmed' && b.courtId === CLIPS_COURT_ID)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.startTime.localeCompare(b.startTime));
      setBookings(eligible);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userEmail]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col">
      <Header title="STELLA CLIPS" onClose={onClose} />

      <div className="flex-1 flex flex-col px-4 pb-6 overflow-y-auto">
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-2xl bg-[#1B7A40]/20 flex items-center justify-center mx-auto mb-4">
            <Video className="w-8 h-8 text-[#7ED321]" />
          </div>
          <h3 className="text-white font-bold text-xl">Select Your Time Slot</h3>
          <p className="text-[#8A8A8A] text-sm mt-1">Choose the booking you want to view clips from</p>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-3 border-white/20 border-t-[#1B7A40] rounded-full animate-spin" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <Calendar className="w-12 h-12 text-white/20 mb-4" />
            <p className="text-white font-bold text-lg">No eligible bookings</p>
            <p className="text-white/40 text-sm mt-2 max-w-xs">
              You need a confirmed Big Court booking to view Stella Clips.
            </p>
            <button onClick={onClose} className="mt-6 h-11 px-6 rounded-full bg-[#1B7A40] text-white text-sm font-bold hover:bg-[#145C32] transition-colors">
              Back to Home
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-md mx-auto w-full">
            {bookings.map((booking) => (
              <button
                key={booking.id}
                onClick={() => onSelect(booking)}
                className="w-full text-left rounded-2xl bg-gradient-to-r from-[#1B7A40]/30 to-[#1B7A40]/10 border border-[#1B7A40]/40 p-4 hover:border-[#7ED321]/60 hover:from-[#1B7A40]/40 hover:to-[#1B7A40]/20 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-base">{booking.courtName}</p>
                    <div className="flex items-center gap-3 text-[#8A8A8A] text-xs mt-1.5">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(booking.date)}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {booking.startTime} — {booking.endTime}</span>
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-[#8A8A8A] -rotate-90" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CameraSelector({ shareUrl, onSelect, onBack, onClose }: {
  shareUrl?: string;
  onSelect: (cam: 'cam1' | 'cam2') => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
        <button onClick={onBack} className="flex items-center gap-1 text-white/80 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-xs font-bold">Slots</span>
        </button>
        <h2 className="text-white font-bold text-sm tracking-wider">STELLA CLIPS</h2>
        <div className="flex items-center gap-2">
          {shareUrl && (
            <button
              onClick={handleShare}
              className="h-10 px-3 rounded-full bg-[#1B7A40] hover:bg-[#145C32] flex items-center gap-1.5 text-white text-xs font-bold transition-colors"
            >
              {copied ? (
                <><Check className="w-4 h-4" /> Copied</>
              ) : (
                <><Plus className="w-4 h-4" /> Share</>
              )}
            </button>
          )}
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-center mb-2">
          <div className="w-16 h-16 rounded-2xl bg-[#1B7A40]/20 flex items-center justify-center mx-auto mb-4">
            <Video className="w-8 h-8 text-[#7ED321]" />
          </div>
          <h3 className="text-white font-bold text-xl">Choose a Camera</h3>
          <p className="text-[#8A8A8A] text-sm mt-1">Select which camera's clips to watch</p>
        </div>

        <button
          onClick={() => onSelect('cam1')}
          className="w-full max-w-sm h-20 rounded-2xl bg-gradient-to-r from-[#1B7A40]/30 to-[#1B7A40]/10 border border-[#1B7A40]/40 flex items-center gap-4 px-5 hover:border-[#7ED321]/60 hover:from-[#1B7A40]/40 hover:to-[#1B7A40]/20 transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-[#1B7A40]/30 flex items-center justify-center shrink-0">
            <Video className="w-6 h-6 text-[#7ED321]" />
          </div>
          <div className="text-left">
            <p className="text-white font-bold text-base">Camera 1</p>
            <p className="text-[#8A8A8A] text-xs">Big Court — Left Side</p>
          </div>
          <ChevronDown className="w-5 h-5 text-[#8A8A8A] ml-auto -rotate-90" />
        </button>

        <button
          onClick={() => onSelect('cam2')}
          className="w-full max-w-sm h-20 rounded-2xl bg-gradient-to-r from-[#1B7A40]/30 to-[#1B7A40]/10 border border-[#1B7A40]/40 flex items-center gap-4 px-5 hover:border-[#7ED321]/60 hover:from-[#1B7A40]/40 hover:to-[#1B7A40]/20 transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-[#1B7A40]/30 flex items-center justify-center shrink-0">
            <Video className="w-6 h-6 text-[#7ED321]" />
          </div>
          <div className="text-left">
            <p className="text-white font-bold text-base">Camera 2</p>
            <p className="text-[#8A8A8A] text-xs">Big Court — Right Side</p>
          </div>
          <ChevronDown className="w-5 h-5 text-[#8A8A8A] ml-auto -rotate-90" />
        </button>
      </div>

      <div className="shrink-0 text-center pb-6 pt-4">
        <p className="text-[#5A5A5A] text-xs">Tap a camera to view its clips</p>
      </div>
    </div>
  );
}

function ClipsFeed({ filter, cameraLabel, userEmail, shareUrl, onBack, onClose }: {
  filter: { cameraId: string; startTime: number; endTime: number };
  cameraLabel: string;
  userEmail: string;
  shareUrl?: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { clips, loading, cotw, toggleLike, isLikedByUser, refreshOldClips } = useClips(filter);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCotw, setShowCotw] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      window.prompt('Copy this link:', shareUrl);
    }
  };

  useEffect(() => {
    refreshOldClips();
  }, [refreshOldClips]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const idx = Math.round(container.scrollTop / container.clientHeight);
    if (idx !== currentIndex && idx >= 0 && idx < clips.length) {
      setCurrentIndex(idx);
    }
  }, [currentIndex, clips.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    const container = containerRef.current;
    if (!container || Math.abs(diff) <= 80) return;
    const h = container.clientHeight;
    if (diff > 0 && currentIndex < clips.length - 1) {
      container.scrollTo({ top: (currentIndex + 1) * h, behavior: 'smooth' });
    } else if (diff < 0 && currentIndex > 0) {
      container.scrollTo({ top: (currentIndex - 1) * h, behavior: 'smooth' });
    }
  };

  const handleToggleLike = useCallback(async (clipId: string) => {
    await toggleLike(clipId, userEmail);
  }, [toggleLike, userEmail]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const h = container.clientHeight;
      if (e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        if (currentIndex < clips.length - 1) container.scrollTo({ top: (currentIndex + 1) * h, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentIndex > 0) container.scrollTo({ top: (currentIndex - 1) * h, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentIndex, clips.length]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-[#1B7A40] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-3 pb-2">
        <button onClick={onBack} className="flex items-center gap-1 text-white/80 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-xs font-bold">Cameras</span>
        </button>
        <h2 className="text-white font-bold text-sm tracking-wider">{cameraLabel}</h2>
        <div className="flex items-center gap-2">
          {shareUrl && (
            <button
              onClick={handleShare}
              className="h-10 px-3 rounded-full bg-white/10 backdrop-blur-sm flex items-center gap-1.5 text-white text-xs font-bold hover:bg-white/20 transition-colors"
            >
              {copied ? (
                <><Check className="w-4 h-4" /> Copied</>
              ) : (
                <><Plus className="w-4 h-4" /> Share</>
              )}
            </button>
          )}
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {cotw && (
        <button
          onClick={() => setShowCotw(true)}
          className="absolute top-14 right-3 z-20 w-14 h-20 rounded-lg overflow-hidden border-2 border-amber-400 shadow-lg shadow-amber-400/30"
        >
          <img src={cotw.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <span className="text-amber-400 text-[10px] font-bold">#1</span>
          </div>
        </button>
      )}

      {showCotw && cotw && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
          onClick={() => setShowCotw(false)}
        >
          <button onClick={() => setShowCotw(false)} className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </button>
          <video
            src={cotw.videoUrl}
            poster={cotw.thumbnailUrl}
            className="w-full h-full object-contain"
            controls
            autoPlay
            playsInline
          />
        </motion.div>
      )}

      {clips.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center px-8">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Play className="w-10 h-10 text-white/20" />
          </div>
          <p className="text-white font-bold text-lg">No clips for this slot</p>
          <p className="text-white/40 text-sm mt-2">No footage was recorded for the selected time range.</p>
          <button onClick={onBack} className="mt-6 h-10 px-5 rounded-full bg-[#1B7A40] text-white text-sm font-bold hover:bg-[#145C32] transition-colors">
            Choose Another Camera
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
          style={{ scrollBehavior: 'smooth' }}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {clips.map((clip, idx) => (
            <div key={clip.id} className="h-full w-full snap-start snap-always shrink-0">
              <VideoCard
                clip={clip}
                isActive={idx === currentIndex}
                onToggleLike={handleToggleLike}
                isLiked={isLikedByUser(clip, userEmail)}
              />
            </div>
          ))}
        </div>
      )}

      {clips.length > 1 && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1">
          {clips.map((_, idx) => (
            <div key={idx} className={`w-1 rounded-full transition-all duration-300 ${idx === currentIndex ? 'h-6 bg-[#1B7A40]' : 'h-2 bg-white/30'}`} />
          ))}
        </div>
      )}

      {clips.length > 1 && currentIndex === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: 2 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
          <ChevronDown className="w-5 h-5 text-white/50" />
          <span className="text-white/30 text-xs">Swipe up</span>
        </motion.div>
      )}
    </div>
  );
}

function buildShareUrl(slot: SharedClipSlot): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('shareClips', '1');
  url.searchParams.set('date', slot.date);
  url.searchParams.set('start', slot.startTime);
  url.searchParams.set('end', slot.endTime);
  if (slot.camera) {
    url.searchParams.set('camera', slot.camera);
  }
  return url.toString();
}

export function StellaClips({ userEmail, sharedSlot, onClose }: StellaClipsProps) {
  const initialStep: Step = sharedSlot
    ? (sharedSlot.camera ? 'feed' : 'cameras')
    : 'bookings';
  const [step, setStep] = useState<Step>(initialStep);
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
  const [cameraView, setCameraView] = useState<'cam1' | 'cam2' | null>(sharedSlot?.camera || null);

  const handleSelectBooking = (booking: BookingRecord) => {
    setSelectedBooking(booking);
    setStep('cameras');
  };

  const handleSelectCamera = (cam: 'cam1' | 'cam2') => {
    setCameraView(cam);
    setStep('feed');
  };

  const filter = useMemo(() => {
    if (sharedSlot && cameraView) {
      const cameraId = cameraView === 'cam1' ? 'big-court-cam1' : 'big-court-cam2';
      const start = new Date(`${sharedSlot.date}T${sharedSlot.startTime}`).getTime();
      const endDate = new Date(`${sharedSlot.date}T${sharedSlot.endTime}`);
      endDate.setMinutes(endDate.getMinutes() + CAMERA_BUFFER_MINUTES);
      return { cameraId, startTime: start, endTime: endDate.getTime() };
    }
    if (!selectedBooking || !cameraView) return null;
    const cameraId = cameraView === 'cam1' ? 'big-court-cam1' : 'big-court-cam2';
    const start = new Date(`${selectedBooking.date}T${selectedBooking.startTime}`).getTime();
    const endDate = new Date(`${selectedBooking.date}T${selectedBooking.endTime}`);
    endDate.setMinutes(endDate.getMinutes() + CAMERA_BUFFER_MINUTES);
    return {
      cameraId,
      startTime: start,
      endTime: endDate.getTime(),
    };
  }, [selectedBooking, cameraView, sharedSlot]);

  const cameraSelectorShareUrl = useMemo(() => {
    if (sharedSlot) return undefined;
    if (!selectedBooking) return undefined;
    return buildShareUrl({
      date: selectedBooking.date,
      startTime: selectedBooking.startTime,
      endTime: selectedBooking.endTime,
    });
  }, [selectedBooking, sharedSlot]);

  const feedShareUrl = useMemo(() => {
    if (sharedSlot) return undefined;
    if (!selectedBooking || !cameraView) return undefined;
    return buildShareUrl({
      date: selectedBooking.date,
      startTime: selectedBooking.startTime,
      endTime: selectedBooking.endTime,
      camera: cameraView,
    });
  }, [selectedBooking, cameraView, sharedSlot]);

  if (step === 'bookings') {
    return <BookingSelector userEmail={userEmail} onSelect={handleSelectBooking} onClose={onClose} />;
  }

  if (step === 'cameras') {
    return (
      <CameraSelector
        shareUrl={cameraSelectorShareUrl}
        onSelect={handleSelectCamera}
        onBack={() => setStep('bookings')}
        onClose={onClose}
      />
    );
  }

  if (!filter || !cameraView) return null;

  return (
    <ClipsFeed
      filter={filter}
      cameraLabel={cameraView === 'cam1' ? 'CAMERA 1' : 'CAMERA 2'}
      userEmail={userEmail}
      shareUrl={feedShareUrl}
      onBack={() => setStep(sharedSlot ? 'bookings' : 'cameras')}
      onClose={onClose}
    />
  );
}
