import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyToken } from '@/lib/mbAuth';

export async function GET(req: NextRequest) {
  const mediaBuyerId = verifyToken(req.cookies.get('pa_mb_token')?.value);
  if (!mediaBuyerId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const [profileRes, pixelsRes, advertisersRes, statsRes] = await Promise.all([
      pool.query(`SELECT id, name, email FROM adv_media_buyers WHERE id = $1 AND is_active = true`, [mediaBuyerId]),
      pool.query(
        `SELECT id, label, pixel_id, ad_account_id FROM adv_pixels WHERE media_buyer_id = $1 ORDER BY label ASC`,
        [mediaBuyerId],
      ),
      pool.query(`SELECT id, name, slug FROM adv_advertisers WHERE is_active = true ORDER BY name ASC`),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM adv_clicks WHERE media_buyer_id = $1)      AS total_clicks,
           (SELECT COUNT(*) FROM adv_conversions cv JOIN adv_clicks c ON c.click_id = cv.click_id WHERE c.media_buyer_id = $1) AS total_conversions,
           (SELECT COALESCE(SUM(cv.payout),0) FROM adv_conversions cv JOIN adv_clicks c ON c.click_id = cv.click_id WHERE c.media_buyer_id = $1) AS total_payout`,
        [mediaBuyerId],
      ),
    ]);

    if (profileRes.rows.length === 0) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      profile: profileRes.rows[0],
      pixels: pixelsRes.rows,
      advertisers: advertisersRes.rows,
      stats: statsRes.rows[0],
    });
  } catch (err) {
    console.error('mb me error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
