import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req.cookies.get('pa_admin')?.value)) return NextResponse.json({ success: false }, { status: 401 });

  const url  = new URL(req.url);
  const from = url.searchParams.get('from') || '';
  const to   = url.searchParams.get('to')   || '';
  const mediaBuyerIdRaw = url.searchParams.get('media_buyer_id') || '';
  const mbId = /^\d+$/.test(mediaBuyerIdRaw) ? mediaBuyerIdRaw : '';

  const clickConds: string[] = [];
  const convConds: string[] = [];
  if (from) { clickConds.push(`(c.created_at AT TIME ZONE 'Asia/Kolkata')::date >= '${from}'::date`); convConds.push(`(cv.created_at AT TIME ZONE 'Asia/Kolkata')::date >= '${from}'::date`); }
  if (to)   { clickConds.push(`(c.created_at AT TIME ZONE 'Asia/Kolkata')::date <= '${to}'::date`);   convConds.push(`(cv.created_at AT TIME ZONE 'Asia/Kolkata')::date <= '${to}'::date`); }
  if (mbId) clickConds.push(`c.media_buyer_id = ${mbId}`);
  const clickFilter = clickConds.length ? `AND ${clickConds.join(' AND ')}` : '';
  const convFilter  = convConds.length  ? `AND ${convConds.join(' AND ')}`  : '';

  // Conversions don't carry media_buyer_id directly — it lives on the click
  // that originated them, so the overview totals join through click_id to filter by it.
  const convJoin   = mbId ? `JOIN adv_clicks c ON c.click_id = cv.click_id` : '';
  const convMbCond = mbId ? `AND c.media_buyer_id = ${mbId}` : '';

  try {
    const [overviewRes, byAdvertiserRes, byMediaBuyerRes] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM adv_clicks c WHERE 1=1 ${clickFilter})           AS total_clicks,
          (SELECT COUNT(*) FROM adv_conversions cv ${convJoin} WHERE 1=1 ${convFilter} ${convMbCond})      AS total_conversions,
          (SELECT COALESCE(SUM(cv.payout),0) FROM adv_conversions cv ${convJoin} WHERE 1=1 ${convFilter} ${convMbCond}) AS total_payout,
          (SELECT COUNT(*) FROM adv_conversions cv ${convJoin} WHERE cv.capi_sent = true ${convFilter} ${convMbCond}) AS capi_sent,
          (SELECT COUNT(*) FROM adv_conversions cv ${convJoin} WHERE cv.capi_sent = false AND cv.capi_error IS NOT NULL ${convFilter} ${convMbCond}) AS capi_failed,
          (SELECT COUNT(*) FROM adv_conversions cv ${convJoin} WHERE cv.capi_sent = false AND cv.capi_error IS NULL ${convFilter} ${convMbCond}) AS capi_skipped
      `),
      pool.query(`
        SELECT
          p.id, p.name, p.slug, p.is_active,
          COUNT(DISTINCT c.id)                        AS clicks,
          COUNT(DISTINCT cv.id)                        AS conversions,
          COALESCE(SUM(cv.payout), 0)                  AS payout
        FROM adv_advertisers p
        LEFT JOIN adv_clicks c       ON c.advertiser_id = p.id ${clickFilter}
        LEFT JOIN adv_conversions cv ON cv.advertiser_id = p.id ${convFilter}
        GROUP BY p.id, p.name, p.slug, p.is_active
        ORDER BY clicks DESC
      `),
      pool.query(`
        SELECT
          mb.id, mb.name, mb.is_active,
          COUNT(DISTINCT c.id)                        AS clicks,
          COUNT(DISTINCT cv.id)                        AS conversions,
          COALESCE(SUM(cv.payout), 0)                  AS payout
        FROM adv_media_buyers mb
        LEFT JOIN adv_clicks c       ON c.media_buyer_id = mb.id ${clickFilter}
        LEFT JOIN adv_conversions cv ON cv.click_id = c.click_id ${convFilter}
        GROUP BY mb.id, mb.name, mb.is_active
        ORDER BY clicks DESC
      `),
    ]);

    return NextResponse.json({
      success: true,
      overview: overviewRes.rows[0],
      by_advertiser: byAdvertiserRes.rows,
      by_media_buyer: byMediaBuyerRes.rows,
    });
  } catch (err) {
    console.error('stats error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
