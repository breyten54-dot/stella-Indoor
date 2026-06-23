import { useState, useCallback } from 'react';
import { User, Mail, Phone, Users, MessageSquare, CheckCircle } from 'lucide-react';
import type { ClientDetails as ClientDetailsType } from '@/types/booking';

interface ClientDetailsProps {
  onSubmit: (details: ClientDetailsType) => void;
  totalPrice: number;
}

export function ClientDetails({ onSubmit, totalPrice }: ClientDetailsProps) {
  const [form, setForm] = useState<ClientDetailsType>({
    fullName: '',
    email: '',
    phone: '',
    teamName: '',
    specialRequests: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ClientDetailsType, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof ClientDetailsType, boolean>>>({});

  const updateField = useCallback((field: keyof ClientDetailsType, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (touched[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [touched]);

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof ClientDetailsType, string>> = {};
    if (!form.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!form.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }
    setErrors(newErrors);
    setTouched({ fullName: true, email: true, phone: true, teamName: true, specialRequests: true });
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(() => {
    if (validate()) {
      onSubmit(form);
    }
  }, [validate, form, onSubmit]);

  const inputClass = (field: keyof ClientDetailsType) => `
    w-full h-[52px] px-4 pl-11 rounded-xl border bg-white text-[#0A0A0A] text-sm font-medium
    placeholder:text-[#B0B0A8]
    focus:outline-none focus:ring-[3px] focus:ring-[#1B7A40]/10 focus:border-[#1B7A40]
    transition-all duration-200
    ${errors[field] ? 'border-[#E53935]' : 'border-[#E0E0D8]'}
  `;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight">Your Details</h1>
        <p className="text-[#8A8A8A] mt-2 text-base">Complete your booking — payment is cash on arrival</p>
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        {/* Full Name */}
        <div>
          <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">
            Full Name <span className="text-[#E53935]">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
            <input type="text" placeholder="e.g. John Smith" value={form.fullName}
              onChange={e => updateField('fullName', e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, fullName: true }))}
              className={inputClass('fullName')} />
          </div>
          {errors.fullName && <p className="text-xs text-[#E53935] mt-1">{errors.fullName}</p>}
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">
            Email Address <span className="text-[#E53935]">*</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
            <input type="email" placeholder="john@example.com" value={form.email}
              onChange={e => updateField('email', e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, email: true }))}
              className={inputClass('email')} />
          </div>
          {errors.email && <p className="text-xs text-[#E53935] mt-1">{errors.email}</p>}
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">
            Phone Number <span className="text-[#E53935]">*</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
            <input type="tel" placeholder="+27 62 284 0601" value={form.phone}
              onChange={e => updateField('phone', e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, phone: true }))}
              className={inputClass('phone')} />
          </div>
          {errors.phone && <p className="text-xs text-[#E53935] mt-1">{errors.phone}</p>}
        </div>

        {/* Team Name */}
        <div>
          <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">
            Team / Group Name
          </label>
          <div className="relative">
            <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
            <input type="text" placeholder="Optional" value={form.teamName}
              onChange={e => updateField('teamName', e.target.value)}
              className={inputClass('teamName')} />
          </div>
        </div>

        {/* Special Requests */}
        <div>
          <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">
            Special Requests
          </label>
          <div className="relative">
            <MessageSquare className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8A8A8A]" />
            <textarea placeholder="Any special requirements..." rows={4}
              value={form.specialRequests}
              onChange={e => updateField('specialRequests', e.target.value)}
              className="w-full px-4 pl-11 py-3 rounded-xl border border-[#E0E0D8] bg-white text-[#0A0A0A] text-sm font-medium placeholder:text-[#B0B0A8] focus:outline-none focus:ring-[3px] focus:ring-[#1B7A40]/10 focus:border-[#1B7A40] transition-all duration-200 resize-none" />
          </div>
        </div>

        {/* Cash payment note */}
        <div className="bg-[#E8F5EC] rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-[#1B7A40] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[#1B7A40]">Cash Payment on Arrival</p>
            <p className="text-xs text-[#1B7A40]/80 mt-0.5">Pay R{totalPrice} in cash when you arrive at the facility. Your booking will be confirmed immediately.</p>
          </div>
        </div>

        {/* Submit Button */}
        <button onClick={handleSubmit}
          className="w-full h-14 bg-[#1B7A40] hover:bg-[#145C32] text-white rounded-xl font-bold text-base transition-colors duration-200 shadow-lg shadow-[#1B7A40]/20 flex items-center justify-center gap-2 active:shadow-md">
          <CheckCircle className="w-5 h-5" />
          Complete Booking — R{totalPrice}
        </button>

        <p className="text-center text-xs text-[#8A8A8A]">
          By completing this booking, you agree to our cancellation policy. You can cancel up to 3 hours before your booking time.
        </p>
      </div>
    </div>
  );
}
