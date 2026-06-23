import { useEffect } from 'react';

/**
 * Locks body scroll when active. Unlocks when inactive or unmounted.
 * Use this in any component that renders a fullscreen modal.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (active) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [active]);
}
