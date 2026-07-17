import { useState, useMemo, useCallback, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { OPERATING_HOURS, DURATION_OPTIONS } from '@/data/constants';
import { getBlockedSlotsForCourtAndDate, getCourtBookedIntervals } from '@/hooks/useFirestoreBookings';
import type { DateTimeSelection, DurationOption } from '@/types/booking';
import { localDateStr } from '@/lib/dates';

interface SlotInfo {
  time: string;
  hour: number;
  checking: boolean;
  available: boolean;
  sufficient: boolean;
}

function generateDates(): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getAllSlots(dayOfWeek: number): SlotInfo[] {
  const isSunday = dayOfWeek === 0;
  const hours = isSunday ? OPERATING_HOURS.sunday : OPERATING_HOURS.weekday;
  const slots: SlotInfo[] = [];
  // Generate slots every 30 minutes so consecutive bookings align
  for (let h = hours.start; h < hours.end; h++) {
    slots.push({ time: `${h.toString().padStart(2, '0')}:00`, hour: h, checking: true, available: false, sufficient: false });
    slots.push({ time: `${h.toString().padStart(2, '0')}:30`, hour: h + 0.5, checking: true, available: false, sufficient: false });
  }
  return slots;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function timeToDecimal(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + (m || 0) / 60;
}

interface TimeSelectionProps {
  selectedDateTime: DateTimeSelection | null;
  selectedDuration: DurationOption;
  courtId: string | null;
  onSelect: (dt: DateTimeSelection) => void;
}

export function TimeSelection({ selectedDateTime, selectedDuration, courtId, onSelect }: TimeSelectionProps) {
  const dates = useMemo(() => generateDates(), []);
  const [activeDate, setActiveDate] = useState<Date>(() => {
    if (selectedDateTime) return new Date(selectedDateTime.date);
    return dates[0];
  });
  const [slots, setSlots] = useState<SlotInfo[]>([]);

  const dateStr = useMemo(() => localDateStr(activeDate), [activeDate]);
  const todayStr = localDateStr(new Date());
  const now = new Date();
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

  const isSunday = activeDate.getDay() === 0;
  const closingHour = isSunday ? OPERATING_HOURS.sunday.end : OPERATING_HOURS.weekday.end;

  // Load availability (bookings + blocked slots) and compute slot states in one pass
  useEffect(() => {
    if (!courtId) return;

    const baseSlots = getAllSlots(activeDate.getDay());
    setSlots(baseSlots.map(s => ({ ...s, checking: true, available: false, sufficient: false })));

    let cancelled = false;

    async function loadAvailability() {
      try {
        const [booked, blocked] = await Promise.all([
          getCourtBookedIntervals(courtId!, dateStr),
          getBlockedSlotsForCourtAndDate(courtId!, dateStr),
        ]);

        const intervals = [...booked, ...blocked].map((b) => ({
          start: timeToDecimal(b.startTime),
          end: timeToDecimal(b.endTime),
        }));

        if (cancelled) return;

        const checked = baseSlots.map((slot) => {
          const slotStart = slot.hour;
          const [slotH, slotM] = slot.time.split(':').map(Number);
          const slotMinutes = slotH * 60 + slotM;

          // Past time
          if (dateStr === todayStr && slotMinutes <= currentTimeMinutes) {
            return { ...slot, checking: false, available: false, sufficient: false };
          }

          // Fits before closing
          const endHour = slotStart + selectedDuration;
          if (endHour > closingHour) {
            return { ...slot, checking: false, available: true, sufficient: false };
          }

          // Overlap with any unavailable interval
          const overlaps = intervals.some((interval) => {
            const startDecimal = slot.hour;
            const endDecimal = startDecimal + selectedDuration;
            return startDecimal < interval.end && endDecimal > interval.start;
          });

          return {
            ...slot,
            checking: false,
            available: true,
            sufficient: !overlaps,
          };
        });

        setSlots(checked);
      } catch (err) {
        console.error('[TimeSelection] availability load failed:', err);
        if (cancelled) return;
        // On failure, mark all future slots as available but not sufficient
        setSlots(baseSlots.map((slot) => {
          const slotStart = slot.hour;
          const endHour = slotStart + selectedDuration;
          if (endHour > closingHour) {
            return { ...slot, checking: false, available: true, sufficient: false };
          }
          return { ...slot, checking: false, available: true, sufficient: true };
        }));
      }
    }

    loadAvailability();
    return () => { cancelled = true; };
  }, [activeDate, courtId, dateStr, todayStr, currentTimeMinutes, closingHour, selectedDuration]);

  const handleDateSelect = useCallback((date: Date) => {
    setActiveDate(date);
  }, []);

  const handleSlotSelect = useCallback((time: string) => {
    onSelect({ date: dateStr, time, duration: selectedDuration });
  }, [dateStr, selectedDuration, onSelect]);

  const durationLabel = DURATION_OPTIONS.find(d => d.value === selectedDuration)?.label ?? '1 Hour';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight">Pick Your Time</h1>
        <p className="text-[#8A8A8A] mt-2 text-base">Select a date and available {durationLabel.toLowerCase()} slot</p>
      </div>

      <div className="flex items-center gap-2 justify-center">
        <span className="text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider">Session length:</span>
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#1B7A40] text-white text-xs font-bold">{durationLabel}</span>
      </div>

      {/* Date Selector */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar snap-x snap-mandatory pb-2">
          {dates.map((date) => {
            const dStr = localDateStr(date);
            const isActive = dStr === dateStr;
            const isPast = dStr < todayStr;
            return (
              <button key={dStr} disabled={isPast} onClick={() => handleDateSelect(date)}
                className={`flex-shrink-0 w-[72px] py-3 rounded-xl flex flex-col items-center gap-1 transition-all duration-200 snap-start
                  ${isPast ? 'opacity-30 cursor-not-allowed bg-[#F0F0EA]' : 'cursor-pointer'}
                  ${isActive && !isPast ? 'bg-[#1B7A40] text-white shadow-lg shadow-[#1B7A40]/25' : ''}
                  ${!isActive && !isPast ? 'bg-white border border-[#E0E0D8] text-[#0A0A0A] hover:border-[#1B7A40] hover:bg-[#E8F5EC]' : ''}`}>
                <span className={`text-xs font-medium ${isActive ? 'text-white/80' : 'text-[#8A8A8A]'}`}>
                  {dStr === todayStr ? 'Today' : DAYS[date.getDay()]}
                </span>
                <span className="text-xl font-bold tab-nums">{date.getDate()}</span>
                <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-[#8A8A8A]'}`}>{MONTHS[date.getMonth()]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Slots */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-[#8A8A8A]" />
          <span className="text-sm font-semibold text-[#8A8A8A] uppercase tracking-wider">
            Available Slots — {DAYS[activeDate.getDay()]}, {activeDate.getDate()} {MONTHS[activeDate.getMonth()]}
          </span>
        </div>

        {selectedDuration > 1 && (
          <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-[#8A8A8A]">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-white border border-[#E0E0D8]" /><span>Available</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#F0F0EA] border border-[#E0E0D8]" /><span>Booked</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#FFF5F5] border border-[#E53935]/30" /><span>Not enough consecutive time</span></div>
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {slots.map((slot) => {
            const isSelected = selectedDateTime?.date === dateStr && selectedDateTime?.time === slot.time;
            const isEligible = !slot.checking && slot.available && slot.sufficient;
            const showInsufficient = !slot.checking && slot.available && !slot.sufficient;

            return (
              <button key={slot.time}
                disabled={!isEligible || slot.checking}
                onClick={() => isEligible && handleSlotSelect(slot.time)}
                className={`h-14 rounded-xl text-sm font-semibold tab-nums transition-all duration-200 relative
                  ${slot.checking ? 'bg-[#F5F5F0] text-[#B0B0A8] cursor-wait animate-pulse' : ''}
                  ${!slot.checking && isSelected ? 'bg-[#1B7A40] text-white shadow-lg shadow-[#1B7A40]/25' : ''}
                  ${!slot.checking && isEligible && !isSelected ? 'bg-white border border-[#E0E0D8] text-[#0A0A0A] hover:border-[#1B7A40] hover:bg-[#E8F5EC]' : ''}
                  ${!slot.checking && showInsufficient ? 'bg-[#FFF5F5] border border-[#E53935]/30 text-[#E53935]/60 cursor-not-allowed' : ''}
                  ${!slot.checking && !slot.available ? 'bg-[#F0F0EA] text-[#B0B0A8] cursor-not-allowed line-through' : ''}`}>
                {slot.time}
                {showInsufficient && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#E53935] rounded-full flex items-center justify-center">
                    <AlertCircle className="w-3 h-3 text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedDuration > 1 && (
          <p className="text-xs text-[#8A8A8A] mt-3">
            Red-bordered slots are available but don&apos;t have enough consecutive time for your {durationLabel} session.
          </p>
        )}
      </div>
    </div>
  );
}
