import { useState, useMemo } from 'react';
import { useBodyScrollLock } from '@/admin/hooks/useBodyScrollLock';
import { ModalPortal } from '@/admin/components/ModalPortal';
import { Users, Search, Phone, Mail, Calendar, ChevronRight, UserCheck } from 'lucide-react';
import type { ClientRecord } from '../hooks/useAdminClients';
import type { BookingRecord } from '@/types/booking';

interface Props {
  clients: ClientRecord[];
  bookings: BookingRecord[];
  loading: boolean;
}

export function Clients({ clients, bookings, loading }: Props) {
  const [search, setSearch] = useState('');
  const [bookerFilter, setBookerFilter] = useState<'all' | 'new' | 'recurring'>('all');
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  useBodyScrollLock(selectedClient !== null);

  // Confirmed-booking count per client email → drives the New vs Recurring split.
  const confirmedCountByEmail = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bookings) {
      if (b.status !== 'confirmed') continue;
      const key = b.userEmail.toLowerCase();
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [bookings]);

  // New booker = exactly 1 confirmed booking (first-timer).
  // Recurring booker = 2+ confirmed bookings (returning).
  const bookerType = (email: string): 'new' | 'recurring' | 'none' => {
    const n = confirmedCountByEmail.get(email.toLowerCase()) || 0;
    if (n >= 2) return 'recurring';
    if (n === 1) return 'new';
    return 'none';
  };

  const newCount = useMemo(() => clients.filter(c => bookerType(c.email) === 'new').length, [clients, confirmedCountByEmail]);
  const recurringCount = useMemo(() => clients.filter(c => bookerType(c.email) === 'recurring').length, [clients, confirmedCountByEmail]);

  const filtered = clients.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search);
    if (!matchesSearch) return false;
    if (bookerFilter === 'new') return bookerType(c.email) === 'new';
    if (bookerFilter === 'recurring') return bookerType(c.email) === 'recurring';
    return true;
  });

  const getClientBookings = (email: string) => {
    return bookings
      .filter(b => b.userEmail.toLowerCase() === email.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">Registered Clients</h2>
          <p className="text-xs text-[#64748b] mt-0.5">{clients.length} client{clients.length !== 1 ? 's' : ''} in your database</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-10 pl-10 pr-4 rounded-xl border border-[#1e293b] bg-[#13182b] text-white text-sm placeholder:text-[#475569] focus:outline-none focus:border-[#6366f1] transition-all w-full sm:w-72"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#13182b] rounded-2xl p-4 border border-[#1e293b]">
          <Users className="w-5 h-5 text-[#818cf8] mb-2" />
          <p className="text-xl font-black">{clients.length}</p>
          <p className="text-[10px] text-[#64748b] font-medium uppercase tracking-wider">Total Clients</p>
        </div>
        <div className="bg-[#13182b] rounded-2xl p-4 border border-[#1e293b]">
          <UserCheck className="w-5 h-5 text-[#818cf8] mb-2" />
          <p className="text-xl font-black">
            {new Set(bookings.filter(b => b.status === 'confirmed').map(b => b.userEmail.toLowerCase())).size}
          </p>
          <p className="text-[10px] text-[#64748b] font-medium uppercase tracking-wider">Active Bookers</p>
        </div>
        <div className="bg-[#13182b] rounded-2xl p-4 border border-[#1e293b]">
          <Calendar className="w-5 h-5 text-[#8b5cf6] mb-2" />
          <p className="text-xl font-black">
            {clients.filter(c => {
              const daysSince = (Date.now() - c.createdAt) / (1000 * 60 * 60 * 24);
              return daysSince <= 7;
            }).length}
          </p>
          <p className="text-[10px] text-[#64748b] font-medium uppercase tracking-wider">New This Week</p>
        </div>
      </div>

      {/* Booker filter — New (booked once) vs Recurring (booked 2+ times) */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'all', label: 'All Clients', count: clients.length, hint: 'Everyone in your database' },
          { key: 'new', label: 'New Bookers', count: newCount, hint: 'Clients with exactly 1 confirmed booking' },
          { key: 'recurring', label: 'Recurring Bookers', count: recurringCount, hint: 'Clients with 2 or more confirmed bookings' },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setBookerFilter(opt.key)}
            title={opt.hint}
            className={`h-10 px-4 rounded-xl text-sm font-bold flex items-center gap-2 transition-all border ${
              bookerFilter === opt.key
                ? 'bg-[#6366f1] text-white border-[#6366f1]'
                : 'bg-[#13182b] text-[#94a3b8] border-[#1e293b] hover:border-[#334155]'
            }`}
          >
            {opt.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bookerFilter === opt.key ? 'bg-white/20 text-white' : 'bg-[#0b0f1e] text-[#64748b]'}`}>{opt.count}</span>
          </button>
        ))}
      </div>

      {/* Clients List */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#6366f1]/30 border-t-[#6366f1] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-[#1e293b] mx-auto mb-3" />
            <p className="text-sm text-[#64748b]">
              {search ? 'No clients match your search'
                : bookerFilter === 'new' ? 'No new bookers'
                : bookerFilter === 'recurring' ? 'No recurring bookers yet'
                : 'No registered clients yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e293b]">
            {filtered.map(client => {
              const clientBookings = getClientBookings(client.email);
              const confirmedCount = clientBookings.filter(b => b.status === 'confirmed').length;
              return (
                <div
                  key={client.email}
                  className="hover:bg-[#1a2035] transition-colors cursor-pointer"
                  onClick={() => setSelectedClient(client)}
                >
                  <div className="px-5 py-4 flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{client.name}</p>
                        {bookerType(client.email) === 'recurring' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f1]/10 text-[#818cf8]">
                            Recurring · {confirmedCount}
                          </span>
                        )}
                        {bookerType(client.email) === 'new' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#6366f1]/10 text-[#818cf8]">
                            New
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-[#64748b]">
                          <Mail className="w-3 h-3" /> {client.email}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-[#64748b]">
                          <Phone className="w-3 h-3" /> {client.phone}
                        </span>
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-[#475569] shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Client Detail Modal */}
      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          bookings={getClientBookings(selectedClient.email)}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
}

function ClientDetailModal({ client, bookings, onClose }: {
  client: ClientRecord;
  bookings: BookingRecord[];
  onClose: () => void;
}) {
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const totalSpent = confirmedBookings.reduce((s, b) => s + b.totalPrice, 0);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[99999] flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
        <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] shadow-2xl w-full max-w-[calc(100%-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto my-auto pointer-events-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-[#1e293b]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-lg font-bold">
              {client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="text-lg font-black">{client.name}</h3>
              <p className="text-xs text-[#64748b]">Client since {new Date(client.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="p-6 border-b border-[#1e293b] space-y-3">
          <h4 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-3">Contact Information</h4>
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-[#818cf8]" />
            <div>
              <p className="text-xs text-[#64748b]">Email</p>
              <p className="text-sm font-semibold">{client.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-[#818cf8]" />
            <div>
              <p className="text-xs text-[#64748b]">Phone</p>
              <p className="text-sm font-semibold">{client.phone}</p>
            </div>
          </div>
        </div>

        {/* Booking History */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider">Booking History</h4>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[#64748b]">{confirmedBookings.length} confirmed</span>
              <span className="text-[#818cf8] font-bold">R{totalSpent} total</span>
            </div>
          </div>

          {bookings.length === 0 ? (
            <p className="text-sm text-[#64748b] text-center py-4">No bookings yet</p>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => (
                <div key={b.id} className="bg-[#0b0f1e] rounded-xl p-3 border border-[#1e293b]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{b.courtName}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${b.status === 'cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-[#6366f1]/10 text-[#818cf8]'}`}>
                      {b.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748b] mt-1">{b.date} &middot; {b.startTime} — {b.endTime} ({b.duration}h)</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1e293b]">
                    <span className="text-[10px] text-[#475569] font-mono">{b.id.slice(0, 8)}</span>
                    <span className="text-sm font-bold text-[#818cf8]">R{b.totalPrice}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Close */}
        <div className="p-4 border-t border-[#1e293b] flex justify-end">
          <button onClick={onClose}
            className="h-10 px-6 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-white text-sm font-semibold transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
