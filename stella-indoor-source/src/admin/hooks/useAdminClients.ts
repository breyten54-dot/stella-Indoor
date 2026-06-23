import { useState, useEffect } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ClientRecord {
  email: string;
  name: string;
  phone: string;
  createdAt: number;
}

export function useAdminClients() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        setLoading(false);
      },
      () => {
        setClients([]);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { clients, loading };
}
