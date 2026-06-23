import { motion } from 'framer-motion';
import { COURTS, DURATION_OPTIONS } from '@/data/constants';
import type { Court, DurationOption } from '@/types/booking';

interface CourtSelectionProps {
  selectedCourt: Court | null;
  selectedDuration: DurationOption;
  onSelectCourt: (court: Court) => void;
  onSelectDuration: (duration: DurationOption) => void;
}

export function CourtSelection({
  selectedCourt,
  selectedDuration,
  onSelectCourt,
  onSelectDuration,
}: CourtSelectionProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight">
          Book Your Court
        </h1>
        <p className="text-[#8A8A8A] mt-2 text-base">
          Choose your court and session length
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COURTS.map((court, index) => {
          const isSelected = selectedCourt?.id === court.id;
          const totalPrice = court.pricePerHour * selectedDuration;
          return (
            <motion.div
              key={court.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
              className={`
                bg-white rounded-2xl border overflow-hidden transition-all duration-300
                ${isSelected
                  ? 'border-[#1B7A40] shadow-[0_4px_20px_rgba(27,122,64,0.15)] ring-1 ring-[#1B7A40]'
                  : 'border-[#E0E0D8] hover:shadow-lg hover:border-[#C0C0B8]'
                }
              `}
            >
              <div className="aspect-video overflow-hidden">
                <img
                  src={court.image}
                  alt={court.name}
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-[#0A0A0A]">{court.name}</h3>
                  <span className="shrink-0 text-[10px] font-bold text-[#1B7A40] bg-[#E8F5EC] px-2 py-0.5 rounded-full uppercase tracking-wider">Pay at venue</span>
                </div>
                <p className="text-sm text-[#8A8A8A] line-clamp-2 leading-relaxed">
                  {court.description}
                </p>

                {/* Duration Selector */}
                <div className="flex gap-2 pt-1">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDuration(opt.value);
                      }}
                      className={`
                        flex-1 py-2 px-1 rounded-lg text-xs font-bold transition-all duration-200
                        ${isSelected && selectedDuration === opt.value
                          ? 'bg-[#1B7A40] text-white'
                          : 'bg-[#F5F5F0] text-[#8A8A8A] hover:bg-[#E8F5EC] hover:text-[#0A0A0A]'
                        }
                      `}
                    >
                      {opt.shortLabel}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-2xl font-extrabold text-[#1B7A40] tab-nums">
                      R{totalPrice}
                    </span>
                    <span className="text-xs text-[#8A8A8A] ml-1">
                      / {DURATION_OPTIONS.find(d => d.value === selectedDuration)?.label.toLowerCase()}
                    </span>
                  </div>
                  <button
                    className={`
                      px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95
                      ${isSelected
                        ? 'bg-[#145C32] text-white'
                        : 'bg-[#1B7A40] text-white hover:bg-[#145C32]'
                      }
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCourt(court);
                    }}
                  >
                    {isSelected ? 'Selected ✓' : 'Select'}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
