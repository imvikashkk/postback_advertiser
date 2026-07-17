import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyToken } from '@/lib/mbAuth';

export async function GET(req: NextRequest) {
  const mediaBuyerId = verifyToken(req.cookies.get('pa_mb_token')?.value);
  if (!mediaBuyerId) return NextResponse.json({ success: false }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const LIMIT = 50;
  const offset = (page - 1) * LIMIT;

  const from = url.searchParams.get('from') || '';
  const to   = url.searchParams.get('to')   || '';

  const clickConds: string[] = [];
  const convConds: string[] = [];
  if (from) { clickConds.push(`(c.created_at AT TIME ZONE 'Asia/Kolkata')::date >= '${from}'::date`); convConds.push(`(cv.created_at AT TIME ZONE 'Asia/Kolkata')::date >= '${from}'::date`); }
  if (to)   { clickConds.push(`(c.created_at AT TIME ZONE 'Asia/Kolkata')::date <= '${to}'::date`);   convConds.push(`(cv.created_at AT TIME ZONE 'Asia/Kolkata')::date <= '${to}'::date`); }
  const clickFilter = clickConds.length ? `AND ${clickConds.join(' AND ')}` : '';
  const convFilter  = convConds.length  ? `AND ${convConds.join(' AND ')}`  : '';

  try {
    const [byAdvertiserRes, rows, cnt] = await Promise.all([
      pool.query(
        `SELECT p.id, p.name, p.slug,
                COUNT(DISTINCT c.id)         AS clicks,
                COUNT(DISTINCT cv.id)        AS conversions,
                COALESCE(SUM(cv.payout), 0)  AS payout
         FROM adv_advertisers p
         LEFT JOIN adv_clicks c       ON c.advertiser_id = p.id AND c.media_buyer_id = $1 ${clickFilter}
         LEFT JOIN adv_conversions cv ON cv.click_id = c.click_id ${convFilter}
         GROUP BY p.id, p.name, p.slug
         HAVING COUNT(DISTINCT c.id) > 0
         ORDER BY clicks DESC`,
        [mediaBuyerId],
      ),
      pool.query(
        `SELECT cv.id, cv.click_id, cv.event, cv.payout, cv.status, cv.created_at,
                p.name AS advertiser_name, p.slug AS advertiser_slug
         FROM adv_conversions cv
         JOIN adv_clicks c    ON c.click_id = cv.click_id
         JOIN adv_advertisers p ON p.id = cv.advertiser_id
         WHERE c.media_buyer_id = $1 ${convFilter}
         ORDER BY cv.created_at DESC
         LIMIT ${LIMIT} OFFSET ${offset}`,
        [mediaBuyerId],
      ),
      pool.query(
        `SELECT COUNT(*) FROM adv_conversions cv JOIN adv_clicks c ON c.click_id = cv.click_id WHERE c.media_buyer_id = $1 ${convFilter}`,
        [mediaBuyerId],
      ),
    ]);

    const total = parseInt(cnt.rows[0].count);
    return NextResponse.json({
      success: true,
      by_advertiser: byAdvertiserRes.rows,
      data: rows.rows,
      total,
      page,
      totalPages: Math.ceil(total / LIMIT) || 1,
    });
  } catch (err) {
    console.error('mb conversions GET error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
