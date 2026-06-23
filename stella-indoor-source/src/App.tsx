import { Routes, Route } from 'react-router';
import { AuthProvider } from '@/contexts/AuthContext';
import { BookingApp } from '@/components/BookingApp';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/*" element={<BookingApp />} />
      </Routes>
    </AuthProvider>
  );
}
