import { useState, useCallback } from 'react';
import { logoutUser } from '@/lib/auth';
import type { BookingState, BookingStep, Court, DateTimeSelection, Addons, ClientDetails, DurationOption, AuthState } from '@/types/booking';

const initialState: BookingState = {
  court: null,
  dateTime: null,
  addons: { soccerBall: 0, bibs: 0 },
  clientDetails: null,
};

const initialAuth: AuthState = {
  isLoggedIn: false,
  user: null,
};

export function useBooking() {
  const [state, setState] = useState<BookingState>(initialState);
  const [currentStep, setCurrentStep] = useState<BookingStep>(1);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [auth, setAuth] = useState<AuthState>(initialAuth);
  const [showMyBookings, setShowMyBookings] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);

  const login = useCallback((email: string, name: string, phone: string) => {
    setAuth({ isLoggedIn: true, user: { email, name, phone } });
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setAuth(initialAuth);
    setState(initialState);
    setCurrentStep(1);
    setShowMyBookings(false);
    setShowHighlights(false);
  }, []);

  const selectCourt = useCallback((court: Court | null) => {
    setState(prev => ({ ...prev, court }));
  }, []);

  const selectDateTime = useCallback((dateTime: DateTimeSelection | null) => {
    setState(prev => ({ ...prev, dateTime }));
  }, []);

  const selectDuration = useCallback((duration: DurationOption) => {
    setState(prev => ({
      ...prev,
      dateTime: prev.dateTime ? { ...prev.dateTime, duration } : null,
    }));
  }, []);

  const updateAddon = useCallback((addonId: keyof Addons, quantity: number) => {
    setState(prev => ({
      ...prev,
      addons: { ...prev.addons, [addonId]: Math.max(0, Math.min(10, quantity)) },
    }));
  }, []);

  const setClientDetails = useCallback((details: ClientDetails | null) => {
    setState(prev => ({ ...prev, clientDetails: details }));
  }, []);

  const goToStep = useCallback((step: BookingStep) => {
    setDirection(step > currentStep ? 'forward' : 'back');
    setCurrentStep(step);
  }, [currentStep]);

  const nextStep = useCallback(() => {
    if (currentStep < 3) {
      setDirection('forward');
      setCurrentStep((prev) => (prev + 1) as BookingStep);
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      setDirection('back');
      setCurrentStep((prev) => (prev - 1) as BookingStep);
    }
  }, [currentStep]);

  const completeBooking = useCallback(() => {
    setDirection('forward');
    setCurrentStep(5);
  }, []);

  const resetBooking = useCallback(() => {
    setState(initialState);
    setDirection('back');
    setCurrentStep(1);
  }, []);

  const getTotalPrice = useCallback(() => {
    let total = 0;
    if (state.court) total += state.court.pricePerHour * (state.dateTime?.duration ?? 1);
    total += state.addons.soccerBall * 10;
    total += state.addons.bibs * 10;
    return total;
  }, [state.court, state.dateTime, state.addons]);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 1: return state.court !== null;
      case 2: return state.dateTime !== null && state.dateTime.date !== '' && state.dateTime.time !== '';
      case 3: return true;
      default: return false;
    }
  }, [currentStep, state]);

  return {
    state,
    currentStep,
    direction,
    auth,
    showMyBookings,
    showHighlights,
    selectCourt,
    selectDateTime,
    selectDuration,
    updateAddon,
    setClientDetails,
    goToStep,
    nextStep,
    prevStep,
    completeBooking,
    resetBooking,
    login,
    logout,
    setShowMyBookings,
    setShowHighlights,
    getTotalPrice,
    canProceed,
  };
}
