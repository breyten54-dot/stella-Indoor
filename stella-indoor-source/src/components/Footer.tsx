import { MapPin, Phone, Mail } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-[#0A0A0A] py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img
              src="/logo-stella.png"
              alt="Stella Indoor"
              className="w-10 h-10 rounded-full object-cover"
            />
            <span className="text-white font-extrabold text-lg tracking-tight">
              STELLA INDOOR
            </span>
          </div>

          {/* Tagline */}
          <p className="text-[#8A8A8A] text-sm">
            Durban's Premier Indoor Sports Facility
          </p>

          {/* Contact Info */}
          <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-[#8A8A8A]">
            <a href="tel:+27622840601" className="flex items-center gap-2 hover:text-[#7ED321] transition-colors">
              <Phone className="w-4 h-4" />
              +27 62 284 0601
            </a>
            <a href="mailto:stellasportshub@gmail.com" className="flex items-center gap-2 hover:text-[#7ED321] transition-colors">
              <Mail className="w-4 h-4" />
              stellasportshub@gmail.com
            </a>
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Helen Joseph Road, Durban
            </span>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-[#2A2A2A]" />

          {/* Copyright */}
          <p className="text-xs text-[#8A8A8A]">
            © 2025 Stella Indoor Sports Hub. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
