import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { notifyPublisherForConversion } from '@/lib/publisherPostback';

// Conversion postback for offers with their OWN landing page (not backed by an
// advertiser) — whoever runs that landing page fires this when a sale happens.

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

const CLICK_ID_KEYS = ['click_id', 'clickid', 'aff_sub', 'subid', 'sub_id', 's1'];
const PAYOUT_KEYS   = ['payout', 'amount', 'sale_amount', 'revenue', 'value'];
const EVENT_KEYS    = ['event', 'status', 'type', 'goal'];

function firstParam(params: URLSearchParams, keys: string[]): string | null {
  for (const k of keys) {
    const v = params.get(k);
    if (v) return v;
  }
  return null;
}

async function handleOfferPostback(req: NextRequest, id: string) {
  if (!/^\d+$/.test(id)) return new NextResponse('Unknown offer', { status: 404 });

  try {
    const offerRes = await pool.query(`SELECT id, advertiser_id, postback_key FROM adv_offers WHERE id = $1`, [id]);
    const offer = offerRes.rows[0];
    if (!offer) return new NextResponse('Unknown offer', { status: 404 });
    if (offer.advertiser_id) {
      return new NextResponse('This offer is backed by an advertiser — conversions arrive on the advertiser postback, not here', { status: 400 });
    }

    const params = req.nextUrl.searchParams;
    const key = params.get('key');
    if (!key || key !== offer.postback_key) return new NextResponse('Invalid key', { status: 401 });

    const clickId = firstParam(params, CLICK_ID_KEYS);
    if (clickId && /^YOUR_/i.test(clickId)) {
      return new NextResponse('click_id still contains a YOUR_..._MACRO placeholder — replace it with the real click id macro before use', { status: 400 });
    }
    const payoutRaw = firstParam(params, PAYOUT_KEYS);
    const payoutNum = payoutRaw !== null && payoutRaw !== '' ? Number(payoutRaw) : null;
    const payout = payoutNum !== null && Number.isFinite(payoutNum) ? payoutNum : null;
    const event = firstParam(params, EVENT_KEYS) || 'conversion';

    const rawQuery: Record<string, string> = {};
    params.forEach((v, k) => { rawQuery[k] = v; });

    const insertRes = await pool.query(
      `INSERT INTO adv_conversions (offer_id, click_id, event, payout, status, raw_query, ip)
       VALUES ($1, $2, $3, $4, 'received', $5, $6)
       RETURNING id`,
      [offer.id, clickId, event, payout, JSON.stringify(rawQuery), getIp(req)],
    );

    // Only credit a click that was actually sent to THIS offer.
    const clickRes = clickId
      ? await pool.query(`SELECT 1 FROM adv_clicks WHERE click_id = $1 AND offer_id = $2`, [clickId, offer.id])
      : null;
    if (clickId && clickRes && clickRes.rows.length > 0) {
      await notifyPublisherForConversion({ conversionId: insertRes.rows[0].id, clickId, payout, event });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('offer postback error:', err);
    return new NextResponse('Server error', { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleOfferPostback(req, id);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleOfferPostback(req, id);
}
