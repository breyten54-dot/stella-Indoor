import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, Clapperboard, List, ChevronRight } from 'lucide-react';

interface HomePageProps {
  userName: string;
  onBookCourt: () => void;
  onStellaClips: () => void;
  onMyBookings: () => void;
}

const BG_IMAGES = ['/bg-1.jpg', '/bg-2.jpg', '/bg-3.jpg', '/bg-4.jpg'];
const SLIDE_INTERVAL = 5000; // 5 seconds per slide

/**
 * BackgroundSlideshow — crossfading Ken Burns effect
 * behind the home page content
 */
function BackgroundSlideshow() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % BG_IMAGES.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-0">
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/60 z-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70 z-10" />

      {/* Images */}
      <AnimatePresence mode="sync">
        <motion.img
          key={current}
          src={BG_IMAGES[current]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: 1, scale: 1.08 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 1.5, ease: 'easeInOut' },
            scale: { duration: 8, ease: 'linear' },
          }}
        />
      </AnimatePresence>
    </div>
  );
}

/**
 * Floating particles for extra flair
 */
function Particles() {
  const particles = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    size: Math.random() * 5 + 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: Math.random() * 18 + 12,
    delay: Math.random() * 8,
    opacity: Math.random() * 0.12 + 0.04,
  }));

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-20">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-[#1B7A40]"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: p.opacity,
          }}
          animate={{
            y: [0, -25, 0, 25, 0],
            x: [0, 15, 0, -15, 0],
            opacity: [p.opacity, p.opacity * 2, p.opacity, p.opacity * 2, p.opacity],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Slide indicators — dots at the bottom
 */
function SlideIndicators({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mt-4">
      {BG_IMAGES.map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-500 ${
            i === current ? 'w-6 bg-[#1B7A40]' : 'w-2 bg-white/30'
          }`}
        />
      ))}
    </div>
  );
}

export function HomePage({ userName, onBookCourt, onStellaClips, onMyBookings }: HomePageProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Keep track of the current slide for indicators
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % BG_IMAGES.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] relative overflow-hidden">
      {/* Background slideshow */}
      <BackgroundSlideshow />

      {/* Particles */}
      <Particles />

      {/* Content */}
      <div className="relative z-30 flex flex-col items-center justify-center min-h-screen px-6 py-20">
        {/* Welcome */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="text-white/50 text-sm font-medium tracking-[0.2em] uppercase mb-6"
        >
          Welcome back
        </motion.p>

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.7, type: 'spring' }}
          className="relative mb-3"
        >
          {/* Glow behind logo */}
          <div
            className="absolute w-64 h-64 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(27,122,64,0.3) 0%, transparent 65%)',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
          <img
            src="/logo-stella.png"
            alt="Stella Indoor"
            className="w-28 h-28 object-contain relative z-10 drop-shadow-2xl"
          />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="text-4xl font-black text-white tracking-tight text-center mb-1"
        >
          STELLA INDOOR
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="text-white/60 text-sm text-center mb-1"
        >
          Sports Hub, Durban
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-[#7ED321] text-sm font-semibold text-center mb-10"
        >
          Hello, {userName}
        </motion.p>

        {/* Two action buttons */}
        <div className="w-full max-w-sm space-y-4">
          {/* Book a Court */}
          <motion.button
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBookCourt}
            className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1B7A40] to-[#25a055] p-5 text-left shadow-lg shadow-[#1B7A40]/25 transition-shadow hover:shadow-xl hover:shadow-[#1B7A40]/35"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white/15 flex items-center justify-center shrink-0 backdrop-blur-sm">
                <CalendarDays className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-lg leading-tight">Book a Court</p>
                <p className="text-white/75 text-xs mt-0.5">Reserve your indoor sports session</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </motion.button>

          {/* Stella Clips */}
          <motion.button
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStellaClips}
            className="w-full group relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-5 text-left shadow-lg transition-all hover:bg-white/15 hover:border-white/20"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <Clapperboard className="w-7 h-7 text-[#7ED321]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-lg leading-tight">Stella Clips</p>
                <p className="text-white/50 text-xs mt-0.5">Watch game highlights &amp; action</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-[#7ED321] group-hover:translate-x-1 transition-all" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </motion.button>

          {/* My Bookings */}
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.5 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onMyBookings}
            className="w-full group relative overflow-hidden rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-5 text-left shadow-lg transition-all hover:bg-white/10 hover:border-[#1B7A40]/30"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                <List className="w-7 h-7 text-white/70 group-hover:text-[#1B7A40] transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-lg leading-tight">My Bookings</p>
                <p className="text-white/40 text-xs mt-0.5">View your upcoming reservations</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-[#1B7A40] group-hover:translate-x-1 transition-all" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </motion.button>
        </div>

        {/* Slide indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
        >
          <SlideIndicators current={currentSlide} />
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="mt-8 text-white/25 text-xs text-center"
        >
          39 Ruth First Road, Durban, 4001
        </motion.p>
      </div>
    </div>
  );
}
