import { X, Video } from 'lucide-react';

interface GameHighlightsProps {
  onClose: () => void;
}

export function GameHighlights({ onClose }: GameHighlightsProps) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#0A0A0A] border-b border-[#2A2A2A] flex items-center px-4">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="./logo-original.jpg" alt="Stella Indoor" className="w-8 h-8 rounded-full object-cover" />
            <span className="text-white font-extrabold text-base tracking-tight">STELLA INDOOR</span>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-[#2A2A2A] flex items-center justify-center text-[#8A8A8A] hover:text-white hover:border-[#E53935] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-[#1B7A40]/10 flex items-center justify-center mb-6">
          <Video className="w-10 h-10 text-[#7ED321]" />
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-center tracking-tight">
          Stella Clips
        </h1>
        <p className="text-xl md:text-2xl font-bold text-[#7ED321] mt-3 text-center">
          Coming Soon
        </p>
        <p className="text-sm text-[#8A8A8A] mt-4 text-center max-w-md">
          Game highlights, training videos, and action-packed moments from Stella Indoor Sports Hub will be available here.
        </p>
      </div>

      {/* Footer */}
      <div className="py-6 text-center text-xs text-[#8A8A8A]">
        Stella Indoor Sports Hub &middot; Durban, South Africa
      </div>
    </div>
  );
}
