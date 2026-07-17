'use client';

import { useState } from 'react';

const BLUE = '#2563EB';

export default function MBLoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/mediabuyer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = '/mediabuyer';
      } else {
        setError(data.message || 'Invalid credentials');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F1F5F9' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
            style={{ background: BLUE }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
          </div>
          <h1 className="text-[22px] font-black text-slate-800">Media Buyer Portal</h1>
          <p className="text-[12px] text-slate-400 mt-1">Postback Advertise</p>
        </div>

        {/* Card */}
        <form onSubmit={handleLogin}
          className="rounded-[18px] p-6 shadow-sm"
          style={{ background: '#fff', border: '1px solid #E2E8F0' }}>

          <div className="mb-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="w-full px-3.5 py-2.5 rounded-[10px] text-[14px] text-slate-800 bg-white outline-none transition-all focus:ring-2 focus:ring-blue-200"
              style={{ border: '1.5px solid #E2E8F0' }}
            />
          </div>

          <div className="mb-5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full px-3.5 py-2.5 pr-10 rounded-[10px] text-[14px] text-slate-800 bg-white outline-none transition-all focus:ring-2 focus:ring-blue-200"
                style={{ border: '1.5px solid #E2E8F0' }}
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPass ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-[10px] px-3.5 py-2.5 text-[12px] font-semibold text-center"
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-[10px] text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: BLUE }}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
