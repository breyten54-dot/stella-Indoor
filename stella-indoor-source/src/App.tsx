import { Routes, Route } from 'react-router';
import { AuthProvider } from '@/contexts/AuthContext';
import { BookingApp } from '@/components/BookingApp';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';
import { DEMO_MODE } from '@/lib/demo';

export default function App() {
  return (
    <AuthProvider>
      <InstallPrompt />
      <ServiceWorkerUpdater swPath="/sw.js" />
      <Routes>
        <Route path="/*" element={<BookingApp />} />
      </Routes>
      {DEMO_MODE && (
        <div className="fixed bottom-4 left-4 z-[99999] bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          Demo preview — bookings disabled
        </div>
      )}
    </AuthProvider>
  );
}
