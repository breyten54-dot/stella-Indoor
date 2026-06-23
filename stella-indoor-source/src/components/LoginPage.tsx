import { useState } from 'react';
import { Mail, Lock, LogIn, UserPlus, User, Phone, ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react';
import { loginUser, registerUser, resetUserPassword } from '@/hooks/useFirestoreUsers';
import { createResetCode, verifyResetCode, markCodeUsed } from '@/hooks/usePasswordReset';
import { sendPasswordResetEmail } from '@/lib/emailService';
import { InstallButton } from '@/components/InstallButton';

interface LoginPageProps {
  onLogin: (email: string, name: string, phone: string) => void;
}

type AuthMode = 'login' | 'register' | 'reset' | 'reset-verify';

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<AuthMode>('login');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrors, setLoginErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [loginLoading, setLoginLoading] = useState(false);

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  // Password visibility toggles
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);

  // Reset password fields
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetErrors, setResetErrors] = useState<Record<string, string>>({});
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStep, setResetStep] = useState<'email' | 'code'>('email');

  const validateLogin = () => {
    const errors: typeof loginErrors = {};
    if (!loginEmail.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) errors.email = 'Invalid email';
    if (!loginPassword) errors.password = 'Password is required';
    setLoginErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateRegister = () => {
    const errors: Record<string, string> = {};
    if (!regName.trim()) errors.name = 'Full name is required';
    if (!regEmail.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) errors.email = 'Invalid email';
    if (!regPhone.trim()) errors.phone = 'Phone number is required';
    if (!regPassword) errors.password = 'Password is required';
    else if (regPassword.length < 6) errors.password = 'Must be at least 6 characters';
    if (regPassword !== regConfirmPassword) errors.confirmPassword = 'Passwords do not match';
    setRegErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateLogin()) return;
    setLoginLoading(true);
    setLoginErrors({});
    try {
      const result = await loginUser(loginEmail, loginPassword);
      if (result.success) {
        onLogin(loginEmail, result.name, result.phone);
      } else {
        setLoginErrors({ general: result.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setLoginErrors({ general: msg });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRegister()) return;
    setRegLoading(true);
    setRegErrors({});
    try {
      const result = await registerUser({
        email: regEmail,
        name: regName,
        phone: regPhone,
        password: regPassword,
      });
      if (result.success) {
        setRegSuccess(true);
        setTimeout(() => {
          setMode('login');
          setLoginEmail(regEmail);
          setRegSuccess(false);
          setRegName('');
          setRegEmail('');
          setRegPhone('');
          setRegPassword('');
          setRegConfirmPassword('');
        }, 2000);
      } else {
        setRegErrors({ general: result.message });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setRegErrors({ general: msg });
    } finally {
      setRegLoading(false);
    }
  };

  // Step 1: Send reset code
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!resetEmail.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) errors.email = 'Invalid email';
    setResetErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setResetLoading(true);
    setResetErrors({});
    try {
      const code = await createResetCode(resetEmail);
      await sendPasswordResetEmail({ toEmail: resetEmail, resetCode: code });
      setResetStep('code');
    } catch (err: any) {
      setResetErrors({ general: err?.message || 'Failed to send reset code' });
    } finally {
      setResetLoading(false);
    }
  };

  // Step 2: Verify code and reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!resetCode.trim()) errors.code = 'Reset code is required';
    if (!resetNewPassword) errors.newPassword = 'New password is required';
    else if (resetNewPassword.length < 6) errors.newPassword = 'Must be at least 6 characters';
    if (resetNewPassword !== resetConfirmPassword) errors.confirmPassword = 'Passwords do not match';
    setResetErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setResetLoading(true);
    setResetErrors({});
    try {
      const isValid = await verifyResetCode(resetEmail, resetCode);
      if (!isValid) {
        setResetErrors({ general: 'Invalid or expired code. Please request a new one.' });
        return;
      }
      await resetUserPassword(resetEmail, resetNewPassword);
      await markCodeUsed(resetEmail);
      setLoginEmail(resetEmail);
      setMode('login');
      setResetStep('email');
      setResetCode('');
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err: any) {
      setResetErrors({ general: err?.message || 'Failed to reset password' });
    } finally {
      setResetLoading(false);
    }
  };

  const inputClass = 'w-full h-[52px] pl-11 pr-4 rounded-xl border bg-[#0A0A0A] text-white text-sm font-medium placeholder:text-[#4A4A4A] focus:outline-none focus:ring-[3px] focus:ring-[#1B7A40]/10 focus:border-[#1B7A40] transition-all duration-200 border-[#2A2A2A]';

  const subtitle = mode === 'login' ? 'Sign in to book your court' : mode === 'register' ? 'Create your account' : 'Reset your password';

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1B7A40]/10 via-transparent to-transparent pointer-events-none" />

      {/* Top-right install button */}
      <div className="fixed top-4 right-4 z-50">
        <InstallButton variant="pill" />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4">
            <img src="/logo-original.jpg" alt="Stella Indoor" className="w-full h-full rounded-full object-cover" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">STELLA INDOOR</h1>
          <p className="text-[#8A8A8A] text-sm mt-1">{subtitle}</p>
        </div>

        {/* Card */}
        <div className="bg-[#141414] rounded-2xl p-6 border border-[#2A2A2A]">
          {mode === 'login' ? (
            /* LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              {loginErrors.general && (
                <div className="bg-[#E53935]/10 border border-[#E53935]/20 rounded-xl px-4 py-3 text-sm text-[#E53935]">
                  {loginErrors.general}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type="email" placeholder="you@example.com" value={loginEmail}
                    onChange={e => { setLoginEmail(e.target.value); if (loginErrors.email) setLoginErrors(p => ({ ...p, email: undefined })); }}
                    className={inputClass} />
                </div>
                {loginErrors.email && <p className="text-xs text-[#E53935] mt-1">{loginErrors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type={showLoginPassword ? 'text' : 'password'} placeholder="••••••••" value={loginPassword}
                    onChange={e => { setLoginPassword(e.target.value); if (loginErrors.password) setLoginErrors(p => ({ ...p, password: undefined })); }}
                    className={`${inputClass} pr-11`} />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#1B7A40] transition-colors"
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}>
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {loginErrors.password && <p className="text-xs text-[#E53935] mt-1">{loginErrors.password}</p>}
                <div className="flex justify-end mt-1">
                  <button type="button" onClick={() => { setMode('reset'); setResetStep('email'); setResetEmail(loginEmail); }}
                    className="text-xs text-[#1B7A40] hover:text-[#7ED321] transition-colors font-medium">
                    Forgot password?
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loginLoading}
                className="w-full h-14 bg-[#1B7A40] hover:bg-[#145C32] disabled:bg-[#1B7A40]/50 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors duration-200 mt-2">
                {loginLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><LogIn className="w-4 h-4" /> Sign In</>
                )}
              </button>

              <div className="mt-5 pt-4 border-t border-[#2A2A2A] text-center">
                <p className="text-xs text-[#8A8A8A]">
                  Don't have an account?{' '}
                  <button type="button" onClick={() => setMode('register')}
                    className="text-[#1B7A40] font-semibold hover:text-[#7ED321] transition-colors">
                    Register
                  </button>
                </p>
              </div>
            </form>

          ) : mode === 'register' ? (
            /* REGISTER FORM */
            <form onSubmit={handleRegister} className="space-y-4">
              {regSuccess && (
                <div className="bg-[#1B7A40]/10 border border-[#1B7A40]/20 rounded-xl px-4 py-3 text-sm text-[#7ED321] font-semibold">
                  Account created! Redirecting to login...
                </div>
              )}
              {regErrors.general && (
                <div className="bg-[#E53935]/10 border border-[#E53935]/20 rounded-xl px-4 py-3 text-sm text-[#E53935]">
                  {regErrors.general}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type="text" placeholder="John Smith" value={regName}
                    onChange={e => { setRegName(e.target.value); setRegErrors(p => { const n = { ...p }; delete n.name; return n; }); }}
                    className={inputClass} />
                </div>
                {regErrors.name && <p className="text-xs text-[#E53935] mt-1">{regErrors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type="email" placeholder="you@example.com" value={regEmail}
                    onChange={e => { setRegEmail(e.target.value); setRegErrors(p => { const n = { ...p }; delete n.email; return n; }); }}
                    className={inputClass} />
                </div>
                {regErrors.email && <p className="text-xs text-[#E53935] mt-1">{regErrors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type="tel" placeholder="082 000 0000" value={regPhone}
                    onChange={e => { setRegPhone(e.target.value); setRegErrors(p => { const n = { ...p }; delete n.phone; return n; }); }}
                    className={inputClass} />
                </div>
                {regErrors.phone && <p className="text-xs text-[#E53935] mt-1">{regErrors.phone}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type={showRegPassword ? 'text' : 'password'} placeholder="Min 6 characters" value={regPassword}
                    onChange={e => { setRegPassword(e.target.value); setRegErrors(p => { const n = { ...p }; delete n.password; return n; }); }}
                    className={`${inputClass} pr-11`} />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#1B7A40] transition-colors"
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}>
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {regErrors.password && <p className="text-xs text-[#E53935] mt-1">{regErrors.password}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type={showRegConfirmPassword ? 'text' : 'password'} placeholder="Repeat password" value={regConfirmPassword}
                    onChange={e => { setRegConfirmPassword(e.target.value); setRegErrors(p => { const n = { ...p }; delete n.confirmPassword; return n; }); }}
                    className={`${inputClass} pr-11`} />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#1B7A40] transition-colors"
                    aria-label={showRegConfirmPassword ? 'Hide password' : 'Show password'}>
                    {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {regErrors.confirmPassword && <p className="text-xs text-[#E53935] mt-1">{regErrors.confirmPassword}</p>}
              </div>

              <button type="submit" disabled={regLoading}
                className="w-full h-14 bg-[#1B7A40] hover:bg-[#145C32] disabled:bg-[#1B7A40]/50 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors duration-200 mt-2">
                {regLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><UserPlus className="w-4 h-4" /> Create Account</>
                )}
              </button>

              <div className="mt-5 pt-4 border-t border-[#2A2A2A] text-center">
                <p className="text-xs text-[#8A8A8A]">
                  Already have an account?{' '}
                  <button type="button" onClick={() => setMode('login')}
                    className="text-[#1B7A40] font-semibold hover:text-[#7ED321] transition-colors">
                    Sign In
                  </button>
                </p>
              </div>
            </form>

          ) : resetStep === 'email' ? (
            /* RESET PASSWORD - Step 1: Email */
            <form onSubmit={handleSendResetCode} className="space-y-4">
              {resetErrors.general && (
                <div className="bg-[#E53935]/10 border border-[#E53935]/20 rounded-xl px-4 py-3 text-sm text-[#E53935]">
                  {resetErrors.general}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type="email" placeholder="you@example.com" value={resetEmail}
                    onChange={e => { setResetEmail(e.target.value); setResetErrors(p => { const n = { ...p }; delete n.email; return n; }); }}
                    className={inputClass} />
                </div>
                {resetErrors.email && <p className="text-xs text-[#E53935] mt-1">{resetErrors.email}</p>}
              </div>

              <button type="submit" disabled={resetLoading}
                className="w-full h-14 bg-[#1B7A40] hover:bg-[#145C32] disabled:bg-[#1B7A40]/50 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors duration-200 mt-2">
                {resetLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><KeyRound className="w-4 h-4" /> Send Reset Code</>
                )}
              </button>

              <div className="mt-5 pt-4 border-t border-[#2A2A2A] text-center">
                <button type="button" onClick={() => { setMode('login'); setResetStep('email'); setResetErrors({}); }}
                  className="text-xs text-[#8A8A8A] hover:text-[#1B7A40] transition-colors flex items-center gap-1.5 mx-auto">
                  <ArrowLeft className="w-3 h-3" /> Back to Sign In
                </button>
              </div>
            </form>

          ) : (
            /* RESET PASSWORD - Step 2: Code + New Password */
            <form onSubmit={handleResetPassword} className="space-y-4">
              {resetErrors.general && (
                <div className="bg-[#E53935]/10 border border-[#E53935]/20 rounded-xl px-4 py-3 text-sm text-[#E53935]">
                  {resetErrors.general}
                </div>
              )}

              <div className="bg-[#1B7A40]/10 border border-[#1B7A40]/20 rounded-xl px-4 py-3 text-sm text-[#7ED321]">
                A 6-digit reset code was sent to <strong>{resetEmail}</strong>. Check your inbox.
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Reset Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type="text" placeholder="000000" maxLength={6} value={resetCode}
                    onChange={e => { setResetCode(e.target.value.replace(/\D/g, '')); setResetErrors(p => { const n = { ...p }; delete n.code; return n; }); }}
                    className={inputClass} />
                </div>
                {resetErrors.code && <p className="text-xs text-[#E53935] mt-1">{resetErrors.code}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type={showResetNewPassword ? 'text' : 'password'} placeholder="Min 6 characters" value={resetNewPassword}
                    onChange={e => { setResetNewPassword(e.target.value); setResetErrors(p => { const n = { ...p }; delete n.newPassword; return n; }); }}
                    className={`${inputClass} pr-11`} />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowResetNewPassword(!showResetNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#1B7A40] transition-colors"
                    aria-label={showResetNewPassword ? 'Hide password' : 'Show password'}>
                    {showResetNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {resetErrors.newPassword && <p className="text-xs text-[#E53935] mt-1">{resetErrors.newPassword}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8A8A]" />
                  <input type={showResetConfirmPassword ? 'text' : 'password'} placeholder="Repeat password" value={resetConfirmPassword}
                    onChange={e => { setResetConfirmPassword(e.target.value); setResetErrors(p => { const n = { ...p }; delete n.confirmPassword; return n; }); }}
                    className={`${inputClass} pr-11`} />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowResetConfirmPassword(!showResetConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#1B7A40] transition-colors"
                    aria-label={showResetConfirmPassword ? 'Hide password' : 'Show password'}>
                    {showResetConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {resetErrors.confirmPassword && <p className="text-xs text-[#E53935] mt-1">{resetErrors.confirmPassword}</p>}
              </div>

              <button type="submit" disabled={resetLoading}
                className="w-full h-14 bg-[#1B7A40] hover:bg-[#145C32] disabled:bg-[#1B7A40]/50 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors duration-200 mt-2">
                {resetLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><KeyRound className="w-4 h-4" /> Reset Password</>
                )}
              </button>

              <div className="mt-5 pt-4 border-t border-[#2A2A2A] text-center space-y-2">
                <button type="button" onClick={() => setResetStep('email')}
                  className="text-xs text-[#8A8A8A] hover:text-[#1B7A40] transition-colors flex items-center gap-1.5 mx-auto">
                  <ArrowLeft className="w-3 h-3" /> Request new code
                </button>
                <button type="button" onClick={() => { setMode('login'); setResetStep('email'); }}
                  className="text-xs text-[#1B7A40] hover:text-[#7ED321] transition-colors flex items-center gap-1.5 mx-auto">
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Back link */}
        <p className="text-center text-xs text-[#8A8A8A] mt-6">
          Need help?{' '}
          <a href="https://wa.me/27622840601" target="_blank" rel="noopener noreferrer" className="text-[#1B7A40] hover:text-[#7ED321] transition-colors">
            Contact us on WhatsApp
          </a>
        </p>
      </div>
    </div>
  );
}
