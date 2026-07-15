import { useState, useCallback, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loginWithEmailAndPassword, logoutUser, subscribeToAuthChanges } from '@/lib/auth';

interface AdminUser {
  name: string;
  role: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
}

export function useAdminAuth() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setFirebaseUser(user);
      if (!user?.email) {
        setIsAdmin(false);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to the admins document for the signed-in user's email
  useEffect(() => {
    if (!firebaseUser?.email) return;

    setLoading(true);
    const adminDoc = doc(db, 'admins', firebaseUser.email.toLowerCase());
    const unsubscribe = onSnapshot(
      adminDoc,
      (snap) => {
        setIsAdmin(snap.exists());
        setLoading(false);
      },
      (err) => {
        console.warn('[useAdminAuth] admins snapshot error:', err);
        setIsAdmin(false);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [firebaseUser?.email]);

  const [user] = useState<AdminUser>({
    name: 'Admin User',
    role: 'Facility Manager',
  });

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const credential = await loginWithEmailAndPassword(email, password);
      const normalizedEmail = credential.user.email?.toLowerCase();
      if (!normalizedEmail) {
        await logoutUser();
        return { success: false, error: 'Account has no email address.' };
      }
      // Auth success — the admins-collection listener above will decide isAdmin.
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('invalid-credential') || message.includes('wrong-password') || message.includes('user-not-found')) {
        return { success: false, error: 'Invalid email or password.' };
      }
      if (message.includes('too-many-requests')) {
        return { success: false, error: 'Too many failed attempts. Please try again later.' };
      }
      if (message.includes('network-request-failed')) {
        return { success: false, error: 'Network error. Check your connection and try again.' };
      }
      return { success: false, error: `Sign-in failed: ${message}` };
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
  }, []);

  return { isAdmin, user, login, logout, loading, firebaseUser };
}
