import { useEffect, useRef } from 'react';
import { processScheduledEmails } from '@/lib/emailService';

/**
 * useScheduledEmails — Background email poller
 * ==============================================
 * Polls Firestore every 30 seconds for scheduled emails whose sendAt
 * time has passed, then sends them via EmailJS.
 *
 * Mount this once at the app root. It runs independently of user login state
 * so that emails are processed as long as any user (client or admin) has
 * the app open.
 */
export function useScheduledEmails() {
  const processingRef = useRef(false);

  useEffect(() => {
    // Process immediately on mount
    processScheduledEmails().then((count) => {
      if (count > 0) console.log(`[ScheduledEmails] Sent ${count} due emails on mount`);
    });

    // Then poll every 30 seconds
    const interval = setInterval(() => {
      if (processingRef.current) return; // Skip if already processing
      processingRef.current = true;

      processScheduledEmails()
        .then((count) => {
          if (count > 0) console.log(`[ScheduledEmails] Sent ${count} due emails`);
        })
        .catch((err) => {
          console.error('[ScheduledEmails] Error:', err);
        })
        .finally(() => {
          processingRef.current = false;
        });
    }, 30000);

    return () => clearInterval(interval);
  }, []);
}
