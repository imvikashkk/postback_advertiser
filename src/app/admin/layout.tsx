'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BLUE, BLUE_LT, BLUE_MD, adminLogout } from './panels';

const NAV_ITEMS = [
  { href: '/admin/postbacks',   label: 'Postbacks',    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { href: '/admin/advertisers', label: 'Advertisers',  icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z' },
  { href: '/admin/mediabuyers', label: 'Media Buyers', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  return (
    <div className="min-h-[100dvh] flex" style={{ background: '#F1F5F9', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .fu { animation: fadeUp .35s cubic-bezier(.22,1,.36,1) both; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #F1F5F9; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 9999px; }
      `}</style>

      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 hidden sm:flex flex-col sticky top-0 h-[100dvh]"
        style={{ background: '#FFFFFF', borderRight: '1px solid #E2E8F0' }}>
        <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg,${BLUE},#60A5FA)` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round">
              <path d="M4 17l6-6-4-4M12 19h8" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-slate-900 truncate">Postback Advertise</p>
            <p className="text-[9px] font-bold uppercase tracking-[.15em]" style={{ color: BLUE }}>Admin</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[12.5px] font-bold transition-all"
                style={{
                  background: active ? BLUE : 'transparent',
                  color: active ? '#FFFFFF' : '#64748B',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4" style={{ borderTop: '1px solid #E2E8F0' }}>
          {!logoutConfirm ? (
            <button onClick={() => setLogoutConfirm(true)}
              className="w-full px-3 py-2 rounded-[10px] text-[12px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors text-left">
              Logout
            </button>
          ) : (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] text-slate-500">Sure?</span>
              <button onClick={() => setLogoutConfirm(false)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>No</button>
              <button onClick={adminLogout} className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white" style={{ background: '#DC2626' }}>Yes</button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar (sidebar hidden below sm breakpoint) */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sm:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2E8F0' }}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-900">Postback Advertise</span>
            <span className="text-[9px] font-bold uppercase tracking-[.15em] px-1.5 py-0.5 rounded-full" style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE_MD}` }}>Admin</span>
          </div>
          <button onClick={adminLogout} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>Logout</button>
        </header>

        <nav className="sm:hidden flex items-center gap-1.5 px-4 py-2.5 overflow-x-auto" style={{ background: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold shrink-0 transition-all"
                style={{ background: active ? BLUE : '#F1F5F9', color: active ? '#FFFFFF' : '#64748B' }}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 md:px-8 py-6 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
