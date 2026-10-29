'use client';

import { useState, useEffect, useCallback } from 'react';

export const BLUE    = '#2563EB';
export const BLUE_LT = '#EFF6FF';
export const BLUE_MD = '#DBEAFE';

const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export async function adminLogout() {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/admin_auth';
}

/* ── Types ─────────────────────────────────────────────── */
interface Advertiser {
  id: number;
  name: string;
  slug: string;
  landing_url_template: string;
  pubid: string | null;
  postback_key: string;
  payout: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
}

interface Overview {
  total_clicks: string;
  total_conversions: string;
  total_payout: string;
  capi_sent: string;
  capi_failed: string;
  capi_skipped: string;
}

interface AdvertiserStat {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  clicks: string;
  conversions: string;
  payout: string;
}

interface MediaBuyerStat {
  id: number;
  name: string;
  is_active: boolean;
  clicks: string;
  conversions: string;
  payout: string;
}

interface ConversionRow {
  id: number;
  click_id: string | null;
  event: string;
  payout: string | null;
  status: string;
  created_at: string;
  capi_sent: boolean;
  capi_error: string | null;
  advertiser_name: string | null;
  advertiser_slug: string | null;
  offer_id: number | null;
  offer_name: string | null;
  media_buyer_id: number | null;
  media_buyer_name: string | null;
  publisher_id: number | null;
  publisher_name: string | null;
  pub_payout: string | null;
  pub_postback_url: string | null;
  pub_postback_sent: boolean;
  pub_postback_error: string | null;
}

interface Publisher {
  id: number;
  name: string;
  postback_url_template: string;
  payout: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
}

interface Offer {
  id: number;
  name: string;
  advertiser_id: number | null;
  advertiser_name: string | null;
  advertiser_slug: string | null;
  landing_url_template: string | null;
  postback_key: string;
  payout: string | null;
  currency: string;
  is_active: boolean;
  publisher_ids: number[];
  created_at: string;
}

interface OfferStat {
  id: number;
  name: string;
  is_active: boolean;
  clicks: string;
  conversions: string;
  payout: string;
}

interface PublisherStat {
  id: number;
  name: string;
  is_active: boolean;
  clicks: string;
  conversions: string;
  postbacks_sent: string;
  postbacks_failed: string;
  payout: string;
}

/* Outbound postback to the publisher who sent the click, if any. */
function PubPostbackCell({ row }: { row: ConversionRow }) {
  if (!row.publisher_name) return <span className="text-[12px] text-slate-300">—</span>;
  const state = row.pub_postback_sent ? 'sent' : row.pub_postback_error ? 'failed' : 'skipped';
  const map = {
    sent:    { label: 'Sent',          bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    failed:  { label: 'Failed',        bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
    skipped: { label: 'Not fired',     bg: '#FFFBEB', color: '#A16207', border: '#FEF08A' },
  } as const;
  const s = map[state];
  const title = state === 'failed'
    ? `${row.pub_postback_error}\n${row.pub_postback_url ?? ''}`
    : state === 'sent'
      ? row.pub_postback_url ?? undefined
      : 'Click had no ?sub= (publisher click id), or the publisher is inactive';
  return (
    <div>
      <span className="text-[11px] font-semibold text-slate-600 block">{row.publisher_name}</span>
      <span title={title} className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-block mt-0.5" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
        {s.label}{row.pub_payout ? ` · ₹${Number(row.pub_payout).toLocaleString('en-IN')}` : ''}
      </span>
    </div>
  );
}

/* CAPI delivery status for a conversion row: sent to Meta, attempted-but-rejected,
   or never attempted (no click_id match — usually a tracking link missing ?px=/?mb=). */
function capiState(row: ConversionRow): 'sent' | 'failed' | 'skipped' {
  if (row.capi_sent) return 'sent';
  if (row.capi_error) return 'failed';
  return 'skipped';
}

function CapiBadge({ row }: { row: ConversionRow }) {
  const state = capiState(row);
  const map = {
    sent:    { label: 'Sent',    bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    failed:  { label: 'Failed',  bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
    skipped: { label: !row.click_id ? 'No click_id' : 'No click match', bg: '#FFFBEB', color: '#A16207', border: '#FEF08A' },
  } as const;
  const s = map[state];
  const title = state === 'failed'
    ? row.capi_error ?? undefined
    : state === 'skipped'
      ? (row.click_id ? 'No matching click found for this click_id — check the tracking link had ?px= (and ?mb=) set' : 'Postback had no click_id, so nothing to match against')
      : undefined;
  return (
    <span title={title} className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

interface MediaBuyer {
  id: number;
  name: string;
  email: string | null;
  is_active: boolean;
  has_password: boolean;
  created_at: string;
}

/* ── Shared styles ──────────────────────────────────────── */
const inputCls  = 'w-full px-3 py-2 rounded-[8px] text-[12px] text-slate-800 bg-white border outline-none transition-all focus:ring-2 focus:ring-blue-200';
const inputStyle = { borderColor: '#CBD5E1' };
const labelCls  = 'text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-1';

const card = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/* ── Advertiser Form ─────────────────────────────────────── */
const EMPTY_ADVERTISER = { name: '', slug: '', landing_url_template: '', pubid: '', payout: '', currency: 'INR', is_active: true, regenerate_key: false };
type AdvertiserFormData = typeof EMPTY_ADVERTISER;

function AdvertiserForm({
  initial = EMPTY_ADVERTISER, isEdit = false, onSave, onCancel, saving,
}: {
  initial?: AdvertiserFormData;
  isEdit?: boolean;
  onSave: (data: AdvertiserFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof AdvertiserFormData, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const hasClickId = form.landing_url_template.includes('{click_id}');
  const canSave = form.name.trim().length > 0 && form.slug.trim().length > 0 && hasClickId;

  return (
    <div className="rounded-[14px] p-5 mb-4" style={{ ...card, background: '#F8FAFC', border: `1.5px solid ${isEdit ? BLUE_MD : '#E2E8F0'}` }}>
      <p className="text-[13px] font-bold text-slate-800 mb-4">{isEdit ? 'Edit advertiser' : 'Add advertiser'}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Slug (used in /go/) <span style={{ color: BLUE }}>*</span></label>
          <input value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="e.g. tikyetz-in5935" autoFocus={!isEdit} autoComplete="off"
            className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls}>Name <span style={{ color: BLUE }}>*</span></label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Tikyetz IN-5935" autoComplete="off"
            className={inputCls} style={inputStyle} />
        </div>
      </div>

      <div className="mb-3">
        <label className={labelCls}>
          Landing URL template <span style={{ color: BLUE }}>*</span>{' '}
          <span className="text-slate-300 font-normal normal-case tracking-normal">(macros: {'{click_id} {pubid} {ip}'})</span>
        </label>
        <input value={form.landing_url_template} onChange={(e) => set('landing_url_template', e.target.value)}
          placeholder="https://tikyetz.com/lp/IN-5935/?aff_sub={click_id}&pubid={pubid}"
          autoComplete="off" className={inputCls + ' font-mono'} style={inputStyle} />
        {form.landing_url_template.trim().length > 0 && !hasClickId && (
          <p className="text-[11px] text-red-500 font-semibold mt-1.5">
            Must contain the literal <code className="font-mono">{'{click_id}'}</code> placeholder — rename whatever macro your network uses (e.g. <code className="font-mono">{'{pixel}'}</code>, <code className="font-mono">{'{aff_sub}'}</code>) to exactly <code className="font-mono">{'{click_id}'}</code>, since that's what we substitute before redirecting.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className={labelCls}>Pubid <span className="text-slate-300 font-normal normal-case">(fills {'{pubid}'})</span></label>
          <input value={form.pubid} onChange={(e) => set('pubid', e.target.value)}
            placeholder="your advertiser id" autoComplete="off" className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls}>Default payout</label>
          <input value={form.payout} onChange={(e) => set('payout', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="e.g. 25" autoComplete="off" className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <input value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())}
            placeholder="INR" autoComplete="off" className={inputCls} style={inputStyle} />
        </div>
      </div>

      <div className="flex items-center gap-5 mb-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-3.5 h-3.5" />
          <span className="text-[12px] font-semibold text-slate-600">Active</span>
        </label>
        {isEdit && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.regenerate_key} onChange={(e) => set('regenerate_key', e.target.checked)} className="w-3.5 h-3.5" />
            <span className="text-[12px] font-semibold text-red-500">Regenerate postback key</span>
          </label>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => onSave(form)} disabled={saving || !canSave}
          className="px-4 py-2 rounded-[8px] text-[12px] font-bold text-white transition-all disabled:opacity-40"
          style={{ background: BLUE }}>
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-100"
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Copyable field ─────────────────────────────────────── */
function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <span title={label} className="text-[9px] font-bold uppercase tracking-wide text-slate-400 shrink-0 w-16 truncate">{label}</span>
        <code className="text-[10.5px] px-2 py-1 rounded-[6px] font-mono truncate max-w-xs sm:max-w-sm md:max-w-md select-all"
          style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE_MD}` }}>
          {value}
        </code>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          title="Copy"
          className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-[10px] font-bold shrink-0 transition-all"
          style={{
            background: copied ? '#F0FDF4' : BLUE_LT,
            color: copied ? '#15803D' : BLUE,
            border: `1px solid ${copied ? '#BBF7D0' : BLUE_MD}`,
          }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {hint && <p className="text-[9.5px] text-slate-400 mt-1 ml-[72px]">{hint}</p>}
    </div>
  );
}

/* ── Date Filter Bar ─────────────────────────────────────── */
function DateFilterBar({
  fromDate, toDate, allTime, onFromChange, onToChange, onAllTimeToggle, children,
}: {
  fromDate: string; toDate: string; allTime: boolean;
  onFromChange: (v: string) => void; onToChange: (v: string) => void; onAllTimeToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      <button onClick={onAllTimeToggle}
        className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold transition-all"
        style={{
          background: allTime ? '#EDE9FE' : '#F1F5F9',
          border: `1.5px solid ${allTime ? '#8B5CF6' : '#E2E8F0'}`,
          color: allTime ? '#6D28D9' : '#64748B',
        }}>
        All time
      </button>

      {(['from', 'to'] as const).map((side) => (
        <div key={side} className="relative flex items-center" style={{ opacity: allTime ? 0.4 : 1, transition: 'opacity .2s' }}>
          <svg className="absolute left-2.5 pointer-events-none" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <input type="date"
            value={side === 'from' ? fromDate : toDate}
            max={side === 'from' ? toDate : undefined}
            min={side === 'to' ? fromDate : undefined}
            disabled={allTime}
            onChange={(e) => side === 'from' ? onFromChange(e.target.value) : onToChange(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-[8px] text-[11px] font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-blue-200"
            style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', cursor: allTime ? 'not-allowed' : 'pointer' }}
          />
          {side === 'from' && <span className="mx-1.5 text-[11px] font-semibold text-slate-400">to</span>}
        </div>
      ))}

      {children}
    </div>
  );
}

/* ── Advertisers Panel ──────────────────────────────────── */
export function AdvertisersPanel() {
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate]     = useState(todayStr);
  const [allTime, setAllTime]   = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [byAdvertiser, setByAdvertiser] = useState<AdvertiserStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const [list, setList] = useState<Advertiser[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editAdv, setEditAdv]         = useState<Advertiser | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? '');

  const fetchStats = useCallback(async (from: string, to: string) => {
    setLoadingStats(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    const res = await fetch(`/api/admin/stats?${params}`);
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) { setOverview(json.overview); setByAdvertiser(json.by_advertiser); }
    setLoadingStats(false);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    const res = await fetch('/api/admin/advertisers');
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) setList(json.data);
    setListLoading(false);
  }, []);

  useEffect(() => {
    fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
  }, [fromDate, toDate, allTime, fetchStats]);
  useEffect(() => { fetchList(); }, [fetchList]);

  async function handleSave(form: AdvertiserFormData) {
    setSaving(true);
    const url    = editAdv ? `/api/admin/advertisers/${editAdv.id}` : '/api/admin/advertisers';
    const method = editAdv ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, payout: form.payout ? Number(form.payout) : null }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.success) {
      setShowForm(false); setEditAdv(null);
      fetchList(); fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
    } else { alert(json.message ?? 'Error saving advertiser'); }
  }

  async function handleDelete(id: number) {
    const res  = await fetch(`/api/admin/advertisers/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setDeleteConfirm(null); fetchList(); fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
    } else { alert(json.message ?? 'Delete failed'); }
  }

  const statCards = overview
    ? [
        { label: 'Clicks',      value: overview.total_clicks,      color: BLUE,     bg: BLUE_LT,   icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { label: 'Conversions', value: overview.total_conversions, color: '#15803D', bg: '#F0FDF4', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        { label: 'Payout',      value: `₹${Number(overview.total_payout).toLocaleString('en-IN')}`, color: '#A16207', bg: '#FEFCE8', icon: 'M12 8c-1.657 0-3 .672-3 1.5S10.343 11 12 11s3 .672 3 1.5-1.343 1.5-3 1.5m0-6c1.11 0 2.08.402 2.599 1M12 8V6m0 8v2m0-10a9 9 0 100 18 9 9 0 000-18z' },
        { label: 'Sent to Meta',  value: overview.capi_sent,    color: '#0EA5E9', bg: '#F0F9FF', icon: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' },
        { label: 'CAPI Failed',   value: overview.capi_failed,  color: '#DC2626', bg: '#FEF2F2', icon: 'M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 003.82 21h16.36a2 2 0 001.71-3.96L13.71 3.86a2 2 0 00-3.42 0z' },
        { label: 'No Click Match', value: overview.capi_skipped, color: '#A16207', bg: '#FFFBEB', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      ]
    : [];

  return (
    <div>
      <DateFilterBar
        fromDate={fromDate} toDate={toDate} allTime={allTime}
        onFromChange={setFromDate} onToChange={setToDate} onAllTimeToggle={() => setAllTime((p) => !p)}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {loadingStats
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[14px] px-4 py-4 animate-pulse bg-slate-100" style={{ height: 80 }} />
            ))
          : statCards.map((c) => (
              <div key={c.label} className="rounded-[14px] px-4 py-4 flex items-center gap-3" style={{ background: c.bg, border: `1px solid ${c.color}22` }}>
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: c.color + '18' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth={2} strokeLinecap="round"><path d={c.icon} /></svg>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[.15em] mb-0.5" style={{ color: c.color + 'AA' }}>{c.label}</p>
                  <p className="text-[22px] font-black leading-none" style={{ color: c.color }}>{c.value}</p>
                </div>
              </div>
            ))}
      </div>

      {!loadingStats && byAdvertiser.length > 0 && (
        <div className="rounded-[14px] overflow-hidden mb-6" style={card}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">By Advertiser</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                  {['Advertiser', 'Clicks', 'Conversions', 'CVR', 'Payout'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byAdvertiser.map((row) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Advertiser list / CRUD */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-slate-500">{list.length} advertiser{list.length !== 1 ? 's' : ''} configured</p>
        {!showForm && !editAdv && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12px] font-bold text-white shrink-0 transition-all hover:opacity-90"
            style={{ background: BLUE, boxShadow: `0 4px 14px -4px ${BLUE}88` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New advertiser
          </button>
        )}
      </div>

      {showForm && (
        <AdvertiserForm onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />
      )}

      {listLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 rounded-[12px] animate-pulse bg-slate-100" />)}
        </div>
      ) : list.length === 0 && !showForm ? (
        <p className="text-[13px] text-slate-400 py-6">No advertisers configured yet. Add one to get a tracking link.</p>
      ) : (
        <div className="space-y-2">
          {list.map((adv) => (
            <div key={adv.id}>
              {editAdv?.id === adv.id ? (
                <AdvertiserForm
                  initial={{
                    name: adv.name, slug: adv.slug, landing_url_template: adv.landing_url_template,
                    pubid: adv.pubid ?? '', payout: adv.payout ?? '', currency: adv.currency,
                    is_active: adv.is_active, regenerate_key: false,
                  }}
                  isEdit
                  onSave={handleSave}
                  onCancel={() => setEditAdv(null)}
                  saving={saving}
                />
              ) : (
                <div className="px-4 py-3.5 rounded-[12px] hover:shadow-sm transition-all" style={card}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-slate-800">{adv.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: adv.is_active ? '#F0FDF4' : '#F1F5F9', color: adv.is_active ? '#15803D' : '#64748B', border: `1px solid ${adv.is_active ? '#BBF7D0' : '#E2E8F0'}` }}>
                          {adv.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>{adv.slug}</span>
                        {adv.payout && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FEFCE8', color: '#A16207', border: '1px solid #FEF08A' }}>₹{adv.payout} / {adv.currency}</span>}
                      </div>

                      <CopyField label="Send traffic" value={`${baseUrl}/go/${adv.slug}`} hint="Point your ads here. Add ?mb=xyz to tag which media buyer sent the click." />
                      <CopyField label="Postback" value={`${baseUrl}/api/postback/${adv.slug}?key=${adv.postback_key}&click_id=YOUR_SUBID_MACRO&payout=YOUR_AMOUNT_MACRO`} hint="Give this to the advertiser. Replace the *_MACRO placeholders with their sub-id/payout macros for their postback settings." />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {deleteConfirm === adv.id ? (
                        <>
                          <span className="text-[11px] text-slate-500">Delete?</span>
                          <button onClick={() => setDeleteConfirm(null)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-slate-500" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>No</button>
                          <button onClick={() => handleDelete(adv.id)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-white" style={{ background: '#DC2626' }}>Yes</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditAdv(adv); setShowForm(false); setDeleteConfirm(null); }}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>Edit</button>
                          <button onClick={() => setDeleteConfirm(adv.id)}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold transition-colors"
                            style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Publisher Form ──────────────────────────────────────── */
const EMPTY_PUBLISHER = { name: '', postback_url_template: '', payout: '', currency: 'INR', is_active: true };
type PublisherFormData = typeof EMPTY_PUBLISHER;

function PublisherForm({
  initial = EMPTY_PUBLISHER, isEdit = false, onSave, onCancel, saving,
}: {
  initial?: PublisherFormData;
  isEdit?: boolean;
  onSave: (data: PublisherFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof PublisherFormData, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const url = form.postback_url_template.trim();
  const hasClickId = url.includes('{click_id}');
  const isHttp = /^https?:\/\//i.test(url);
  const canSave = form.name.trim().length > 0 && hasClickId && isHttp;

  return (
    <div className="rounded-[14px] p-5 mb-4" style={{ ...card, background: '#F8FAFC', border: `1.5px solid ${isEdit ? BLUE_MD : '#E2E8F0'}` }}>
      <p className="text-[13px] font-bold text-slate-800 mb-4">{isEdit ? 'Edit publisher' : 'Add publisher'}</p>

      <div className="mb-3">
        <label className={labelCls}>Name <span style={{ color: BLUE }}>*</span></label>
        <input value={form.name} onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. AdsNetwork Pvt Ltd" autoFocus={!isEdit} autoComplete="off"
          className={inputCls} style={inputStyle} />
      </div>

      <div className="mb-3">
        <label className={labelCls}>
          Publisher&apos;s postback URL <span style={{ color: BLUE }}>*</span>{' '}
          <span className="text-slate-300 font-normal normal-case tracking-normal">(macros: {'{click_id} {payout} {currency} {event} {txn_id}'})</span>
        </label>
        <input value={form.postback_url_template} onChange={(e) => set('postback_url_template', e.target.value)}
          placeholder="https://their-tracker.com/postback?clickid={click_id}&payout={payout}"
          autoComplete="off" className={inputCls + ' font-mono'} style={inputStyle} />
        {url.length > 0 && (!isHttp || !hasClickId) && (
          <p className="text-[11px] text-red-500 font-semibold mt-1.5">
            {!isHttp
              ? 'Must start with http:// or https://'
              : <>Must contain the literal <code className="font-mono">{'{click_id}'}</code> placeholder — replace whatever macro the publisher&apos;s tracker uses for their click id with exactly <code className="font-mono">{'{click_id}'}</code>; we fill it with the <code className="font-mono">sub</code> they sent on the click.</>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className={labelCls}>Payout to publisher <span className="text-slate-300 font-normal normal-case">(fills {'{payout}'})</span></label>
          <input value={form.payout} onChange={(e) => set('payout', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="blank = offer / advertiser payout" autoComplete="off" className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <input value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())}
            placeholder="INR" autoComplete="off" className={inputCls} style={inputStyle} />
        </div>
      </div>

      <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
        <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-3.5 h-3.5" />
        <span className="text-[12px] font-semibold text-slate-600">Active</span>
      </label>

      <div className="flex items-center gap-2">
        <button onClick={() => onSave(form)} disabled={saving || !canSave}
          className="px-4 py-2 rounded-[8px] text-[12px] font-bold text-white transition-all disabled:opacity-40"
          style={{ background: BLUE }}>
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-100"
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* A publisher's tracking links — one per offer they're assigned to. */
function PublisherOfferLinks({ publisher, offers, baseUrl }: { publisher: Publisher; offers: Offer[]; baseUrl: string }) {
  const assigned = offers.filter((o) => o.publisher_ids.includes(publisher.id));

  if (assigned.length === 0) {
    return <p className="text-[10.5px] text-slate-400 mt-2">No offers assigned yet — assign this publisher on the Offers page to get a tracking link.</p>;
  }

  return (
    <div className="mt-1">
      {assigned.map((o) => (
        <CopyField key={o.id} label={o.is_active ? o.name : `${o.name} (off)`}
          value={`${baseUrl}/o/${o.id}?pub=${publisher.id}&sub=THEIR_CLICK_ID_MACRO`} />
      ))}
      <p className="text-[9.5px] text-slate-400 mt-1 ml-[72px]">Give these to the publisher. They replace THEIR_CLICK_ID_MACRO with their tracker&apos;s click-id macro — we echo it back as {'{click_id}'} in their postback.</p>
    </div>
  );
}

/* ── Publishers Panel ───────────────────────────────────── */
export function PublishersPanel() {
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate]     = useState(todayStr);
  const [allTime, setAllTime]   = useState(true);
  const [byPublisher, setByPublisher] = useState<PublisherStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const [list, setList] = useState<Publisher[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editPub, setEditPub]         = useState<Publisher | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [testing, setTesting]         = useState<number | null>(null);
  const [testResult, setTestResult]   = useState<{ id: number; ok: boolean; message: string; url?: string } | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? '');

  const fetchStats = useCallback(async (from: string, to: string) => {
    setLoadingStats(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    const res = await fetch(`/api/admin/stats?${params}`);
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) setByPublisher(json.by_publisher);
    setLoadingStats(false);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    const res = await fetch('/api/admin/publishers');
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) setList(json.data);
    setListLoading(false);
  }, []);

  useEffect(() => {
    fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
  }, [fromDate, toDate, allTime, fetchStats]);
  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => {
    fetch('/api/admin/offers').then((r) => r.json()).then((json) => { if (json.success) setOffers(json.data); }).catch(() => {});
  }, []);

  async function handleSave(form: PublisherFormData) {
    setSaving(true);
    const url    = editPub ? `/api/admin/publishers/${editPub.id}` : '/api/admin/publishers';
    const method = editPub ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, payout: form.payout ? Number(form.payout) : null }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.success) {
      setShowForm(false); setEditPub(null);
      fetchList(); fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
    } else { alert(json.message ?? 'Error saving publisher'); }
  }

  async function handleDelete(id: number) {
    const res  = await fetch(`/api/admin/publishers/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setDeleteConfirm(null); fetchList(); fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
    } else { alert(json.message ?? 'Delete failed'); }
  }

  async function handleTest(id: number) {
    setTesting(id); setTestResult(null);
    const res  = await fetch(`/api/admin/publishers/${id}`, { method: 'POST' });
    const json = await res.json();
    setTesting(null);
    setTestResult({ id, ok: !!json.success, message: json.message ?? (json.success ? 'OK' : 'Failed'), url: json.url });
  }

  return (
    <div>
      <DateFilterBar
        fromDate={fromDate} toDate={toDate} allTime={allTime}
        onFromChange={setFromDate} onToChange={setToDate} onAllTimeToggle={() => setAllTime((p) => !p)}
      />

      {!loadingStats && byPublisher.length > 0 && (
        <div className="rounded-[14px] overflow-hidden mb-6" style={card}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">By Publisher</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                  {['Publisher', 'Clicks', 'Conversions', 'CVR', 'Postbacks sent', 'Failed', 'Payout'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byPublisher.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50 transition-colors" style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-bold text-slate-800 block">{row.name}</span>
                      {!row.is_active && <span className="text-[9px] text-slate-400 block mt-0.5">Inactive</span>}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-black text-slate-800">{row.clicks}</td>
                    <td className="px-4 py-3 text-[12px] font-bold text-blue-600">{row.conversions}</td>
                    <td className="px-4 py-3 text-[12px] text-slate-500">
                      {Number(row.clicks) > 0 ? `${((Number(row.conversions) / Number(row.clicks)) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-bold text-green-700">{row.postbacks_sent}</td>
                    <td className="px-4 py-3 text-[12px] font-bold" style={{ color: Number(row.postbacks_failed) > 0 ? '#B91C1C' : '#94A3B8' }}>{row.postbacks_failed}</td>
                    <td className="px-4 py-3 text-[12px] font-bold text-amber-700">₹{Number(row.payout).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-slate-500">{list.length} publisher{list.length !== 1 ? 's' : ''} configured</p>
        {!showForm && !editPub && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12px] font-bold text-white shrink-0 transition-all hover:opacity-90"
            style={{ background: BLUE, boxShadow: `0 4px 14px -4px ${BLUE}88` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New publisher
          </button>
        )}
      </div>

      {showForm && <PublisherForm onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />}

      {listLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 rounded-[12px] animate-pulse bg-slate-100" />)}
        </div>
      ) : list.length === 0 && !showForm ? (
        <p className="text-[13px] text-slate-400 py-6">No publishers yet. Add one with their postback URL, then assign them offers.</p>
      ) : (
        <div className="space-y-2">
          {list.map((pub) => (
            <div key={pub.id}>
              {editPub?.id === pub.id ? (
                <PublisherForm
                  initial={{
                    name: pub.name, postback_url_template: pub.postback_url_template,
                    payout: pub.payout ?? '', currency: pub.currency, is_active: pub.is_active,
                  }}
                  isEdit onSave={handleSave} onCancel={() => setEditPub(null)} saving={saving}
                />
              ) : (
                <div className="px-4 py-3.5 rounded-[12px] hover:shadow-sm transition-all" style={card}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-slate-800">{pub.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: pub.is_active ? '#F0FDF4' : '#F1F5F9', color: pub.is_active ? '#15803D' : '#64748B', border: `1px solid ${pub.is_active ? '#BBF7D0' : '#E2E8F0'}` }}>
                          {pub.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE_MD}` }}>pub: {pub.id}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FEFCE8', color: '#A16207', border: '1px solid #FEF08A' }}>
                          {pub.payout ? `₹${pub.payout} / ${pub.currency}` : 'Payout: per offer'}
                        </span>
                      </div>

                      <PublisherOfferLinks publisher={pub} offers={offers} baseUrl={baseUrl} />
                      <CopyField label="Their postback" value={pub.postback_url_template} hint="We fire this (GET) when one of their clicks converts, with the macros filled in." />

                      {testResult?.id === pub.id && (
                        <p className="text-[10.5px] font-semibold mt-2 break-all" style={{ color: testResult.ok ? '#15803D' : '#B91C1C' }}>
                          Test {testResult.ok ? 'OK' : 'failed'}: {testResult.message}{testResult.url ? ` — ${testResult.url}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {deleteConfirm === pub.id ? (
                        <>
                          <span className="text-[11px] text-slate-500">Delete?</span>
                          <button onClick={() => setDeleteConfirm(null)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-slate-500" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>No</button>
                          <button onClick={() => handleDelete(pub.id)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-white" style={{ background: '#DC2626' }}>Yes</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleTest(pub.id)} disabled={testing === pub.id}
                            title="Fire their postback once with click_id=TEST_CLICK_ID"
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold transition-colors disabled:opacity-50"
                            style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE_MD}` }}>
                            {testing === pub.id ? 'Testing…' : 'Test'}
                          </button>
                          <button onClick={() => { setEditPub(pub); setShowForm(false); setDeleteConfirm(null); }}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>Edit</button>
                          <button onClick={() => setDeleteConfirm(pub.id)}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold transition-colors"
                            style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Offer Form ──────────────────────────────────────────── */
const EMPTY_OFFER = {
  name: '', source: 'advertiser' as 'advertiser' | 'own', advertiser_id: '', landing_url_template: '',
  payout: '', currency: 'INR', is_active: true, publisher_ids: [] as number[], regenerate_key: false,
};
type OfferFormData = typeof EMPTY_OFFER;

function OfferForm({
  initial = EMPTY_OFFER, isEdit = false, advertisers, publishers, onSave, onCancel, saving,
}: {
  initial?: OfferFormData;
  isEdit?: boolean;
  advertisers: Advertiser[];
  publishers: Publisher[];
  onSave: (data: OfferFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof OfferFormData>(k: K, v: OfferFormData[K]) => setForm((f) => ({ ...f, [k]: v }));
  const landing = form.landing_url_template.trim();
  const landingOk = /^https?:\/\//i.test(landing) && landing.includes('{click_id}');
  const sourceOk = form.source === 'advertiser' ? !!form.advertiser_id : landingOk;
  const canSave = form.name.trim().length > 0 && sourceOk;

  function togglePublisher(id: number) {
    set('publisher_ids', form.publisher_ids.includes(id) ? form.publisher_ids.filter((p) => p !== id) : [...form.publisher_ids, id]);
  }

  return (
    <div className="rounded-[14px] p-5 mb-4" style={{ ...card, background: '#F8FAFC', border: `1.5px solid ${isEdit ? BLUE_MD : '#E2E8F0'}` }}>
      <p className="text-[13px] font-bold text-slate-800 mb-4">{isEdit ? 'Edit offer' : 'Add offer'}</p>

      <div className="mb-3">
        <label className={labelCls}>Offer name <span style={{ color: BLUE }}>*</span></label>
        <input value={form.name} onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Loan IN – CPA" autoFocus={!isEdit} autoComplete="off"
          className={inputCls} style={inputStyle} />
      </div>

      <div className="mb-3">
        <label className={labelCls}>Traffic goes to</label>
        <div className="flex items-center gap-2">
          {([['advertiser', 'An advertiser'], ['own', 'Our own landing URL']] as const).map(([val, label]) => (
            <button key={val} type="button" onClick={() => set('source', val)}
              className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold transition-all"
              style={{
                background: form.source === val ? BLUE_LT : '#FFFFFF',
                border: `1.5px solid ${form.source === val ? BLUE : '#E2E8F0'}`,
                color: form.source === val ? BLUE : '#64748B',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {form.source === 'advertiser' ? (
        <div className="mb-3">
          <label className={labelCls}>Advertiser <span style={{ color: BLUE }}>*</span></label>
          <select value={form.advertiser_id} onChange={(e) => set('advertiser_id', e.target.value)}
            className={inputCls} style={inputStyle}>
            <option value="">Select advertiser…</option>
            {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_active ? '' : ' (inactive)'}</option>)}
          </select>
          <p className="text-[10.5px] text-slate-400 mt-1">Clicks go to the advertiser&apos;s landing page; the conversion comes back on the advertiser&apos;s postback as usual.</p>
        </div>
      ) : (
        <div className="mb-3">
          <label className={labelCls}>
            Landing URL template <span style={{ color: BLUE }}>*</span>{' '}
            <span className="text-slate-300 font-normal normal-case tracking-normal">(macros: {'{click_id} {ip}'})</span>
          </label>
          <input value={form.landing_url_template} onChange={(e) => set('landing_url_template', e.target.value)}
            placeholder="https://our-site.com/offer?cid={click_id}"
            autoComplete="off" className={inputCls + ' font-mono'} style={inputStyle} />
          {landing.length > 0 && !landingOk && (
            <p className="text-[11px] text-red-500 font-semibold mt-1.5">Must start with http(s):// and contain the literal <code className="font-mono">{'{click_id}'}</code> placeholder.</p>
          )}
          <p className="text-[10.5px] text-slate-400 mt-1">After saving, you get this offer&apos;s own postback URL — fire it from your landing page when a sale happens.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Payout to publisher</label>
          <input value={form.payout} onChange={(e) => set('payout', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="blank = publisher's payout / pass-through" autoComplete="off" className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <input value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())}
            placeholder="INR" autoComplete="off" className={inputCls} style={inputStyle} />
        </div>
      </div>

      <div className="mb-4">
        <label className={labelCls}>Publishers allowed to run this offer</label>
        {publishers.length === 0 ? (
          <p className="text-[11px] text-slate-400">No publishers yet — add them on the Publishers page.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {publishers.map((p) => {
              const on = form.publisher_ids.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => togglePublisher(p.id)}
                  className="px-2.5 py-1 rounded-[8px] text-[11px] font-semibold transition-all"
                  style={{
                    background: on ? BLUE : '#FFFFFF',
                    border: `1.5px solid ${on ? BLUE : '#E2E8F0'}`,
                    color: on ? '#FFFFFF' : '#64748B',
                  }}>
                  {on ? '✓ ' : ''}{p.name}{p.is_active ? '' : ' (inactive)'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-5 mb-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-3.5 h-3.5" />
          <span className="text-[12px] font-semibold text-slate-600">Active</span>
        </label>
        {isEdit && form.source === 'own' && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.regenerate_key} onChange={(e) => set('regenerate_key', e.target.checked)} className="w-3.5 h-3.5" />
            <span className="text-[12px] font-semibold text-red-500">Regenerate postback key</span>
          </label>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => onSave(form)} disabled={saving || !canSave}
          className="px-4 py-2 rounded-[8px] text-[12px] font-bold text-white transition-all disabled:opacity-40"
          style={{ background: BLUE }}>
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-100"
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Offers Panel ───────────────────────────────────────── */
export function OffersPanel() {
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate]     = useState(todayStr);
  const [allTime, setAllTime]   = useState(true);
  const [byOffer, setByOffer]   = useState<OfferStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const [list, setList] = useState<Offer[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [publishers, setPublishers]   = useState<Publisher[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editOffer, setEditOffer]     = useState<Offer | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? '');

  const fetchStats = useCallback(async (from: string, to: string) => {
    setLoadingStats(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    const res = await fetch(`/api/admin/stats?${params}`);
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) setByOffer(json.by_offer);
    setLoadingStats(false);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    const res = await fetch('/api/admin/offers');
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) setList(json.data);
    setListLoading(false);
  }, []);

  useEffect(() => {
    fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
  }, [fromDate, toDate, allTime, fetchStats]);
  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => {
    fetch('/api/admin/advertisers').then((r) => r.json()).then((json) => { if (json.success) setAdvertisers(json.data); }).catch(() => {});
    fetch('/api/admin/publishers').then((r) => r.json()).then((json) => { if (json.success) setPublishers(json.data); }).catch(() => {});
  }, []);

  async function handleSave(form: OfferFormData) {
    setSaving(true);
    const url    = editOffer ? `/api/admin/offers/${editOffer.id}` : '/api/admin/offers';
    const method = editOffer ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        advertiser_id: form.source === 'advertiser' ? Number(form.advertiser_id) : null,
        landing_url_template: form.source === 'own' ? form.landing_url_template : null,
        payout: form.payout ? Number(form.payout) : null,
        currency: form.currency,
        is_active: form.is_active,
        publisher_ids: form.publisher_ids,
        regenerate_key: form.regenerate_key,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.success) {
      setShowForm(false); setEditOffer(null);
      fetchList(); fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
    } else { alert(json.message ?? 'Error saving offer'); }
  }

  async function handleDelete(id: number) {
    const res  = await fetch(`/api/admin/offers/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setDeleteConfirm(null); fetchList(); fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
    } else { alert(json.message ?? 'Delete failed'); }
  }

  const pubName = (id: number) => publishers.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <div>
      <DateFilterBar
        fromDate={fromDate} toDate={toDate} allTime={allTime}
        onFromChange={setFromDate} onToChange={setToDate} onAllTimeToggle={() => setAllTime((p) => !p)}
      />

      {!loadingStats && byOffer.length > 0 && (
        <div className="rounded-[14px] overflow-hidden mb-6" style={card}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">By Offer</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                  {['Offer', 'Clicks', 'Conversions', 'CVR', 'Publisher payout'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byOffer.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50 transition-colors" style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-bold text-slate-800 block">{row.name}</span>
                      {!row.is_active && <span className="text-[9px] text-slate-400 block mt-0.5">Inactive</span>}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-black text-slate-800">{row.clicks}</td>
                    <td className="px-4 py-3 text-[12px] font-bold text-blue-600">{row.conversions}</td>
                    <td className="px-4 py-3 text-[12px] text-slate-500">
                      {Number(row.clicks) > 0 ? `${((Number(row.conversions) / Number(row.clicks)) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-bold text-amber-700">₹{Number(row.payout).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-slate-500">{list.length} offer{list.length !== 1 ? 's' : ''} configured</p>
        {!showForm && !editOffer && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12px] font-bold text-white shrink-0 transition-all hover:opacity-90"
            style={{ background: BLUE, boxShadow: `0 4px 14px -4px ${BLUE}88` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New offer
          </button>
        )}
      </div>

      {showForm && (
        <OfferForm advertisers={advertisers} publishers={publishers}
          onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />
      )}

      {listLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 rounded-[12px] animate-pulse bg-slate-100" />)}
        </div>
      ) : list.length === 0 && !showForm ? (
        <p className="text-[13px] text-slate-400 py-6">No offers yet. Create one and assign publishers to give them tracking links.</p>
      ) : (
        <div className="space-y-2">
          {list.map((offer) => (
            <div key={offer.id}>
              {editOffer?.id === offer.id ? (
                <OfferForm
                  initial={{
                    name: offer.name,
                    source: offer.advertiser_id ? 'advertiser' : 'own',
                    advertiser_id: offer.advertiser_id ? String(offer.advertiser_id) : '',
                    landing_url_template: offer.landing_url_template ?? '',
                    payout: offer.payout ?? '', currency: offer.currency, is_active: offer.is_active,
                    publisher_ids: offer.publisher_ids, regenerate_key: false,
                  }}
                  isEdit advertisers={advertisers} publishers={publishers}
                  onSave={handleSave} onCancel={() => setEditOffer(null)} saving={saving}
                />
              ) : (
                <div className="px-4 py-3.5 rounded-[12px] hover:shadow-sm transition-all" style={card}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-slate-800">{offer.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: offer.is_active ? '#F0FDF4' : '#F1F5F9', color: offer.is_active ? '#15803D' : '#64748B', border: `1px solid ${offer.is_active ? '#BBF7D0' : '#E2E8F0'}` }}>
                          {offer.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE_MD}` }}>offer: {offer.id}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
                          {offer.advertiser_id ? `→ ${offer.advertiser_name}` : '→ own landing'}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FEFCE8', color: '#A16207', border: '1px solid #FEF08A' }}>
                          {offer.payout ? `₹${offer.payout} / ${offer.currency}` : 'Payout: per publisher'}
                        </span>
                      </div>

                      {!offer.advertiser_id && (
                        <CopyField label="Postback" value={`${baseUrl}/api/offer-postback/${offer.id}?key=${offer.postback_key}&click_id=YOUR_CLICK_ID_MACRO&payout=YOUR_AMOUNT_MACRO`}
                          hint="Fire this from your landing page when a sale happens — click_id is the {click_id} we put in the landing URL." />
                      )}

                      {offer.publisher_ids.length === 0 ? (
                        <p className="text-[10.5px] text-slate-400 mt-2">No publishers assigned — click Edit to allow publishers to run this offer.</p>
                      ) : (
                        offer.publisher_ids.map((pid) => (
                          <CopyField key={pid} label={pubName(pid)} value={`${baseUrl}/o/${offer.id}?pub=${pid}&sub=THEIR_CLICK_ID_MACRO`} />
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {deleteConfirm === offer.id ? (
                        <>
                          <span className="text-[11px] text-slate-500">Delete?</span>
                          <button onClick={() => setDeleteConfirm(null)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-slate-500" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>No</button>
                          <button onClick={() => handleDelete(offer.id)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-white" style={{ background: '#DC2626' }}>Yes</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditOffer(offer); setShowForm(false); setDeleteConfirm(null); }}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>Edit</button>
                          <button onClick={() => setDeleteConfirm(offer.id)}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold transition-colors"
                            style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Media Buyer Form ────────────────────────────────────── */
const EMPTY_MB = { name: '', email: '', password: '', is_active: true };
type MBForm = typeof EMPTY_MB;

function MediaBuyerForm({
  initial = EMPTY_MB, isEdit = false, onSave, onCancel, saving,
}: {
  initial?: MBForm; isEdit?: boolean; onSave: (f: MBForm) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof MBForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = form.name.trim().length > 0;

  return (
    <div className="rounded-[14px] p-5 mb-4" style={{ ...card, background: '#F8FAFC', border: `1.5px solid ${isEdit ? BLUE_MD : '#E2E8F0'}` }}>
      <p className="text-[13px] font-bold text-slate-800 mb-4">{isEdit ? 'Edit media buyer' : 'Add media buyer'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Name <span style={{ color: BLUE }}>*</span></label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Rahul" className={inputCls} style={inputStyle} autoFocus={!isEdit} />
        </div>
        <div>
          <label className={labelCls}>Email <span className="text-slate-300 font-normal normal-case">(login id)</span></label>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="rahul@example.com" className={inputCls} style={inputStyle} />
        </div>
      </div>
      <div className="mb-4">
        <label className={labelCls}>Password <span className="text-slate-300 font-normal normal-case">{isEdit ? '(leave blank to keep unchanged)' : ''}</span></label>
        <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="••••••••" className={inputCls} style={inputStyle} />
      </div>
      <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
        <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-3.5 h-3.5" />
        <span className="text-[12px] font-semibold text-slate-600">Active</span>
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

/* ── Media Buyers Panel ──────────────────────────────────── */
export function MediaBuyersPanel() {
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate]     = useState(todayStr);
  const [allTime, setAllTime]   = useState(true);
  const [list, setList] = useState<MediaBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editMb, setEditMb] = useState<MediaBuyer | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [byMediaBuyer, setByMediaBuyer] = useState<MediaBuyerStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/mediabuyers');
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) setList(json.data);
    setLoading(false);
  }, []);

  const fetchStats = useCallback(async (from: string, to: string) => {
    setLoadingStats(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    const res = await fetch(`/api/admin/stats?${params}`);
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) setByMediaBuyer(json.by_media_buyer);
    setLoadingStats(false);
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => {
    fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate);
  }, [fromDate, toDate, allTime, fetchStats]);

  async function handleSave(form: MBForm) {
    setSaving(true);
    const url = editMb ? `/api/admin/mediabuyers/${editMb.id}` : '/api/admin/mediabuyers';
    const method = editMb ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const json = await res.json();
    setSaving(false);
    if (json.success) { setShowForm(false); setEditMb(null); fetchList(); } else { alert(json.message ?? 'Error saving media buyer'); }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/admin/mediabuyers/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { setDeleteConfirm(null); fetchList(); } else { alert(json.message ?? 'Delete failed'); }
  }

  return (
    <div>
      <DateFilterBar
        fromDate={fromDate} toDate={toDate} allTime={allTime}
        onFromChange={setFromDate} onToChange={setToDate} onAllTimeToggle={() => setAllTime((p) => !p)}
      />

      {!loadingStats && byMediaBuyer.length > 0 && (
        <div className="rounded-[14px] overflow-hidden mb-6" style={card}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">By Media Buyer</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                  {['Media Buyer', 'Clicks', 'Conversions', 'CVR', 'Payout'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byMediaBuyer.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50 transition-colors" style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-bold text-slate-800 block">{row.name}</span>
                      {!row.is_active && <span className="text-[9px] text-slate-400 block mt-0.5">Inactive</span>}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-black text-slate-800">{row.clicks}</td>
                    <td className="px-4 py-3 text-[12px] font-bold text-blue-600">{row.conversions}</td>
                    <td className="px-4 py-3 text-[12px] text-slate-500">
                      {Number(row.clicks) > 0 ? `${((Number(row.conversions) / Number(row.clicks)) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-bold text-amber-700">₹{Number(row.payout).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-slate-500">{list.length} media buyer{list.length !== 1 ? 's' : ''}</p>
        {!showForm && !editMb && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12px] font-bold text-white shrink-0 transition-all hover:opacity-90"
            style={{ background: BLUE, boxShadow: `0 4px 14px -4px ${BLUE}88` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New media buyer
          </button>
        )}
      </div>

      {showForm && <MediaBuyerForm onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 rounded-[12px] animate-pulse bg-slate-100" />)}</div>
      ) : list.length === 0 && !showForm ? (
        <p className="text-[13px] text-slate-400 py-6">No media buyers yet. Add one so they can log in and get their own tracking link.</p>
      ) : (
        <div className="space-y-2">
          {list.map((mb) => (
            <div key={mb.id}>
              {editMb?.id === mb.id ? (
                <MediaBuyerForm
                  initial={{ name: mb.name, email: mb.email ?? '', password: '', is_active: mb.is_active }}
                  isEdit onSave={handleSave} onCancel={() => setEditMb(null)} saving={saving}
                />
              ) : (
                <div className="flex items-center justify-between px-4 py-3.5 rounded-[12px] hover:shadow-sm transition-all" style={card}>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-slate-800">{mb.name}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: mb.is_active ? '#F0FDF4' : '#F1F5F9', color: mb.is_active ? '#15803D' : '#64748B', border: `1px solid ${mb.is_active ? '#BBF7D0' : '#E2E8F0'}` }}>
                        {mb.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE_MD}` }}>id: {mb.id}</span>
                      {!mb.has_password && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>No password set</span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">{mb.email || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {deleteConfirm === mb.id ? (
                      <>
                        <span className="text-[11px] text-slate-500">Delete?</span>
                        <button onClick={() => setDeleteConfirm(null)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-slate-500" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>No</button>
                        <button onClick={() => handleDelete(mb.id)} className="px-2.5 py-1 rounded-[6px] text-[11px] font-bold text-white" style={{ background: '#DC2626' }}>Yes</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditMb(mb); setShowForm(false); }} className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold text-slate-600 hover:bg-slate-100" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>Edit</button>
                        <button onClick={() => setDeleteConfirm(mb.id)} className="px-3 py-1.5 rounded-[8px] text-[11px] font-bold" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Conversions Panel ──────────────────────────────────── */
export function ConversionsPanel() {
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate]     = useState(todayStr);
  const [allTime, setAllTime]   = useState(true);
  const [mbFilter, setMbFilter] = useState('');
  const [search, setSearch]     = useState('');
  const [capiFilter, setCapiFilter] = useState<'' | 'sent' | 'failed' | 'skipped'>('');
  const [mediaBuyers, setMediaBuyers] = useState<MediaBuyer[]>([]);
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const fetchData = useCallback(async (pg: number, from: string, to: string, mb: string, s: string, capi: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pg) });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    if (mb)   params.set('media_buyer_id', mb);
    if (s)    params.set('search', s);
    if (capi) params.set('capi', capi);
    const res = await fetch(`/api/admin/conversions?${params}`);
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) { setRows(json.data); setTotal(json.total); setTotalPages(json.totalPages); }
    setLoading(false);
  }, []);

  const fetchStats = useCallback(async (from: string, to: string, mb: string) => {
    setLoadingStats(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    if (mb)   params.set('media_buyer_id', mb);
    const res = await fetch(`/api/admin/stats?${params}`);
    if (res.status === 401) { adminLogout(); return; }
    const json = await res.json();
    if (json.success) setOverview(json.overview);
    setLoadingStats(false);
  }, []);

  useEffect(() => {
    fetchData(page, allTime ? '' : fromDate, allTime ? '' : toDate, mbFilter, search, capiFilter);
  }, [page, fromDate, toDate, allTime, mbFilter, search, capiFilter, fetchData]);

  useEffect(() => {
    fetchStats(allTime ? '' : fromDate, allTime ? '' : toDate, mbFilter);
  }, [fromDate, toDate, allTime, mbFilter, fetchStats]);

  useEffect(() => {
    fetch('/api/admin/mediabuyers').then((r) => r.json()).then((json) => { if (json.success) setMediaBuyers(json.data); }).catch(() => {});
  }, []);

  const capiCards = overview
    ? [
        { key: '' as const,        label: 'Postbacks',   value: overview.total_conversions, color: '#334155', bg: '#F8FAFC' },
        { key: 'sent' as const,    label: 'Sent to Meta', value: overview.capi_sent,         color: '#15803D', bg: '#F0FDF4' },
        { key: 'failed' as const,  label: 'Failed',        value: overview.capi_failed,       color: '#B91C1C', bg: '#FEF2F2' },
        { key: 'skipped' as const, label: 'No click match', value: overview.capi_skipped,    color: '#A16207', bg: '#FFFBEB' },
      ]
    : [];

  return (
    <div>
      {/* CAPI delivery stat cards — how many postbacks actually reached Meta.
          Click a card to filter the table below to that bucket. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {loadingStats
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-[14px] px-4 py-4 animate-pulse bg-slate-100" style={{ height: 72 }} />
            ))
          : capiCards.map((c) => (
              <button key={c.label} onClick={() => { setCapiFilter(c.key); setPage(1); }}
                className="rounded-[14px] px-4 py-3.5 text-left transition-all"
                style={{ background: c.bg, border: `1.5px solid ${capiFilter === c.key ? c.color : c.color + '22'}` }}>
                <p className="text-[9px] font-bold uppercase tracking-[.15em] mb-0.5" style={{ color: c.color + 'AA' }}>{c.label}</p>
                <p className="text-[20px] font-black leading-none" style={{ color: c.color }}>{c.value}</p>
              </button>
            ))}
      </div>

      <DateFilterBar
        fromDate={fromDate} toDate={toDate} allTime={allTime}
        onFromChange={(v) => { setFromDate(v); setPage(1); }}
        onToChange={(v) => { setToDate(v); setPage(1); }}
        onAllTimeToggle={() => { setAllTime((p) => !p); setPage(1); }}
      >
        <select value={mbFilter} onChange={(e) => { setMbFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-[8px] text-[11px] font-semibold outline-none focus:ring-2 focus:ring-blue-200"
          style={{
            background: mbFilter ? BLUE_LT : '#F8FAFC',
            border: `1.5px solid ${mbFilter ? BLUE : '#E2E8F0'}`,
            color: '#334155',
          }}>
          <option value="">All media buyers</option>
          {mediaBuyers.map((mb) => <option key={mb.id} value={mb.id}>{mb.name}</option>)}
        </select>

        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search advertiser / offer…"
            autoComplete="off"
            className="pl-7 pr-3 py-1.5 rounded-[8px] text-[11px] font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            style={{
              background: search ? BLUE_LT : '#F8FAFC',
              border: `1.5px solid ${search ? BLUE : '#E2E8F0'}`,
              color: '#334155',
              width: 175,
            }}
          />
        </div>

        {(mbFilter || search || capiFilter) && (
          <button onClick={() => { setMbFilter(''); setSearch(''); setCapiFilter(''); setPage(1); }}
            className="px-2.5 py-1.5 rounded-[8px] text-[11px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
            style={{ border: '1.5px solid #E2E8F0' }}>
            Clear
          </button>
        )}
      </DateFilterBar>

      <div className="rounded-[18px] overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">Postbacks received</p>
          <span className="text-[11px] text-slate-400">{total} total · Page {page}/{totalPages}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1040px]">
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                {['Advertiser / Offer', 'Media Buyer', 'Publisher', 'Click ID', 'Event', 'Payout', 'Status', 'Meta CAPI', 'Date & Time'].map((h) => (
                  <th key={h} className="px-5 py-3 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    {[110, 100, 100, 140, 80, 60, 70, 70, 130].map((w, j) => (
                      <td key={j} className="px-5 py-3.5"><div className="h-4 rounded-lg animate-pulse bg-slate-100" style={{ width: w }} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-[13px] text-slate-400">No postbacks found</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td className="px-5 py-3.5">
                      <span className="text-[12px] font-bold text-slate-800 block">{row.advertiser_name ?? 'Own offer'}</span>
                      {row.advertiser_slug && <span className="text-[10px] text-slate-400 font-mono block">{row.advertiser_slug}</span>}
                      {row.offer_name && <span className="text-[10px] font-semibold block" style={{ color: BLUE }}>Offer: {row.offer_name}</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {row.media_buyer_name ? (
                        <span className="text-[11px] font-semibold text-slate-600">{row.media_buyer_name}</span>
                      ) : (
                        <span className="text-[12px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5"><PubPostbackCell row={row} /></td>
                    <td className="px-5 py-3.5"><span className="text-[11px] font-mono text-slate-500">{row.click_id || '—'}</span></td>
                    <td className="px-5 py-3.5"><span className="text-[11px] text-slate-600">{row.event}</span></td>
                    <td className="px-5 py-3.5"><span className="text-[12px] font-bold text-amber-700">{row.payout ? `₹${Number(row.payout).toLocaleString('en-IN')}` : '—'}</span></td>
                    <td className="px-5 py-3.5">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>{row.status}</span>
                    </td>
                    <td className="px-5 py-3.5"><CapiBadge row={row} /></td>
                    <td className="px-5 py-3.5"><span className="text-[11px] text-slate-400">{formatDate(row.created_at)}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: '1px solid #F1F5F9', background: '#F8FAFC' }}>
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
