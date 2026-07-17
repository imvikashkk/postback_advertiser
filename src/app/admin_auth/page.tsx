'use client';

import { useState } from 'react';

const ACCENT = '#2563EB';

export default function AdminAuthPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = '/admin';
      } else {
        setError(data.message || 'Invalid credentials');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-[100dvh] flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg,#0a0a0a 0%,#0a0f1a 60%,#000814 100%)',
        fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
      }}
    >
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .fu { animation: fadeUp .5s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

      <div className="w-full max-w-sm fu">
        {/* Logo area */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: `linear-gradient(135deg,#1d4ed8,${ACCENT})`,
              boxShadow: `0 0 32px -4px ${ACCENT}88`,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round">
              <path d="M4 17l6-6-4-4M12 19h8" />
            </svg>
          </div>
          <h1
            className="text-[22px] font-black tracking-tight text-white"
            style={{ letterSpacing: '-.01em' }}
          >
            Admin Panel
          </h1>
          <p className="text-[12px] text-white/30 mt-1">Postback Advertise — Restricted Access</p>
        </div>

        {/* Card */}
        <div
          className="rounded-[20px] p-6"
          style={{
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.1)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 24px 48px rgba(0,0,0,.6)',
          }}
        >
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[.18em] text-white/30 mb-1.5">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth={2} strokeLinecap="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  required
                  className="w-full pl-9 pr-4 py-3 rounded-[12px] text-[14px] text-white placeholder-white/20 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,.06)',
                    border: '1px solid rgba(255,255,255,.1)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = ACCENT + '88')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,.1)')}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[.18em] text-white/30 mb-1.5">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth={2} strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  className="w-full pl-9 pr-10 py-3 rounded-[12px] text-[14px] text-white placeholder-white/20 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,.06)',
                    border: '1px solid rgba(255,255,255,.1)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = ACCENT + '88')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,.1)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,.25)' }}
                >
                  {showPass ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="rounded-[10px] px-4 py-2.5 text-[12px] font-semibold text-center"
                style={{
                  background: 'rgba(220,38,38,.12)',
                  border: '1px solid rgba(220,38,38,.25)',
                  color: '#f87171',
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-[13px] text-[14px] font-black text-white tracking-wide flex items-center justify-center gap-2 transition-opacity"
              style={{
                background: `linear-gradient(90deg,#1d4ed8,${ACCENT},#3b82f6)`,
                boxShadow: `0 8px 22px -6px ${ACCENT}66`,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Logging in...
                </>
              ) : (
                'Login to Admin'
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
