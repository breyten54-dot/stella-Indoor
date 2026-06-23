import { useState, useCallback, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { loginWithEmailAndPassword, logoutUser, subscribeToAuthChanges } from '@/lib/auth';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

if (!ADMIN_EMAIL) {
  console.warn(
    '[useAdminAuth] VITE_ADMIN_EMAIL is not set. Admin login will not work. ' +
    'Set it in your build environment or in a .env file (do not commit the value).'
  );
}

interface AdminUser {
  name: string;
  role: string;
}

export function useAdminAuth() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setFirebaseUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = !!firebaseUser && firebaseUser.email === ADMIN_EMAIL;

  const [user] = useState<AdminUser>({
    name: 'Admin User',
    role: 'Facility Manager',
  });

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const credential = await loginWithEmailAndPassword(email, password);
      if (credential.user.email === ADMIN_EMAIL) {
        return true;
      }
      // Signed in but not an admin email — sign them back out.
      await logoutUser();
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
  }, []);

  return { isAdmin, user, login, logout, loading, firebaseUser };
}
