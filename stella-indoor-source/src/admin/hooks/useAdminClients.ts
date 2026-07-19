import { useState, useEffect } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ClientRecord {
  email: string;
  name: string;
  phone: string;
  createdAt: number;
}

export function useAdminClients(authReady: boolean) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Don't subscribe until admin auth is confirmed — a pre-auth listener is denied
    // by the rules and a failed onSnapshot never refires (the all-zeros bug, K-15).
    if (!authReady) return;
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            email: d.email || doc.id,
            name: d.name || 'Unknown',
            phone: d.phone || '-',
            createdAt: d.createdAt || Date.now(),
          } as ClientRecord;
        });
        // Sort by name
        data.sort((a, b) => a.name.localeCompare(b.name));
        setClients(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        // Fail LOUD, never silently zero (BUILD-STANDARDS #16)
        console.warn('[useAdminClients] snapshot error:', err);
        setClients([]);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [authReady]);

  return { clients, loading, error };
}
