import { Check } from 'lucide-react';
import { STEP_LABELS } from '@/data/constants';
import type { BookingStep } from '@/types/booking';

interface StepIndicatorProps {
  currentStep: BookingStep;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  // For 3-step flow: steps 1,2,3 shown. Step 5 (confirmation) shows all as completed.
  const activeStep = currentStep === 5 ? 4 : currentStep;

  return (
    <div className="w-full py-5">
      <div className="flex items-center justify-between max-w-md mx-auto px-2">
        {STEP_LABELS.map((label, index) => {
          const stepNum = index + 1;
          const isCompleted = activeStep > stepNum;
          const isActive = activeStep === stepNum;
          const isUpcoming = activeStep < stepNum;

          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                    ${isCompleted ? 'bg-[#1B7A40] text-white' : ''}
                    ${isActive ? 'bg-[#1B7A40] text-white ring-4 ring-[#1B7A40]/20' : ''}
                    ${isUpcoming ? 'bg-[#2A2A2A] text-[#8A8A8A]' : ''}`}>
                  {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
                </div>
                <span className={`text-[10px] font-semibold tracking-wider uppercase transition-colors duration-300
                    ${isCompleted || isActive ? 'text-[#1B7A40]' : 'text-[#8A8A8A]'}`}>
                  {label}
                </span>
              </div>
              {index < STEP_LABELS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 mb-5">
                  <div className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-[#1B7A40]' : 'bg-[#2A2A2A]'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
