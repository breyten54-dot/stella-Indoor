import type { BookingState } from '@/types/booking';

interface BookingSummaryProps {
  state: BookingState;
  totalPrice: number;
}

function getEndTime(startTime: string, duration: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + duration * 60;
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
}

export function BookingSummary({ state, totalPrice }: BookingSummaryProps) {
  const { court, dateTime, addons } = state;

  if (!court || !dateTime) return null;

  return (
    <div className="bg-[#141414] rounded-2xl p-6 text-white space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8A8A8A]">
        Booking Summary
      </h3>

      <div className="space-y-3">
        {/* Court */}
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-[#8A8A8A]">Court</p>
            <p className="text-sm font-semibold">{court.name}</p>
          </div>
          <span className="text-sm font-bold text-[#7ED321] tab-nums">
            R{court.pricePerHour * dateTime.duration}
          </span>
        </div>

        {/* Duration */}
        <div>
          <p className="text-xs text-[#8A8A8A]">Duration</p>
          <p className="text-sm font-semibold">{dateTime.duration} hour{dateTime.duration !== 1 ? 's' : ''}</p>
        </div>

        {/* Date & Time */}
        <div>
          <p className="text-xs text-[#8A8A8A]">Date & Time</p>
          <p className="text-sm font-semibold">
            {new Date(dateTime.date).toLocaleDateString('en-ZA', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })} at {dateTime.time} — {getEndTime(dateTime.time, dateTime.duration)}
          </p>
        </div>

        {/* Add-ons */}
        {(addons.soccerBall > 0 || addons.bibs > 0) && (
          <div className="pt-2 border-t border-[#2A2A2A]">
            <p className="text-xs text-[#8A8A8A] mb-2">Add-ons</p>
            <div className="space-y-1.5">
              {addons.soccerBall > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#B0B0A8]">Soccer Ball x{addons.soccerBall}</span>
                  <span className="font-medium tab-nums">R{addons.soccerBall * 10}</span>
                </div>
              )}
              {addons.bibs > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#B0B0A8]">Bibs x{addons.bibs}</span>
                  <span className="font-medium tab-nums">R{addons.bibs * 10}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pay at venue notice */}
        <div className="flex items-center gap-2 bg-[#1B7A40]/10 rounded-lg px-3 py-2">
          <span className="text-[10px] font-bold text-[#1B7A40] uppercase tracking-wider">Pay at venue on arrival</span>
        </div>

        {/* Total */}
        <div className="pt-3 border-t border-[#2A2A2A] flex justify-between items-center">
          <span className="text-sm font-semibold text-[#8A8A8A]">Total</span>
          <span className="text-2xl font-extrabold text-[#7ED321] tab-nums">R{totalPrice}</span>
        </div>
      </div>
    </div>
  );
}
