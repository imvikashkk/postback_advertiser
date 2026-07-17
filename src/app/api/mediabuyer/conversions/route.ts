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

  try {
    const [byPublisherRes, rows, cnt] = await Promise.all([
      pool.query(
        `SELECT p.id, p.name, p.slug,
                COUNT(DISTINCT c.id)         AS clicks,
                COUNT(DISTINCT cv.id)        AS conversions,
                COALESCE(SUM(cv.payout), 0)  AS payout
         FROM adv_publishers p
         LEFT JOIN adv_clicks c       ON c.publisher_id = p.id AND c.media_buyer_id = $1
         LEFT JOIN adv_conversions cv ON cv.click_id = c.click_id
         GROUP BY p.id, p.name, p.slug
         HAVING COUNT(DISTINCT c.id) > 0
         ORDER BY clicks DESC`,
        [mediaBuyerId],
      ),
      pool.query(
        `SELECT cv.id, cv.click_id, cv.event, cv.payout, cv.status, cv.created_at,
                p.name AS publisher_name, p.slug AS publisher_slug
         FROM adv_conversions cv
         JOIN adv_clicks c    ON c.click_id = cv.click_id
         JOIN adv_publishers p ON p.id = cv.publisher_id
         WHERE c.media_buyer_id = $1
         ORDER BY cv.created_at DESC
         LIMIT ${LIMIT} OFFSET ${offset}`,
        [mediaBuyerId],
      ),
      pool.query(
        `SELECT COUNT(*) FROM adv_conversions cv JOIN adv_clicks c ON c.click_id = cv.click_id WHERE c.media_buyer_id = $1`,
        [mediaBuyerId],
      ),
    ]);

    const total = parseInt(cnt.rows[0].count);
    return NextResponse.json({
      success: true,
      by_publisher: byPublisherRes.rows,
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
