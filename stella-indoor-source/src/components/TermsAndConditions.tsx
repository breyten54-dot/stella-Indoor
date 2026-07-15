import { useState, useEffect, type ReactNode } from 'react';
import { X, FileText, Phone } from 'lucide-react';

interface TermsSection {
  title: string;
  points: ReactNode[];
}

const SECTIONS: TermsSection[] = [
  {
    title: '1. Booking and Cancellation Policies',
    points: [
      'All bookings must be made in advance through the Stella Indoor booking app.',
      <>Cancellations can only be made up to <span className="text-white font-semibold">3 hours</span> before your scheduled booking time. Any cancellation made after the 3 hour grace period will require a cancellation fee of <span className="text-white font-semibold">50%</span> of the booking price.</>,
      <>If games are missed or no cancellation is made it will result in a strike. <span className="text-white font-semibold">3 strikes</span> will result in a ban.</>,
      'If you invite other players to join your booking, you remain responsible for the booking, your group, and its payment.',
      'Stella Indoor takes no responsibility for booking and payment errors made by the client.',
    ],
  },
  {
    title: '2. Court Etiquette and Fines',
    points: [
      'All users are expected to leave the courts in a clean and tidy state.',
      <>Any litter found on the courts after your booking time will incur a fine of <span className="text-white font-semibold">R50</span>, payable immediately.</>,
      'Players are to not lift, pull or push the nets of the courts.',
      'No food, alcohol or juices are allowed onto the courts.',
    ],
  },
  {
    title: '3. Liability and Responsibility',
    points: [
      'Stella Indoor is not liable for any injuries, losses, or damages sustained during the use of the facilities. All users are responsible for their own safety and well-being.',
      'By booking, you agree to adhere to all rules and regulations set forth by Stella Indoor and its staff.',
      'Clients are liable for damages to the courts.',
    ],
  },
  {
    title: '4. Amendments to Terms and Conditions',
    points: [
      'Stella Indoor reserves the right to update or modify these Terms and Conditions at any time. Changes will be posted on the booking app, and it is your responsibility to review the Terms periodically.',
    ],
  },
];

export function TermsModal({ onClose, footer }: { onClose: () => void; footer?: ReactNode }) {
  // Lock background scrolling while the terms are open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[99998]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
        <div
          className="bg-[#111111] rounded-2xl border border-[#2A2A2A] shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto my-auto pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-[#111111] border-b border-[#2A2A2A] p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">Terms &amp; Conditions</h2>
                <p className="text-xs text-[#8A8A8A]">Stella Indoor Booking App — Effective January 2025</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[#2A2A2A] flex items-center justify-center text-[#8A8A8A] hover:text-white transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-6">
            <p className="text-sm text-[#B0B0B0] leading-relaxed">
              These Terms and Conditions (&quot;Agreement&quot;) govern your use of the Stella Indoor booking app.
              By booking through our app or using our services, you agree to be bound by
              these Terms and Conditions. If you do not agree with any part of these terms,
              please refrain from using the service.
            </p>

            {SECTIONS.map(section => (
              <div key={section.title}>
                <h3 className="text-sm font-extrabold text-[#7ED321] mb-2">{section.title}</h3>
                <ul className="space-y-2">
                  {section.points.map((point, i) => (
                    <li key={i} className="text-sm text-[#B0B0B0] leading-relaxed flex gap-2">
                      <span className="text-[#1B7A40] shrink-0 mt-0.5">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Contact */}
            <div>
              <h3 className="text-sm font-extrabold text-[#7ED321] mb-2">5. Contact Information</h3>
              <p className="text-sm text-[#B0B0B0] leading-relaxed mb-3">
                For any queries regarding bookings, payments, or these Terms and Conditions,
                please contact us directly through the Stella Indoor WhatsApp.
              </p>
              <div className="space-y-2 text-sm text-[#B0B0B0]">
                <a href="https://wa.me/27622840601" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-[#7ED321] transition-colors w-fit">
                  <Phone className="w-4 h-4 text-[#1B7A40]" /> +27 62 284 0601
                </a>
              </div>
            </div>

            <p className="text-xs text-[#8A8A8A] leading-relaxed border-t border-[#2A2A2A] pt-4">
              By making a booking through our app, you acknowledge that you have read,
              understood, and agree to these Terms and Conditions.
            </p>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-[#111111] border-t border-[#2A2A2A] p-4">
            {footer ?? (
              <button
                onClick={onClose}
                className="w-full h-12 bg-[#1B7A40] hover:bg-[#145C32] text-white rounded-xl font-bold text-sm transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Small self-contained link that opens the terms — drop it anywhere
export function TermsLink({ className, children }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children ?? 'Terms & Conditions'}
      </button>
      {open && <TermsModal onClose={() => setOpen(false)} />}
    </>
  );
}
