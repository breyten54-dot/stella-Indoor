import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AppSettings {
  openingTime: string;
  closingTime: string;
  sundayClosingTime: string;
  bigCourtPrice: number;
  multiCourtPrice: number;
  paymentWindowMinutes: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  openingTime: '08:00',
  closingTime: '22:00',
  sundayClosingTime: '21:00',
  bigCourtPrice: 500,
  multiCourtPrice: 400,
  paymentWindowMinutes: 5,
};

const SETTINGS_DOC = 'appSettings/global';

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDoc(doc(db, SETTINGS_DOC))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as Partial<AppSettings>;
          setSettings({ ...DEFAULT_SETTINGS, ...data });
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const saveSettings = useCallback(async (next: AppSettings): Promise<void> => {
    await setDoc(doc(db, SETTINGS_DOC), next);
    setSettings(next);
  }, []);

  return { settings, loading, error, saveSettings };
}
