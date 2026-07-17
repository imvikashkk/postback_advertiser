import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req.cookies.get('pa_admin')?.value)) return NextResponse.json({ success: false }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const LIMIT = 50;
  const offset = (page - 1) * LIMIT;

  try {
    const [rows, cnt] = await Promise.all([
      pool.query(
        `SELECT cv.id, cv.click_id, cv.event, cv.payout, cv.status, cv.created_at,
                p.name AS publisher_name, p.slug AS publisher_slug
         FROM adv_conversions cv
         JOIN adv_publishers p ON p.id = cv.publisher_id
         ORDER BY cv.created_at DESC
         LIMIT ${LIMIT} OFFSET ${offset}`,
      ),
      pool.query(`SELECT COUNT(*) FROM adv_conversions`),
    ]);
    const total = parseInt(cnt.rows[0].count);
    return NextResponse.json({ success: true, data: rows.rows, total, page, totalPages: Math.ceil(total / LIMIT) || 1 });
  } catch (err) {
    console.error('conversions GET error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
