import { Routes, Route } from 'react-router';
import { BookingApp } from '@/components/BookingApp';

export default function App() {
  return (
    <Routes>
      <Route path="/*" element={<BookingApp />} />
    </Routes>
  );
}
