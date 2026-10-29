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
    const [overviewRes, byAdvertiserRes, byMediaBuyerRes, byPublisherRes, byOfferRes] = await Promise.all([
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
        -- Clicks and conversions are aggregated separately: joining both onto the
        -- advertiser at once multiplies every click by every conversion (slow, and
        -- inflates SUM(payout) by the click count).
        SELECT
          p.id, p.name, p.slug, p.is_active,
          COALESCE(ck.clicks, 0)      AS clicks,
          COALESCE(cn.conversions, 0) AS conversions,
          COALESCE(cn.payout, 0)      AS payout
        FROM adv_advertisers p
        LEFT JOIN (
          SELECT c.advertiser_id, COUNT(*) AS clicks
          FROM adv_clicks c WHERE 1=1 ${clickFilter}
          GROUP BY c.advertiser_id
        ) ck ON ck.advertiser_id = p.id
        LEFT JOIN (
          SELECT cv.advertiser_id, COUNT(*) AS conversions, SUM(cv.payout) AS payout
          FROM adv_conversions cv WHERE 1=1 ${convFilter}
          GROUP BY cv.advertiser_id
        ) cn ON cn.advertiser_id = p.id
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
      pool.query(`
        SELECT
          pb.id, pb.name, pb.is_active,
          COUNT(DISTINCT c.id)                                          AS clicks,
          COUNT(DISTINCT cv.id)                                         AS conversions,
          COUNT(DISTINCT cv.id) FILTER (WHERE cv.pub_postback_sent)     AS postbacks_sent,
          COUNT(DISTINCT cv.id) FILTER (WHERE cv.pub_postback_error IS NOT NULL) AS postbacks_failed,
          COALESCE(SUM(cv.pub_payout), 0)                               AS payout
        FROM adv_publishers pb
        LEFT JOIN adv_clicks c       ON c.publisher_id = pb.id ${clickFilter}
        LEFT JOIN adv_conversions cv ON cv.click_id = c.click_id ${convFilter}
        GROUP BY pb.id, pb.name, pb.is_active
        ORDER BY clicks DESC
      `),
      pool.query(`
        SELECT
          o.id, o.name, o.is_active,
          COUNT(DISTINCT c.id)                                          AS clicks,
          COUNT(DISTINCT cv.id)                                         AS conversions,
          COALESCE(SUM(cv.pub_payout), 0)                               AS payout
        FROM adv_offers o
        LEFT JOIN adv_clicks c       ON c.offer_id = o.id ${clickFilter}
        LEFT JOIN adv_conversions cv ON cv.click_id = c.click_id ${convFilter}
        GROUP BY o.id, o.name, o.is_active
        ORDER BY clicks DESC
      `),
    ]);

    return NextResponse.json({
      success: true,
      overview: overviewRes.rows[0],
      by_advertiser: byAdvertiserRes.rows,
      by_media_buyer: byMediaBuyerRes.rows,
      by_publisher: byPublisherRes.rows,
      by_offer: byOfferRes.rows,
    });
  } catch (err) {
    console.error('stats error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
