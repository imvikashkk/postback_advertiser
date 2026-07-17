import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req.cookies.get('pa_admin')?.value)) return NextResponse.json({ success: false }, { status: 401 });

  const url  = new URL(req.url);
  const from = url.searchParams.get('from') || '';
  const to   = url.searchParams.get('to')   || '';

  const clickConds: string[] = [];
  const convConds: string[] = [];
  if (from) { clickConds.push(`(c.created_at AT TIME ZONE 'Asia/Kolkata')::date >= '${from}'::date`); convConds.push(`(cv.created_at AT TIME ZONE 'Asia/Kolkata')::date >= '${from}'::date`); }
  if (to)   { clickConds.push(`(c.created_at AT TIME ZONE 'Asia/Kolkata')::date <= '${to}'::date`);   convConds.push(`(cv.created_at AT TIME ZONE 'Asia/Kolkata')::date <= '${to}'::date`); }
  const clickFilter = clickConds.length ? `AND ${clickConds.join(' AND ')}` : '';
  const convFilter  = convConds.length  ? `AND ${convConds.join(' AND ')}`  : '';

  try {
    const [overviewRes, byPublisherRes, byMediaBuyerRes] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM adv_clicks c WHERE 1=1 ${clickFilter})           AS total_clicks,
          (SELECT COUNT(*) FROM adv_conversions cv WHERE 1=1 ${convFilter})      AS total_conversions,
          (SELECT COALESCE(SUM(payout),0) FROM adv_conversions cv WHERE 1=1 ${convFilter}) AS total_payout
      `),
      pool.query(`
        SELECT
          p.id, p.name, p.slug, p.is_active,
          COUNT(DISTINCT c.id)                        AS clicks,
          COUNT(DISTINCT cv.id)                        AS conversions,
          COALESCE(SUM(cv.payout), 0)                  AS payout
        FROM adv_publishers p
        LEFT JOIN adv_clicks c       ON c.publisher_id = p.id ${clickFilter}
        LEFT JOIN adv_conversions cv ON cv.publisher_id = p.id ${convFilter}
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
      by_publisher: byPublisherRes.rows,
      by_media_buyer: byMediaBuyerRes.rows,
    });
  } catch (err) {
    console.error('stats error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
