import { Routes, Route } from 'react-router';
import { AuthProvider } from '@/contexts/AuthContext';
import { BookingApp } from '@/components/BookingApp';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';

export default function App() {
  return (
    <AuthProvider>
      <InstallPrompt />
      <ServiceWorkerUpdater swPath="/sw.js" />
      <Routes>
        <Route path="/*" element={<BookingApp />} />
      </Routes>
    </AuthProvider>
  );
}
