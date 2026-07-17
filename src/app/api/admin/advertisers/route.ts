import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';

function authCheck(req: NextRequest) {
  return verifyAdminToken(req.cookies.get('pa_admin')?.value);
}

export async function GET(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';

  try {
    const conds: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      conds.push(`(slug ILIKE $${i} OR name ILIKE $${i})`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const res = await pool.query(
      `SELECT id, name, slug, landing_url_template, pubid, postback_key, payout, currency, is_active, created_at, updated_at
       FROM adv_advertisers ${where} ORDER BY created_at DESC`,
      params,
    );
    return NextResponse.json({ success: true, data: res.rows });
  } catch (err) {
    console.error('advertisers GET error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const {
      name, slug, landing_url_template, pubid = null, payout = null,
      currency = 'INR', is_active = true,
    } = await req.json();

    if (!name || !slug || !landing_url_template) {
      return NextResponse.json({ success: false, message: 'name, slug and landing_url_template are required' }, { status: 400 });
    }
    if (!landing_url_template.includes('{click_id}')) {
      return NextResponse.json({ success: false, message: 'landing_url_template must contain a {click_id} placeholder' }, { status: 400 });
    }

    const postbackKey = randomBytes(16).toString('hex');

    const res = await pool.query(
      `INSERT INTO adv_advertisers (name, slug, landing_url_template, pubid, postback_key, payout, currency, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, slug, landing_url_template, pubid, postback_key, payout, currency, is_active, created_at, updated_at`,
      [name.trim(), slug.toLowerCase().trim(), landing_url_template.trim(), pubid?.trim() || null, postbackKey, payout, currency, is_active],
    );

    return NextResponse.json({ success: true, data: res.rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      return NextResponse.json({ success: false, message: 'Slug already exists' }, { status: 409 });
    }
    console.error('advertisers POST error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
