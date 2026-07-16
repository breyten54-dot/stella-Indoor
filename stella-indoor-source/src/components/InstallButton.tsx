import { Download } from 'lucide-react';
import { useInstallPrompt, InstallModal } from '@/components/InstallModal';

interface InstallButtonProps {
  variant?: 'icon' | 'pill';
  className?: string;
}

export function InstallButton({ variant = 'icon', className = '' }: InstallButtonProps) {
  const { installed, showModal, setShowModal, openInstall } = useInstallPrompt();

  if (installed) return null;

  return (
    <>
      <button
        onClick={openInstall}
        className={`bg-[#1B7A40] text-white hover:bg-[#145C32] transition-colors active:scale-95 ${
          variant === 'pill'
            ? `h-9 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 ${className}`
            : `w-9 h-9 rounded-full flex items-center justify-center ${className}`
        }`}
        title="Install App"
        aria-label="Install App"
      >
        <Download className={variant === 'pill' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {variant === 'pill' && <span>Install App</span>}
      </button>
      <InstallModal open={showModal} onClose={() => setShowModal(false)} variant="client" />
    </>
  );
}
