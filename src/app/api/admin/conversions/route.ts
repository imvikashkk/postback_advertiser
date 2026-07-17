import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req.cookies.get('pa_admin')?.value)) return NextResponse.json({ success: false }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const LIMIT = 50;
  const offset = (page - 1) * LIMIT;

  const from = url.searchParams.get('from') || '';
  const to   = url.searchParams.get('to')   || '';
  const mediaBuyerId = url.searchParams.get('media_buyer_id') || '';
  const search = url.searchParams.get('search') || '';

  const conds: string[] = [];
  const params: unknown[] = [];

  if (from) { params.push(from); conds.push(`(cv.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}::date`); }
  if (to)   { params.push(to);   conds.push(`(cv.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}::date`); }
  if (mediaBuyerId) { params.push(mediaBuyerId); conds.push(`mb.id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conds.push(`(a.slug ILIKE $${params.length} OR a.name ILIKE $${params.length})`); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const [rows, cnt] = await Promise.all([
      pool.query(
        `SELECT cv.id, cv.click_id, cv.event, cv.payout, cv.status, cv.created_at,
                a.name AS advertiser_name, a.slug AS advertiser_slug,
                mb.id AS media_buyer_id, mb.name AS media_buyer_name
         FROM adv_conversions cv
         JOIN adv_advertisers a ON a.id = cv.advertiser_id
         LEFT JOIN adv_clicks c       ON c.click_id = cv.click_id
         LEFT JOIN adv_media_buyers mb ON mb.id = c.media_buyer_id
         ${where}
         ORDER BY cv.created_at DESC
         LIMIT ${LIMIT} OFFSET ${offset}`,
        params,
      ),
      pool.query(
        `SELECT COUNT(*)
         FROM adv_conversions cv
         JOIN adv_advertisers a ON a.id = cv.advertiser_id
         LEFT JOIN adv_clicks c       ON c.click_id = cv.click_id
         LEFT JOIN adv_media_buyers mb ON mb.id = c.media_buyer_id
         ${where}`,
        params,
      ),
    ]);
    const total = parseInt(cnt.rows[0].count);
    return NextResponse.json({ success: true, data: rows.rows, total, page, totalPages: Math.ceil(total / LIMIT) || 1 });
  } catch (err) {
    console.error('conversions GET error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
