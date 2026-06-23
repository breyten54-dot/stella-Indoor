import { useState, useCallback } from 'react';

const STORAGE_KEY = 'stella_admin_session_v2';

// Admin password is configured at build time via the VITE_ADMIN_PASSWORD
// environment variable. Never commit the production password to source control.
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.warn(
    '[useAdminAuth] VITE_ADMIN_PASSWORD is not set. Admin login will not work. ' +
    'Set it in your build environment or in a .env file (do not commit the value).'
  );
}

interface AdminUser {
  name: string;
  role: string;
}

export function useAdminAuth() {
  const [isAdmin, setIsAdmin] = useState(() => {
    return sessionStorage.getItem(STORAGE_KEY) === 'true';
  });

  const [user] = useState<AdminUser>({
    name: 'Admin User',
    role: 'Facility Manager',
  });

  const login = useCallback((password: string): boolean => {
    if (ADMIN_PASSWORD && password === ADMIN_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
      setIsAdmin(true);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setIsAdmin(false);
    window.location.reload();
  }, []);

  return { isAdmin, user, login, logout };
}
