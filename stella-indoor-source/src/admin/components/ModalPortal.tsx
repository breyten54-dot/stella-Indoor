import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  children: React.ReactNode;
}

/**
 * Renders children into a portal outside the React tree.
 * This ensures modals are direct children of <body>,
 * preventing any parent containers from interfering with
 * position:fixed centering.
 */
export function ModalPortal({ children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Ensure modal-root exists in DOM
    let mount = document.getElementById('modal-root');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'modal-root';
      document.body.appendChild(mount);
    }
    setMounted(true);

    // Lock body scroll when modal is open
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  if (!mounted) return null;

  const mount = document.getElementById('modal-root');
  if (!mount) return null;

  return createPortal(children, mount);
}
