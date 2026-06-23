import { useState, useRef, useEffect } from 'react';
import { Phone, Mail, MessageCircle, ChevronDown } from 'lucide-react';

export function ContactMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items = [
    {
      label: 'Call Us',
      sub: '+27 62 284 0601',
      href: 'tel:+27622840601',
      icon: <Phone className="w-4 h-4" />,
      color: 'text-[#7ED321]',
      bg: 'bg-[#7ED321]/10',
    },
    {
      label: 'Email Us',
      sub: 'stellasportshub@gmail.com',
      href: 'mailto:stellasportshub@gmail.com',
      icon: <Mail className="w-4 h-4" />,
      color: 'text-[#60A5FA]',
      bg: 'bg-[#60A5FA]/10',
    },
    {
      label: 'WhatsApp',
      sub: 'Chat on WhatsApp',
      href: 'https://wa.me/27622840601',
      icon: <MessageCircle className="w-4 h-4" />,
      color: 'text-[#25D366]',
      bg: 'bg-[#25D366]/10',
      external: true,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 ${
          open
            ? 'bg-[#1B7A40] text-white'
            : 'bg-[#1B7A40] text-white hover:bg-[#145C32]'
        }`}
        aria-label="Contact us"
        title="Contact us"
      >
        <Phone className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Contact</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-56 bg-[#141414] border border-[#2A2A2A] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-50 animate-fade-in">
          <div className="p-2 space-y-1">
            {items.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
              >
                <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center ${item.color} shrink-0`}>
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="text-[11px] text-[#8A8A8A] truncate">{item.sub}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
