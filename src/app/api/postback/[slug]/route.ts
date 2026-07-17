import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { sendMetaConversionEvent } from '@/lib/metaCapi';

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

const CLICK_ID_KEYS = ['click_id', 'clickid', 'aff_sub', 'subid', 'sub_id', 'pixel', 's1'];
const PAYOUT_KEYS   = ['payout', 'amount', 'sale_amount', 'revenue', 'value'];
const EVENT_KEYS     = ['event', 'status', 'type', 'goal'];

function firstParam(params: URLSearchParams, keys: string[]): string | null {
  for (const k of keys) {
    const v = params.get(k);
    if (v) return v;
  }
  return null;
}

async function handlePostback(req: NextRequest, slug: string) {
  try {
    const pubRes = await pool.query(
      `SELECT id, postback_key, payout AS default_payout, currency FROM adv_publishers WHERE slug = $1`,
      [slug],
    );
    const publisher = pubRes.rows[0];
    if (!publisher) return new NextResponse('Unknown publisher', { status: 404 });

    const params = req.nextUrl.searchParams;
    const key = params.get('key');
    if (!key || key !== publisher.postback_key) {
      return new NextResponse('Invalid key', { status: 401 });
    }

    const clickId = firstParam(params, CLICK_ID_KEYS);
    const payoutRaw = firstParam(params, PAYOUT_KEYS);
    const payout = payoutRaw !== null && payoutRaw !== '' ? Number(payoutRaw) : publisher.default_payout;
    const event = firstParam(params, EVENT_KEYS) || 'conversion';

    const rawQuery: Record<string, string> = {};
    params.forEach((v, k) => { rawQuery[k] = v; });

    const insertRes = await pool.query(
      `INSERT INTO adv_conversions (publisher_id, click_id, event, payout, status, raw_query, ip)
       VALUES ($1, $2, $3, $4, 'received', $5, $6)
       RETURNING id`,
      [publisher.id, clickId, event, Number.isFinite(payout) ? payout : null, JSON.stringify(rawQuery), getIp(req)],
    );
    const conversionId = insertRes.rows[0].id;

    // Tell Meta this ad drove a real conversion, so the campaign keeps optimizing —
    // even though the sale itself happened on the publisher's site, not ours.
    if (clickId) {
      const clickRes = await pool.query(
        `SELECT c.ip, c.user_agent, c.created_at, c.meta, px.pixel_id, px.access_token
         FROM adv_clicks c
         JOIN adv_pixels px ON px.media_buyer_id = c.media_buyer_id AND px.is_default = true
         WHERE c.click_id = $1`,
        [clickId],
      );
      const click = clickRes.rows[0];

      if (click) {
        const capiError = await sendMetaConversionEvent({
          pixelId: click.pixel_id,
          accessToken: click.access_token,
          eventId: `pb-${conversionId}`,
          value: Number.isFinite(payout) ? payout : null,
          currency: publisher.currency,
          ip: click.ip || getIp(req),
          userAgent: click.user_agent || req.headers.get('user-agent') || 'Unknown',
          sourceUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/go/${slug}`,
          fbp: click.meta?.fbp,
          fbc: click.meta?.fbc,
          fbclid: click.meta?.fbclid,
          clickTimeMs: new Date(click.created_at).getTime(),
        });

        await pool.query(
          `UPDATE adv_conversions SET capi_sent=$1, capi_error=$2 WHERE id=$3`,
          [capiError === null, capiError, conversionId],
        );
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('postback error:', err);
    return new NextResponse('Server error', { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handlePostback(req, slug);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handlePostback(req, slug);
}
