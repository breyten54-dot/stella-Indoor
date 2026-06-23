import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check, MailCheck, MailWarning } from 'lucide-react';
import { useBooking } from '@/hooks/useBooking';
import { createConfirmedBooking } from '@/hooks/useFirestoreBookings';
import { useNotifications, scheduleBookingReminders } from '@/hooks/useNotifications';
import { sendBookingConfirmationEmail, scheduleReminderEmails } from '@/lib/emailService';
import { useScheduledEmails } from '@/hooks/useScheduledEmails';
import { LoginPage } from '@/components/LoginPage';
import { Navbar } from '@/components/Navbar';
import { StepIndicator } from '@/components/StepIndicator';
import { CourtSelection } from '@/components/CourtSelection';
import { TimeSelection } from '@/components/TimeSelection';
import { AddonSelection } from '@/components/AddonSelection';
import { BookingConfirmation } from '@/components/BookingConfirmation';
import { BookingSummary } from '@/components/BookingSummary';
import { MyBookings } from '@/components/MyBookings';
import { StellaClips } from '@/components/StellaClips';
import { Footer } from '@/components/Footer';
import { HomePage } from '@/components/HomePage';
import { useBackButton, pushWizardStep } from '@/hooks/useBackButton';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile } from '@/hooks/useFirestoreUsers';

const slideVariants = {
  enterForward: { x: '100%', opacity: 0 },
  enterBackward: { x: '-40%', opacity: 0 },
  center: { x: 0, opacity: 1 },
  exitForward: { x: '-40%', opacity: 0 },
  exitBackward: { x: '100%', opacity: 0 },
};

export function BookingApp() {
  // Start the background email poller (runs independently of login state)
  useScheduledEmails();

  const { user: firebaseUser, loading: authLoading } = useAuth();

  const {
    state, currentStep, direction, auth, showMyBookings, showHighlights,
    selectCourt, selectDateTime, selectDuration,
    updateAddon, setClientDetails,
    nextStep, prevStep, completeBooking, resetBooking,
    login, logout, setShowMyBookings, setShowHighlights,
    getTotalPrice, canProceed,
  } = useBooking();

  // Sync the local booking auth state with Firebase Auth.
  useEffect(() => {
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

  const [selectedDuration, setSelectedDurationState] = useState<1 | 1.5 | 2>(1);
  const [bookingRef, setBookingRef] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showHomePage, setShowHomePage] = useState(true);

  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    deleteNotification,
  } = useNotifications(auth.user?.email || null);

  // Back button handler: step-by-step wizard navigation
  const wizardActive = auth.isLoggedIn && !showHomePage && !showMyBookings && !showHighlights && currentStep < 5;
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

  // Show a loading state while Firebase Auth initializes or while we're syncing the profile.
  if (authLoading || (firebaseUser && !auth.isLoggedIn)) {
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

  const handleConfirmAndComplete = async () => {
    await handleConfirmBooking();
    pushWizardStep(5);
  };

  if (auth.isLoggedIn && showMyBookings) {
    return <MyBookings userEmail={auth.user!.email} onClose={() => setShowMyBookings(false)} />;
  }

  if (auth.isLoggedIn && showHighlights) {
    return <StellaClips userEmail={auth.user!.email} onClose={() => setShowHighlights(false)} />;
  }

  if (!auth.isLoggedIn) {
    return <LoginPage onLogin={login} />;
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
        onStellaClips={() => setShowHighlights(true)}
        onMyBookings={() => setShowMyBookings(true)}
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

  const handleConfirmBooking = async () => {
    if (!state.court || !state.dateTime || !auth.user) return;
    setConfirming(true);

    const details = {
      fullName: auth.user.name,
      email: auth.user.email,
      phone: auth.user.phone,
      teamName: '',
      specialRequests: '',
    };
    setClientDetails(details);

    const [h, m] = state.dateTime.time.split(':').map(Number);
    const totalMinutes = h * 60 + m + state.dateTime.duration * 60;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    const booking = await createConfirmedBooking({
      courtId: state.court.id,
      courtName: state.court.name,
      date: state.dateTime.date,
      startTime: state.dateTime.time,
      endTime,
      duration: state.dateTime.duration,
      clientDetails: details,
      addons: state.addons,
      totalPrice,
      userEmail: auth.user.email,
      userId: firebaseUser?.uid,
    });

    // Schedule in-app browser reminder notifications (1h, 30m, 5m before)
    await scheduleBookingReminders(
      auth.user.email,
      booking.id,
      state.court.name,
      state.dateTime.date,
      state.dateTime.time
    );

    // Send confirmation email immediately (receipt + proof of booking)
    try {
      const emailResult = await sendBookingConfirmationEmail({
        toEmail: auth.user.email,
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
      });

      if (emailResult.success) {
        setEmailToast({ msg: `Confirmation email sent to ${auth.user.email}`, ok: true });
      } else {
        setEmailToast({ msg: `Email failed: ${emailResult.error || 'Unknown error'}`, ok: false });
      }
    } catch (err: any) {
      const msg = err?.text || err?.message || (typeof err === 'string' ? err : 'Unknown error');
      setEmailToast({ msg: `Email error: ${msg}`, ok: false });
    }
    setTimeout(() => setEmailToast(null), 8000);

    // Schedule 3 reminder emails (1h, 30m, at-time) via Firestore for background delivery
    await scheduleReminderEmails({
      userEmail: auth.user.email,
      clientName: details.fullName,
      bookingId: booking.id,
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
    }).catch((err) => console.warn('Reminder scheduling failed:', err));

    setBookingRef(booking.id);
    setConfirming(false);
    completeBooking();
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
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onDeleteNotification={deleteNotification}
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
              <motion.button whileTap={canProceed() ? { scale: 0.98 } : {}} onClick={handleConfirmAndComplete} disabled={!canProceed() || confirming}
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
              <p className="text-sm font-bold text-white">{emailToast.ok ? 'Email Sent' : 'Email Failed'}</p>
              <p className="text-xs text-white/80 mt-0.5">{emailToast.msg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />

      <AnimatePresence>
        {currentStep === 5 && (
          <BookingConfirmation
            state={state}
            totalPrice={totalPrice}
            onBookAnother={resetBooking}
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
