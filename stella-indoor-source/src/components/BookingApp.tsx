import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check, MailCheck, MailWarning } from 'lucide-react';
import { useBooking } from '@/hooks/useBooking';
import { createConfirmedBooking } from '@/hooks/useFirestoreBookings';
import { useNotifications } from '@/hooks/useNotifications';
import { getErrorMessage } from '@/lib/error';
import { sendBookingConfirmationEmail } from '@/lib/emailService';

import { LoginPage } from '@/components/LoginPage';
import { JoinBooking } from '@/components/JoinBooking';
import { Navbar } from '@/components/Navbar';
import { StepIndicator } from '@/components/StepIndicator';
import { CourtSelection } from '@/components/CourtSelection';
import { TimeSelection } from '@/components/TimeSelection';
import { AddonSelection } from '@/components/AddonSelection';
import { BookingConfirmation } from '@/components/BookingConfirmation';
import { BookingSummary } from '@/components/BookingSummary';
import { MyBookings } from '@/components/MyBookings';
import { StellaClips, type SharedClipSlot } from '@/components/StellaClips';
import { Footer } from '@/components/Footer';
import { TermsModal } from '@/components/TermsAndConditions';
import { HomePage } from '@/components/HomePage';
import { ClientSettings } from '@/components/ClientSettings';
import { useBackButton, pushWizardStep } from '@/hooks/useBackButton';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile } from '@/hooks/useFirestoreUsers';
import { DEMO_MODE } from '@/lib/demo';
import { subscribeToPush } from '@/lib/clientPush';
import { localDateStr } from '@/lib/dates';
import { COURTS } from '@/data/constants';
import type { Court, DateTimeSelection, Addons, DurationOption } from '@/types/booking';
import type { NotificationRecord } from '@/types/notification';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

const slideVariants = {
  enterForward: { x: '100%', opacity: 0 },
  enterBackward: { x: '-40%', opacity: 0 },
  center: { x: 0, opacity: 1 },
  exitForward: { x: '-40%', opacity: 0 },
  exitBackward: { x: '100%', opacity: 0 },
};

function parseSharedClipSlot(): SharedClipSlot | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('shareClips') !== '1') return null;
  const date = params.get('date');
  const startTime = params.get('start');
  const endTime = params.get('end');
  const cameraParam = params.get('camera');
  const camera = cameraParam === 'cam1' || cameraParam === 'cam2' ? cameraParam : undefined;
  if (!date || !startTime || !endTime) return null;
  return { date, startTime, endTime, camera };
}

function parseJoinToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('join');
}

// sessionStorage key for a deep-link guest booking awaiting the confirm-step login (K-8).
const PENDING_BOOKING_KEY = 'stellaPendingBooking';

interface DeepLinkBooking {
  courtId: string;
  date: string;
  start: string;
  // null when the released window isn't a standard 1/1.5/2h booking duration (K-18/D3):
  // the start time is still preselected and the user picks a valid duration instead of
  // being dropped at Home.
  duration: DurationOption | null;
}

// Minutes for an HH:MM string; NaN on malformed input.
function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

// Duration in hours between start/end HH:MM, only when it is a bookable duration.
function durationFromStartEnd(start: string, end: string): DurationOption | null {
  const hours = (hhmmToMinutes(end) - hhmmToMinutes(start)) / 60;
  return hours === 1 || hours === 1.5 || hours === 2 ? (hours as DurationOption) : null;
}

// ?book=1&court=<courtId>&date=<YYYY-MM-DD>&start=<HH:MM>&end=<HH:MM> — carried by
// slot-released pushes/notifications (K-8). Returns null unless every part is present
// and sane (unknown court, malformed or PAST date → caller behaves as if there were no
// deep link). A non-standard window (not 1/1.5/2h) is NOT fatal: duration comes back
// null and the wizard preselects the start time instead (K-18/D3).
// Date check uses LOCAL date keys (BUILD-STANDARDS #22).
function parseDeepLinkBooking(): DeepLinkBooking | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('book') !== '1') return null;
  const courtId = params.get('court') || '';
  const date = params.get('date') || '';
  const start = params.get('start') || '';
  const end = params.get('end') || '';
  if (!COURTS.some(c => c.id === courtId)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < localDateStr(new Date())) return null;
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  // A TODAY link whose start is already past is not a usable deep link (K-20): fall
  // back to the normal flow instead of dropping the user into a booking the server
  // will reject with 400. Local time-of-day compare (BUILD-STANDARDS #22).
  const now = new Date();
  if (date === localDateStr(now)) {
    const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (start <= nowHHMM) return null;
  }
  const duration = durationFromStartEnd(start, end);
  return { courtId, date, start, duration };
}

export function BookingApp() {
  const { user: firebaseUser, loading: authLoading } = useAuth();

  const {
    state, currentStep, direction, auth, showMyBookings, showHighlights,
    selectCourt, selectDateTime, selectDuration,
    updateAddon, setClientDetails,
    nextStep, prevStep, goToStep, completeBooking, resetBooking,
    login, logout, setShowMyBookings, setShowHighlights,
    getTotalPrice, canProceed,
  } = useBooking();

  const [sharedClipSlot, setSharedClipSlot] = useState<SharedClipSlot | null>(parseSharedClipSlot);
  const [joinToken, setJoinToken] = useState<string | null>(parseJoinToken);
  const [deepLink] = useState<DeepLinkBooking | null>(parseDeepLinkBooking);

  // Sync the local booking auth state with Firebase Auth.
  useEffect(() => {
    if (DEMO_MODE) {
      // Demo preview build: browse as a fake visitor without real auth
      if (!auth.isLoggedIn) login('demo@stellaindoor.example', 'Demo Visitor', '000 000 0000');
      return;
    }
    if (authLoading) return;

    if (firebaseUser && !auth.isLoggedIn) {
      const email = firebaseUser.email || '';
      getUserProfile(email).then((profile) => {
        login(email, profile?.name || firebaseUser.displayName || '', profile?.phone || '');
      });
    } else if (!firebaseUser && auth.isLoggedIn) {
      logout();
    }
  }, [firebaseUser, authLoading, auth.isLoggedIn, login, logout]);

  // Open shared clips view automatically after login.
  useEffect(() => {
    if (auth.isLoggedIn && sharedClipSlot && !showHighlights) {
      setShowHighlights(true);
    }
  }, [auth.isLoggedIn, sharedClipSlot, showHighlights, setShowHighlights]);

  // Subscribe/re-validate client Web Push on login and app open.
  useEffect(() => {
    if (DEMO_MODE || !auth.isLoggedIn || !auth.user?.email) return;
    subscribeToPush(auth.user.email).catch((err) => {
      console.warn('[BookingApp] push subscribe failed:', err);
    });
  }, [auth.isLoggedIn, auth.user?.email]);

  const [selectedDuration, setSelectedDurationState] = useState<1 | 1.5 | 2>(deepLink?.duration ?? 1);
  const [bookingRef, setBookingRef] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean; title?: string } | null>(null);
  const [showHomePage, setShowHomePage] = useState(!deepLink);
  // Confirm-step auth for the deep-link guest flow (K-8 Part 2)
  const [authPrompt, setAuthPrompt] = useState(false);
  const [resumePending, setResumePending] = useState(false);
  // Settings overlay
  const [showSettings, setShowSettings] = useState(false);
  // Terms acknowledgment gate — shown before every booking confirmation
  const [showTermsAck, setShowTermsAck] = useState(false);

  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    deleteNotification,
  } = useNotifications(auth.user?.email || null);

  // Back button handler: step-by-step wizard navigation. The guest deep-link path
  // (K-8) counts as wizard-active too so guests step back through the wizard (K-18/D4).
  const wizardActive = (auth.isLoggedIn || !!deepLink) && !showHomePage && !showMyBookings && !showHighlights && !showSettings && currentStep < 5;
  const { exitPrompt } = useBackButton(
    auth.isLoggedIn,
    showHomePage && !showMyBookings && !showHighlights,
    currentStep,
    wizardActive,
    () => {
      setShowHomePage(true);
      setShowMyBookings(false);
      setShowHighlights(false);
      resetBooking();
    },
    prevStep,
    logout
  );

  const totalPrice = getTotalPrice();

  // Persist the in-flight booking so the confirm-step auth (or a reload) can't lose it (K-8 Part 2).
  const persistPendingBooking = () => {
    try {
      sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify({
        court: state.court, dateTime: state.dateTime, addons: state.addons,
      }));
    } catch { /* storage blocked/full — auth still shows; booking just won't auto-resume */ }
  };

  const handleConfirmBooking = async () => {
    if (DEMO_MODE) {
      setEmailToast({ msg: 'This is a demo preview — booking creation is disabled.', ok: false });
      setTimeout(() => setEmailToast(null), 6000);
      return;
    }
    if (!state.court || !state.dateTime) return;
    // Guest on the deep-link flow: auth is required AT the confirm step only (K-8 Part 2).
    // Stash the wizard state, show login/register; the resume effect below completes it.
    if (!auth.user) {
      persistPendingBooking();
      setAuthPrompt(true);
      return;
    }
    const user = auth.user;
    setConfirming(true);

    try {
      const details = {
        fullName: user.name,
        email: user.email,
        phone: user.phone,
        teamName: '',
        specialRequests: '',
      };
      setClientDetails(details);

      const [h, m] = state.dateTime.time.split(':').map(Number);
      const totalMinutes = h * 60 + m + state.dateTime.duration * 60;
      const endH = Math.floor(totalMinutes / 60);
      const endM = totalMinutes % 60;
      const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

      const booking = await withTimeout(
        createConfirmedBooking({
          courtId: state.court.id,
          courtName: state.court.name,
          date: state.dateTime.date,
          startTime: state.dateTime.time,
          endTime,
          duration: state.dateTime.duration,
          clientDetails: details,
          addons: state.addons,
          totalPrice,
          userEmail: user.email,
          userId: firebaseUser?.uid,
        }),
        10000,
        'Booking timed out — please check your connection and try again'
      );

      // Show the confirmation screen immediately — do not wait for best-effort side effects
      setBookingRef(booking.id);
      completeBooking();

      // Send confirmation email immediately (receipt + proof of booking) — best effort, background
      sendBookingConfirmationEmail({
        toEmail: user.email,
        clientName: details.fullName,
        bookingRef: booking.id,
        courtName: state.court.name,
        date: state.dateTime.date,
        startTime: state.dateTime.time,
        endTime,
        duration: state.dateTime.duration,
        totalPrice,
        clientPhone: details.phone,
        soccerBall: state.addons.soccerBall,
        bibs: state.addons.bibs,
        teamName: details.teamName,
      })
        .then((emailResult) => {
          if (emailResult.success) {
            setEmailToast({ msg: `Confirmation email sent to ${user.email}`, ok: true });
          } else {
            setEmailToast({ msg: `Email failed: ${emailResult.error || 'Unknown error'}`, ok: false });
          }
          setTimeout(() => setEmailToast(null), 8000);
        })
        .catch((err: unknown) => {
          const msg = (err && typeof err === 'object' && 'text' in err ? String((err as { text?: unknown }).text) : undefined) || getErrorMessage(err) || 'Unknown error';
          setEmailToast({ msg: `Email error: ${msg}`, ok: false });
          setTimeout(() => setEmailToast(null), 8000);
        });

    } catch (err: unknown) {
      console.error('Booking confirmation failed:', err);
      const msg = getErrorMessage(err);
      if (/no longer available/i.test(msg)) {
        // Lost the slot race: createBooking answered 409 'Slot no longer available'.
        // Friendly message + back to availability (K-8 Part 2) — never a raw error.
        setEmailToast({ msg: 'That slot was just taken — please pick another time.', ok: false, title: 'Slot taken' });
        setTimeout(() => setEmailToast(null), 8000);
        goToStep(2);
      } else {
        setEmailToast({ msg: `Booking failed: ${msg}`, ok: false });
        setTimeout(() => setEmailToast(null), 8000);
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmAndComplete = async () => {
    await handleConfirmBooking();
    pushWizardStep(5);
  };

  // Deep link (?book=1…): pre-fill court + date + time. Standard window (1/1.5/2h) →
  // jump straight to add-ons (K-8). Non-standard window → land on the TIME step with the
  // start preselected so the user picks a valid duration instead of being dropped at
  // Home (K-18/D3). Runs once on mount; params are cleaned (mirrors shareClips) so a
  // refresh can't re-trigger. Mount-only by design — goToStep is not stable. A history
  // buffer state is pushed so the FIRST browser-back is intercepted (K-18/D4).
  useEffect(() => {
    if (!deepLink) return;
    const court = COURTS.find(c => c.id === deepLink.courtId);
    if (!court) return;
    const duration = deepLink.duration ?? 1;
    selectCourt(court);
    selectDateTime({ date: deepLink.date, time: deepLink.start, duration });
    setSelectedDurationState(duration);
    const step = deepLink.duration ? 3 : 2;
    goToStep(step);
    window.history.replaceState({}, '', window.location.pathname);
    pushWizardStep(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume a pending deep-link booking once the confirm-step auth succeeded (K-8 Part 2):
  // restore the wizard state, then re-run the same confirm (fire effect below).
  useEffect(() => {
    if (!auth.isLoggedIn || !auth.user) return;
    const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_BOOKING_KEY);
    try {
      const pending = JSON.parse(raw) as { court?: Court; dateTime?: DateTimeSelection; addons?: Addons };
      if (pending.court) selectCourt(pending.court);
      if (pending.dateTime) {
        selectDateTime(pending.dateTime);
        setSelectedDurationState(pending.dateTime.duration || 1);
      }
      if (pending.addons) {
        updateAddon('soccerBall', pending.addons.soccerBall ?? 0);
        updateAddon('bibs', pending.addons.bibs ?? 0);
      }
      setAuthPrompt(false);
      setShowHomePage(false);
      setResumePending(true);
    } catch { /* malformed payload — already dropped, nothing to resume */ }
  }, [auth.isLoggedIn, auth.user, selectCourt, selectDateTime, updateAddon]);

  // Fire the confirm only after the restored state has actually landed. The user already
  // accepted the terms before the auth prompt — this continues that same confirm.
  useEffect(() => {
    if (!resumePending || !auth.user || !state.court || !state.dateTime) return;
    setResumePending(false);
    void handleConfirmAndComplete();
  }, [resumePending, auth.user, state.court, state.dateTime, handleConfirmAndComplete]);

  // "Book now" from a slot-released in-app notification (K-8 Part 3): the same pre-filled
  // wizard as the push deep link, routed in-app with the notification's own fields.
  const handleBookNow = (n: NotificationRecord) => {
    const court = COURTS.find(c => c.id === n.courtId);
    if (!court || !n.date || !n.startTime) return;
    const duration = (n.endTime && durationFromStartEnd(n.startTime, n.endTime)) || 1;
    resetBooking();
    selectCourt(court);
    selectDateTime({ date: n.date, time: n.startTime, duration });
    setSelectedDurationState(duration);
    setShowMyBookings(false);
    setShowHighlights(false);
    setShowSettings(false);
    setShowHomePage(false);
    goToStep(3);
    markRead(n.id);
  };

  // Show a loading state while Firebase Auth initializes or while we're syncing the profile.
  if (!DEMO_MODE && (authLoading || (firebaseUser && !auth.isLoggedIn))) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1B7A40]/30 border-t-[#1B7A40] rounded-full animate-spin" />
      </div>
    );
  }

  // Step navigation with history tracking for back button support
  const handleNextStep = () => {
    nextStep();
    // Push next step to history so back button navigates through steps
    if (currentStep < 3) {
      pushWizardStep(currentStep + 1);
    }
  };

  if (joinToken) {
    if (!auth.isLoggedIn) {
      return <LoginPage onLogin={login} contextMessage="Sign in or create an account to join this booking." />;
    }
    return (
      <JoinBooking
        token={joinToken}
        userEmail={auth.user!.email}
        onJoined={() => {
          setJoinToken(null);
          window.history.replaceState({}, '', window.location.pathname + '#/');
          setShowHomePage(true);
        }}
      />
    );
  }

  if (auth.isLoggedIn && showMyBookings) {
    return <MyBookings userEmail={auth.user!.email} onClose={() => setShowMyBookings(false)} />;
  }

  if (auth.isLoggedIn && showSettings) {
    return (
      <ClientSettings
        userEmail={auth.user!.email}
        onClose={() => setShowSettings(false)}
      />
    );
  }

  if (auth.isLoggedIn && showHighlights) {
    return (
      <StellaClips
        userEmail={auth.user!.email}
        sharedSlot={sharedClipSlot || undefined}
        onClose={() => {
          setShowHighlights(false);
          setSharedClipSlot(null);
          // Clean up share params from URL so a refresh doesn't reopen clips
          if (window.location.search.includes('shareClips=')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
      />
    );
  }

  // Confirm-step auth for the deep-link guest flow (K-8 Part 2): the wizard itself is
  // walkable as a guest; login/register is only required to CONFIRM the booking.
  if (!auth.isLoggedIn && authPrompt) {
    return <LoginPage onLogin={login} contextMessage="Sign in or create an account to confirm your booking." />;
  }

  // Guests may walk the DEEP-LINKED booking flow without auth (?book=1 — K-8 Part 2);
  // every other guest path still lands on the login wall.
  if (!auth.isLoggedIn && !deepLink) {
    return (
      <LoginPage
        onLogin={login}
        contextMessage={sharedClipSlot ? 'Sign in or create an account to view shared Stella Clips.' : undefined}
      />
    );
  }

  // Show home page after login (before booking wizard)
  if (showHomePage) {
    return (
      <HomePage
        userName={auth.user?.name || 'Player'}
        onBookCourt={() => {
          setShowHomePage(false);
          // Reset to step 1 for a fresh booking
          resetBooking();
          // Push initial step so back button can navigate through wizard
          pushWizardStep(1);
        }}
        onMyBookings={() => setShowMyBookings(true)}
        onSettings={() => setShowSettings(true)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onDeleteNotification={deleteNotification}
        onBookNow={handleBookNow}
      />
    );
  }

  const handleSelectCourt = (court: typeof state.court) => {
    if (court) selectCourt(court);
  };

  const handleSelectDuration = (duration: 1 | 1.5 | 2) => {
    setSelectedDurationState(duration);
    if (state.dateTime) selectDuration(duration);
  };

  const handleSelectDateTime = (dt: typeof state.dateTime) => {
    if (dt) selectDateTime({ ...dt, duration: selectedDuration });
  };

  const handleBookAnother = () => {
    resetBooking();
    setShowHomePage(true);
  };

  const stepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <CourtSelection
            selectedCourt={state.court}
            selectedDuration={selectedDuration}
            onSelectCourt={handleSelectCourt}
            onSelectDuration={handleSelectDuration}
          />
        );
      case 2:
        return (
          <TimeSelection
            selectedDateTime={state.dateTime}
            selectedDuration={selectedDuration}
            courtId={state.court?.id ?? null}
            onSelect={handleSelectDateTime}
          />
        );
      case 3:
        return <AddonSelection addons={state.addons} onUpdate={updateAddon} />;
      default:
        return null;
    }
  };

  const showBottomBar = currentStep >= 1 && currentStep <= 3;

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col">
      <Navbar
        auth={auth}
        onLogout={logout}
        onMyBookings={() => setShowMyBookings(true)}
        onHighlights={() => setShowHighlights(true)}
        onHome={() => setShowHomePage(true)}
        onSettings={() => setShowSettings(true)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onDeleteNotification={deleteNotification}
        onBookNow={handleBookNow}
      />

      <main className="flex-1 pt-14">
        {currentStep < 5 && (
          <div className="bg-[#F5F5F0] border-b border-[#E0E0D8]">
            <div className="max-w-4xl mx-auto px-4">
              <StepIndicator currentStep={currentStep} />
            </div>
          </div>
        )}

        {currentStep < 5 && (
          <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1 min-w-0">
                {currentStep > 1 && (
                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={prevStep}
                    className="flex items-center gap-1 text-[#1B7A40] hover:text-[#145C32] font-semibold text-sm mb-4 transition-colors active:scale-95">
                    <ChevronLeft className="w-4 h-4" />
                    {currentStep === 2 && 'Back to Courts'}
                    {currentStep === 3 && 'Back to Time'}
                  </motion.button>
                )}

                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div key={currentStep} custom={direction} variants={slideVariants}
                    initial={direction === 'forward' ? 'enterForward' : 'enterBackward'}
                    animate="center"
                    exit={direction === 'forward' ? 'exitForward' : 'exitBackward'}
                    transition={{ x: { type: 'tween', duration: 0.35, ease: [0.32, 0.72, 0, 1] }, opacity: { duration: 0.25 } }}>
                    {stepContent()}
                  </motion.div>
                </AnimatePresence>
              </div>

              {currentStep >= 2 && currentStep <= 3 && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2, duration: 0.4 }}
                  className="hidden lg:block w-80 shrink-0">
                  <div className="sticky top-20">
                    <BookingSummary state={state} totalPrice={totalPrice} />
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </main>

      {showBottomBar && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-lg border-t border-[#E0E0D8] safe-area-pb">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="hidden sm:block">
              <p className="text-xs text-[#8A8A8A] font-medium uppercase tracking-wider">Total (Pay at venue)</p>
              <p className="text-xl font-extrabold text-[#1B7A40] tab-nums">R{totalPrice}</p>
            </div>
            <div className="sm:hidden">
              <p className="text-[10px] text-[#8A8A8A] font-medium uppercase tracking-wider">Pay at venue</p>
              <p className="text-lg font-extrabold text-[#1B7A40] tab-nums">R{totalPrice}</p>
            </div>

            {currentStep < 3 ? (
              <motion.button whileTap={canProceed() ? { scale: 0.98 } : {}} onClick={handleNextStep} disabled={!canProceed()}
                className={`flex-1 sm:flex-none sm:min-w-[200px] h-14 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-200
                  ${canProceed() ? 'bg-[#1B7A40] hover:bg-[#145C32] text-white shadow-lg shadow-[#1B7A40]/20 active:shadow-md' : 'bg-[#E0E0D8] text-[#8A8A8A] cursor-not-allowed'}`}>
                Continue <ChevronRight className="w-5 h-5" />
              </motion.button>
            ) : (
              <motion.button whileTap={canProceed() ? { scale: 0.98 } : {}} onClick={() => setShowTermsAck(true)} disabled={!canProceed() || confirming}
                className={`flex-1 sm:flex-none sm:min-w-[240px] h-14 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-200
                  ${canProceed() && !confirming ? 'bg-[#1B7A40] hover:bg-[#145C32] text-white shadow-lg shadow-[#1B7A40]/20 active:shadow-md' : 'bg-[#E0E0D8] text-[#8A8A8A] cursor-not-allowed'}`}>
                {confirming ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Confirm Booking
                  </>
                )}
              </motion.button>
            )}
          </div>
        </div>
      )}

      {showBottomBar && <div className="h-20" />}

      {/* Email status toast */}
      <AnimatePresence>
        {emailToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-36 left-4 right-4 z-[60] sm:left-auto sm:right-4 sm:w-96 rounded-2xl p-4 shadow-xl flex items-start gap-3 ${emailToast.ok ? 'bg-[#1B7A40]' : 'bg-red-600'}`}
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              {emailToast.ok ? <MailCheck className="w-5 h-5 text-white" /> : <MailWarning className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{emailToast.title ?? (emailToast.ok ? 'Email Sent' : 'Email Failed')}</p>
              <p className="text-xs text-white/80 mt-0.5">{emailToast.msg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />

      {/* Terms acknowledgment — required before every booking is confirmed */}
      {showTermsAck && (
        <TermsModal
          onClose={() => setShowTermsAck(false)}
          footer={
            <div className="space-y-2">
              <p className="text-[11px] text-center text-[#8A8A8A]">
                Please read and accept the terms above to confirm your booking.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowTermsAck(false)}
                  className="flex-1 h-12 bg-[#2A2A2A] hover:bg-[#3A3A3A] text-[#B0B0B0] hover:text-white rounded-xl font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowTermsAck(false); handleConfirmAndComplete(); }}
                  className="flex-[2] h-12 bg-[#1B7A40] hover:bg-[#145C32] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Check className="w-4 h-4" /> I Agree — Confirm Booking
                </button>
              </div>
            </div>
          }
        />
      )}

      <AnimatePresence>
        {currentStep === 5 && (
          <BookingConfirmation
            state={state}
            totalPrice={totalPrice}
            onBookAnother={handleBookAnother}
            bookingRef={bookingRef}
          />
        )}
      </AnimatePresence>

      {/* Press back again to exit */}
      {exitPrompt && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] bg-white/90 backdrop-blur-sm text-[#0A0A0A] px-5 py-2.5 rounded-full text-sm font-bold shadow-xl animate-fade-in">
          Press back again to exit
        </div>
      )}
    </div>
  );
}
