import { useEffect } from 'react';

let lockCount = 0;
let originalOverflow = '';

/**
 * Locks body scroll when active. Unlocks only when all active locks are gone.
 * Uses a global counter so nested modals do not accidentally re-enable scroll.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount++;

    return () => {
      lockCount--;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = originalOverflow;
      }
    };
  }, [active]);
}

/**
 * Acquire/release a body-scroll lock outside of React lifecycle.
 * Useful for ModalPortal, which mounts/unmounts without props.
 */
export function acquireBodyScrollLock(): () => void {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount++;

  return () => {
    lockCount--;
    if (lockCount <= 0) {
      lockCount = 0;
      document.body.style.overflow = originalOverflow;
    }
  };
}
