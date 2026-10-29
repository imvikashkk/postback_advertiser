import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';

function authCheck(req: NextRequest) {
  return verifyAdminToken(req.cookies.get('pa_admin')?.value);
}

export async function GET(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const res = await pool.query(
      `SELECT id, name, postback_url_template, payout, currency, is_active, created_at, updated_at
       FROM adv_publishers ORDER BY created_at DESC`,
    );
    return NextResponse.json({ success: true, data: res.rows });
  } catch (err) {
    console.error('publishers GET error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { name, postback_url_template, payout = null, currency = 'INR', is_active = true } = await req.json();

    if (!name?.trim() || !postback_url_template?.trim()) {
      return NextResponse.json({ success: false, message: 'name and postback_url_template are required' }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(postback_url_template.trim())) {
      return NextResponse.json({ success: false, message: 'postback_url_template must start with http:// or https://' }, { status: 400 });
    }
    if (!postback_url_template.includes('{click_id}')) {
      return NextResponse.json({ success: false, message: 'postback_url_template must contain a {click_id} placeholder' }, { status: 400 });
    }

    const res = await pool.query(
      `INSERT INTO adv_publishers (name, postback_url_template, payout, currency, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, postback_url_template, payout, currency, is_active, created_at, updated_at`,
      [name.trim(), postback_url_template.trim(), payout, currency, is_active],
    );

    return NextResponse.json({ success: true, data: res.rows[0] }, { status: 201 });
  } catch (err) {
    console.error('publishers POST error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
