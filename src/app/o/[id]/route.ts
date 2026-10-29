import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import pool from '@/lib/db';

// Publisher tracking link: /o/{offer_id}?pub={publisher_id}&sub={their_click_id}.
// Only publishers assigned to the offer get through; everyone else gets a 404.
// No bridge page — publishers don't run our Meta pixels, so it's a plain redirect.

const META_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const pub = sp.get('pub') || '';
  if (!/^\d+$/.test(id) || !/^\d+$/.test(pub)) return new NextResponse('Not found', { status: 404 });

  try {
    const res = await pool.query(
      `SELECT o.id, o.advertiser_id, o.landing_url_template AS offer_landing,
              a.landing_url_template AS adv_landing, a.pubid, a.is_active AS adv_active
       FROM adv_offers o
       JOIN adv_offer_publishers op ON op.offer_id = o.id AND op.publisher_id = $2
       JOIN adv_publishers pb       ON pb.id = op.publisher_id AND pb.is_active = true
       LEFT JOIN adv_advertisers a  ON a.id = o.advertiser_id
       WHERE o.id = $1 AND o.is_active = true`,
      [id, pub],
    );
    const offer = res.rows[0];
    if (!offer || (offer.advertiser_id && !offer.adv_active)) {
      return new NextResponse('Not found', { status: 404 });
    }

    const clickId = randomBytes(12).toString('hex');
    const ip = getIp(req);
    const sub = sp.get('sub');

    const meta: Record<string, string> = {};
    for (const key of META_KEYS) {
      const v = sp.get(key);
      if (v) meta[key] = v;
    }

    await pool.query(
      `INSERT INTO adv_clicks (click_id, advertiser_id, offer_id, publisher_id, pub_click_id, meta, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [clickId, offer.advertiser_id, offer.id, Number(pub), sub ? sub.slice(0, 255) : null, JSON.stringify(meta), ip, req.headers.get('user-agent') || null],
    );

    const template: string = offer.advertiser_id ? offer.adv_landing : offer.offer_landing;
    const destination = template
      .replaceAll('{click_id}', encodeURIComponent(clickId))
      .replaceAll('{pubid}', encodeURIComponent(offer.pubid || ''))
      .replaceAll('{ip}', encodeURIComponent(ip));

    return NextResponse.redirect(destination, 302);
  } catch (err) {
    console.error('offer redirect error:', err);
    return new NextResponse('Server error', { status: 500 });
  }
}
