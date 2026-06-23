import { CheckCircle, XCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  return (
    <div className="fixed top-4 right-4 z-[100] max-w-sm animate-fade-in">
      <div className={`rounded-xl shadow-lg p-4 flex items-start gap-3 ${
        type === 'success' ? 'bg-[#1B7A40] text-white' : 'bg-red-600 text-white'
      }`}>
        {type === 'success' ? (
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {type === 'success' ? 'Success' : 'Error'}
          </p>
          <p className="text-xs text-white/80 mt-0.5">{message}</p>
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
