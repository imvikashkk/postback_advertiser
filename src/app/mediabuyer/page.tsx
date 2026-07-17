'use client';

import { useState, useEffect, useCallback } from 'react';

const BLUE    = '#2563EB';
const BLUE_LT = '#EFF6FF';
const BLUE_MD = '#DBEAFE';

async function mbLogout() {
  await fetch('/api/mediabuyer/logout', { method: 'POST' });
  window.location.href = '/mediabuyer/login';
}

type MBTab = 'overview' | 'conversions';

interface Profile { id: number; name: string; email: string | null }
interface Pixel { id: number; label: string; pixel_id: string; ad_account_id: string | null; is_default: boolean }
interface Publisher { id: number; name: string; slug: string }
interface Stats { total_clicks: string; total_conversions: string; total_payout: string }

interface PublisherBreakdown { id: number; name: string; slug: string; clicks: string; conversions: string; payout: string }
interface ConversionRow {
  id: number; click_id: string | null; event: string; payout: string | null; status: string; created_at: string;
  publisher_name: string; publisher_slug: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

const inputCls  = 'w-full px-3 py-2 rounded-[8px] text-[12px] text-slate-800 bg-white border outline-none transition-all focus:ring-2 focus:ring-blue-200';
const inputStyle = { borderColor: '#CBD5E1' };
const labelCls  = 'text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-1';
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14 };

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 mt-2">
      <code className="flex-1 text-[11px] px-3 py-2 rounded-[8px] font-mono truncate select-all"
        style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE_MD}` }}>
        {value}
      </code>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="px-3 py-2 rounded-[8px] text-[11px] font-bold shrink-0 transition-all"
        style={{
          background: copied ? '#F0FDF4' : BLUE_LT,
          color: copied ? '#15803D' : BLUE,
          border: `1px solid ${copied ? '#BBF7D0' : BLUE_MD}`,
        }}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

const EMPTY_PIXEL = { label: '', pixel_id: '', access_token: '', ad_account_id: '', is_default: false };
type PixelForm = typeof EMPTY_PIXEL;

function PixelFormCard({
  initial = EMPTY_PIXEL, isEdit = false, onSave, onCancel, saving,
}: {
  initial?: PixelForm; isEdit?: boolean; onSave: (f: PixelForm) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof PixelForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = form.label.trim() && form.pixel_id.trim() && form.access_token.trim();

  return (
    <div className="rounded-[14px] p-5 mb-4" style={{ ...card, background: '#F8FAFC', border: `1.5px solid ${isEdit ? BLUE_MD : '#E2E8F0'}` }}>
      <p className="text-[13px] font-bold text-slate-800 mb-4">{isEdit ? 'Edit pixel' : 'Add pixel'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Label <span style={{ color: BLUE }}>*</span></label>
          <input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Main pixel" className={inputCls} style={inputStyle} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Pixel ID <span style={{ color: BLUE }}>*</span></label>
          <input value={form.pixel_id} onChange={(e) => set('pixel_id', e.target.value)} placeholder="e.g. 123456789012345" className={inputCls} style={inputStyle} />
        </div>
      </div>
      <div className="mb-3">
        <label className={labelCls}>Access Token (CAPI) <span style={{ color: BLUE }}>*</span></label>
        <input type="password" value={form.access_token} onChange={(e) => set('access_token', e.target.value)} placeholder="EAAG..." className={inputCls + ' font-mono'} style={inputStyle} />
      </div>
      <div className="mb-4">
        <label className={labelCls}>Ad Account ID <span className="text-slate-300 font-normal normal-case">(optional)</span></label>
        <input value={form.ad_account_id} onChange={(e) => set('ad_account_id', e.target.value)} placeholder="act_123456789" className={inputCls} style={inputStyle} />
      </div>
      <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
        <input type="checkbox" checked={form.is_default} onChange={(e) => set('is_default', e.target.checked)} className="w-3.5 h-3.5" />
        <span className="text-[12px] font-semibold text-slate-600">Default pixel (used for CAPI when a conversion comes in)</span>
      </label>
      <div className="flex items-center gap-2">
        <button onClick={() => onSave(form)} disabled={saving || !canSave}
          className="px-4 py-2 rounded-[8px] text-[12px] font-bold text-white transition-all disabled:opacity-40" style={{ background: BLUE }}>
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-slate-500 hover:bg-slate-100"
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Conversions Tab ─────────────────────────────────────── */
function ConversionsTab() {
  const [byPublisher, setByPublisher] = useState<PublisherBreakdown[]>([]);
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = useCallback(async (pg: number) => {
    setLoading(true);
    const res = await fetch(`/api/mediabuyer/conversions?page=${pg}`);
    if (res.status === 401) { window.location.href = '/mediabuyer/login'; return; }
    const json = await res.json();
    if (json.success) {
      setByPublisher(json.by_publisher); setRows(json.data);
      setTotal(json.total); setTotalPages(json.totalPages);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  return (
    <div>
      <div className="rounded-[14px] overflow-hidden mb-6" style={card}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">By Publisher</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                {['Publisher', 'Clicks', 'Conversions', 'CVR', 'Payout'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    {[100, 40, 60, 40, 60].map((w, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3.5 rounded animate-pulse bg-slate-100" style={{ width: w }} /></td>
                    ))}
                  </tr>
                ))
              ) : byPublisher.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-slate-400">No clicks yet on any publisher.</td></tr>
              ) : (
                byPublisher.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50 transition-colors" style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-bold text-slate-800 block">{row.name}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{row.slug}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-black text-slate-800">{row.clicks}</td>
                    <td className="px-4 py-3 text-[12px] font-bold text-blue-600">{row.conversions}</td>
                    <td className="px-4 py-3 text-[12px] text-slate-500">
                      {Number(row.clicks) > 0 ? `${((Number(row.conversions) / Number(row.clicks)) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-bold text-amber-700">₹{Number(row.payout).toLocaleString('en-IN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[14px] overflow-hidden" style={card}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">Postbacks received</p>
          <span className="text-[11px] text-slate-400">{total} total · Page {page}/{totalPages}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                {['Publisher', 'Event', 'Payout', 'Status', 'Date & Time'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    {[100, 70, 60, 60, 120].map((w, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3.5 rounded animate-pulse bg-slate-100" style={{ width: w }} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[13px] text-slate-400">No postbacks received yet</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-bold text-slate-800 block">{row.publisher_name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{row.publisher_slug}</span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600">{row.event}</td>
                    <td className="px-4 py-3 text-[12px] font-bold text-amber-700">{row.payout ? `₹${Number(row.payout).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-400">{formatDate(row.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid #F1F5F9', background: '#F8FAFC' }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}
              className="px-3.5 py-2 rounded-[10px] text-[12px] font-bold transition-all disabled:opacity-30"
              style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', color: '#64748B' }}>Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
              className="px-3.5 py-2 rounded-[10px] text-[12px] font-bold transition-all disabled:opacity-30"
              style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', color: '#64748B' }}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MBDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAdv, setSelectedAdv] = useState<string>('');
  const [showPixelForm, setShowPixelForm] = useState(false);
  const [editPixel, setEditPixel] = useState<Pixel | null>(null);
  const [savingPixel, setSavingPixel] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [mbTab, setMbTab] = useState<MBTab>('overview');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const fetchMe = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/mediabuyer/me');
    if (res.status === 401) { window.location.href = '/mediabuyer/login'; return; }
    const json = await res.json();
    if (json.success) {
      setProfile(json.profile);
      setStats(json.stats);
      setPublishers(json.publishers);
      setPixels(json.pixels);
      if (json.publishers.length > 0) setSelectedAdv((s) => s || json.publishers[0].slug);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  async function handleSavePixel(form: PixelForm) {
    setSavingPixel(true);
    const url = editPixel ? `/api/mediabuyer/pixels/${editPixel.id}` : '/api/mediabuyer/pixels';
    const method = editPixel ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const json = await res.json();
    setSavingPixel(false);
    if (json.success) {
      setShowPixelForm(false); setEditPixel(null); fetchMe();
    } else { alert(json.message ?? 'Error saving pixel'); }
  }

  async function handleDeletePixel(id: number) {
    const res = await fetch(`/api/mediabuyer/pixels/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { setDeleteConfirm(null); fetchMe(); } else { alert(json.message ?? 'Delete failed'); }
  }

  const statCards = stats ? [
    { label: 'Clicks',      value: stats.total_clicks,      color: BLUE,      bg: BLUE_LT },
    { label: 'Conversions', value: stats.total_conversions, color: '#15803D', bg: '#F0FDF4' },
    { label: 'Payout',      value: `₹${Number(stats.total_payout).toLocaleString('en-IN')}`, color: '#A16207', bg: '#FEFCE8' },
  ] : [];

  return (
    <main className="min-h-[100dvh]" style={{ background: '#F1F5F9', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3.5"
        style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2E8F0' }}>
        <div>
          <span className="text-[14px] font-bold text-slate-900">{profile?.name || 'Media Buyer Portal'}</span>
          <span className="ml-2 text-[9px] font-bold uppercase tracking-[.15em] px-1.5 py-0.5 rounded-full" style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE_MD}` }}>Media Buyer</span>
        </div>
        {!logoutConfirm ? (
          <button onClick={() => setLogoutConfirm(true)} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>Logout</button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Sure?</span>
            <button onClick={() => setLogoutConfirm(false)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>No</button>
            <button onClick={mbLogout} className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white" style={{ background: '#DC2626' }}>Yes</button>
          </div>
        )}
      </header>

      <div className="px-4 md:px-6 py-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-1.5 mb-6">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'conversions', label: 'Conversions' },
          ] as { key: MBTab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setMbTab(t.key)}
              className="px-4 py-2 rounded-[10px] text-[12px] font-bold transition-all"
              style={{
                background: mbTab === t.key ? BLUE : '#FFFFFF',
                border: `1.5px solid ${mbTab === t.key ? BLUE : '#E2E8F0'}`,
                color: mbTab === t.key ? '#FFFFFF' : '#64748B',
                boxShadow: mbTab === t.key ? `0 4px 14px -4px ${BLUE}66` : 'none',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {mbTab === 'conversions' && <ConversionsTab />}

        {mbTab === 'overview' && (loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-[14px] animate-pulse bg-slate-100" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {statCards.map((c) => (
                <div key={c.label} className="rounded-[14px] px-4 py-4" style={{ background: c.bg, border: `1px solid ${c.color}22` }}>
                  <p className="text-[9px] font-bold uppercase tracking-[.15em] mb-0.5" style={{ color: c.color + 'AA' }}>{c.label}</p>
                  <p className="text-[20px] font-black leading-none" style={{ color: c.color }}>{c.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[14px] p-5 mb-6" style={card}>
              <p className="text-[13px] font-bold text-slate-800 mb-1">Your tracking link</p>
              <p className="text-[11px] text-slate-400 mb-3">Pick an publisher and use this link in your ads. Clicks and conversions will be tagged to you.</p>
              {publishers.length === 0 ? (
                <p className="text-[12px] text-slate-400">No active publishers yet — ask admin to add one.</p>
              ) : (
                <>
                  <select value={selectedAdv} onChange={(e) => setSelectedAdv(e.target.value)}
                    className={inputCls} style={inputStyle}>
                    {publishers.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                  </select>
                  {selectedAdv && profile && (
                    <CopyBox value={`${baseUrl}/go/${selectedAdv}?mb=${profile.id}`} />
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[15px] font-bold text-slate-800">Your Meta Pixels</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">The default pixel gets notified via CAPI when your traffic converts.</p>
              </div>
              {!showPixelForm && !editPixel && (
                <button onClick={() => setShowPixelForm(true)}
                  className="px-3.5 py-2 rounded-[10px] text-[12px] font-bold text-white shrink-0" style={{ background: BLUE }}>
                  + Add pixel
                </button>
              )}
            </div>

            {showPixelForm && <PixelFormCard onSave={handleSavePixel} onCancel={() => setShowPixelForm(false)} saving={savingPixel} />}

            {pixels.length === 0 && !showPixelForm ? (
              <p className="text-[13px] text-slate-400 py-4">No pixels added yet — conversions won't be reported to Meta until you add one.</p>
            ) : (
              <div className="space-y-2">
                {pixels.map((px) => (
                  <div key={px.id}>
                    {editPixel?.id === px.id ? (
                      <PixelFormCard
                        initial={{ label: px.label, pixel_id: px.pixel_id, access_token: '', ad_account_id: px.ad_account_id ?? '', is_default: px.is_default }}
                        isEdit onSave={handleSavePixel} onCancel={() => setEditPixel(null)} saving={savingPixel}
                      />
                    ) : (
                      <div className="flex items-center justify-between px-4 py-3.5 rounded-[12px]" style={card}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-slate-800">{px.label}</span>
                            {px.is_default && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>Default</span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{px.pixel_id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {deleteConfirm === px.id ? (
                            <>
                              <span className="text-[11px] text-slate-500">Delete?</span>
                              <button onClick={() => setDeleteConfirm(null)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-slate-500" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>No</button>
                              <button onClick={() => handleDeletePixel(px.id)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-white" style={{ background: '#DC2626' }}>Yes</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditPixel(px); setShowPixelForm(false); }} className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold text-slate-600 hover:bg-slate-100" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>Edit</button>
                              <button onClick={() => setDeleteConfirm(px.id)} className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ))}
      </div>
    </main>
  );
}
