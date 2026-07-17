import { randomBytes } from 'crypto';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import pool from '@/lib/db';
import GoRedirectClient from './GoRedirectClient';

// Passthrough params we keep from the inbound click link (our own ad tracking context).
const META_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];

function getIp(h: Headers): string {
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

export default async function GoPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const h = await headers();

  const pubRes = await pool.query(
    `SELECT id, landing_url_template, pubid, is_active FROM adv_publishers WHERE slug = $1`,
    [slug],
  );
  const publisher = pubRes.rows[0];

  if (!publisher || !publisher.is_active) {
    notFound();
  }

  const clickId = randomBytes(12).toString('hex');
  const ip = getIp(h);

  const meta: Record<string, string> = {};
  for (const key of META_KEYS) {
    const v = sp[key];
    if (typeof v === 'string') meta[key] = v;
  }

  // ?mb= tags the click to one of our own media buyers, so their conversions
  // can be reported on their own dashboard.
  let mediaBuyerId: number | null = null;
  const mbParam = sp.mb;
  if (typeof mbParam === 'string' && /^\d+$/.test(mbParam)) {
    const mbRes = await pool.query(`SELECT id FROM adv_media_buyers WHERE id = $1 AND is_active = true`, [mbParam]);
    if (mbRes.rows.length > 0) mediaBuyerId = mbRes.rows[0].id;
  }

  // ?px= names exactly which of the media buyer's pixels this link belongs to —
  // they may run several campaigns on different ad accounts, so nothing is inferred.
  let pixelRowId: number | null = null;
  let fbPixelId: string | null = null;
  const pxParam = sp.px;
  if (mediaBuyerId && typeof pxParam === 'string' && /^\d+$/.test(pxParam)) {
    const pxRes = await pool.query(`SELECT id, pixel_id FROM adv_pixels WHERE id = $1 AND media_buyer_id = $2`, [pxParam, mediaBuyerId]);
    if (pxRes.rows.length > 0) {
      pixelRowId = pxRes.rows[0].id;
      fbPixelId = pxRes.rows[0].pixel_id;
    }
  }

  await pool.query(
    `INSERT INTO adv_clicks (click_id, publisher_id, media_buyer_id, pixel_id, meta, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [clickId, publisher.id, mediaBuyerId, pixelRowId, JSON.stringify(meta), ip, h.get('user-agent') || null],
  );

  const destination = publisher.landing_url_template
    .replaceAll('{click_id}', encodeURIComponent(clickId))
    .replaceAll('{pubid}', encodeURIComponent(publisher.pubid || ''))
    .replaceAll('{ip}', encodeURIComponent(ip));

  return <GoRedirectClient pixelId={fbPixelId} destination={destination} clickId={clickId} />;
}
