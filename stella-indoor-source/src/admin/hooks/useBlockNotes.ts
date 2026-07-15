import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type PaymentCadence = 'on-the-day' | 'monthly';

export interface BlockNote {
  blockId: string;
  paymentCadence: PaymentCadence;
  rate: number;
  paidToDate: number;
  updatedAt: number;
  updatedBy: string;
}

const COLLECTION = 'blockNotes';

function docToBlockNote(blockId: string, data: Record<string, unknown>): BlockNote {
  return {
    blockId,
    paymentCadence: (data.paymentCadence as PaymentCadence) || 'on-the-day',
    rate: (data.rate as number) || 0,
    paidToDate: (data.paidToDate as number) || 0,
    updatedAt: data.updatedAt instanceof Object && 'toMillis' in data.updatedAt
      ? (data.updatedAt as { toMillis: () => number }).toMillis()
      : (data.updatedAt as number) || Date.now(),
    updatedBy: (data.updatedBy as string) || '',
  };
}

export function useBlockNotes(blockId: string | undefined) {
  const [note, setNote] = useState<BlockNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNote = useCallback(async () => {
    if (!blockId) {
      setNote(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const snap = await getDoc(doc(db, COLLECTION, blockId));
      if (snap.exists()) {
        setNote(docToBlockNote(snap.id, snap.data() as Record<string, unknown>));
      } else {
        setNote(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [blockId]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  const saveNote = useCallback(async (
    data: Pick<BlockNote, 'paymentCadence' | 'rate' | 'paidToDate'>,
    adminEmail: string
  ): Promise<void> => {
    if (!blockId) throw new Error('No block selected');
    if (!adminEmail) throw new Error('Admin email required');

    const payload = {
      paymentCadence: data.paymentCadence,
      rate: Math.max(0, Number(data.rate) || 0),
      paidToDate: Math.max(0, Number(data.paidToDate) || 0),
      updatedBy: adminEmail,
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, COLLECTION, blockId), payload, { merge: true });
    // Optimistically refresh
    await fetchNote();
  }, [blockId, fetchNote]);

  return { note, loading, error, refresh: fetchNote, saveNote };
}
