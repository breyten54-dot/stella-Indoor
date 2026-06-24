import { useState } from 'react';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';

interface Props {
  onLogin: (email: string, password: string) => Promise<boolean>;
}

export function AdminLogin({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Enter email and password');
      return;
    }
    setLoading(true);
    setError('');
    const success = await onLogin(email, password);
    if (!success) {
      setError('Invalid admin credentials');
      setPassword('');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0b0f1e] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#6366f1]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#8b5cf6]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4">
            <img src="/logo-admin.png" alt="Stella Admin" className="w-full h-full rounded-2xl object-cover shadow-lg shadow-[#6366f1]/25" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Stella Admin</h1>
          <p className="text-[#64748b] text-sm mt-1">Facility Management Dashboard</p>
        </div>

        <div className="bg-[#13182b] rounded-2xl p-6 border border-[#1e293b]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Admin Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
                <input type="email" placeholder="admin@example.com" value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-[#1e293b] bg-[#0b0f1e] text-white text-sm font-medium placeholder:text-[#334155] focus:outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1]/20 transition-all"
                  autoFocus />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
                <input type={showPassword ? 'text' : 'password'} placeholder="Enter admin password" value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="w-full h-12 pl-11 pr-11 rounded-xl border border-[#1e293b] bg-[#0b0f1e] text-white text-sm font-medium placeholder:text-[#334155] focus:outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1]/20 transition-all" />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#475569] hover:text-white transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
            </div>

            <button type="submit" disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e0] hover:to-[#7c4ee5] disabled:opacity-60 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-[#6366f1]/20">
              {loading ? 'Signing in...' : 'Sign In to Dashboard'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#475569] mt-5">
          <a href="/" className="text-[#6366f1] hover:text-[#8b5cf6] transition-colors">Back to Booking App</a>
        </p>
      </div>
    </div>
  );
}
