import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';

function authCheck(req: NextRequest) {
  return verifyAdminToken(req.cookies.get('pa_admin')?.value);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { id } = await params;
    const {
      name, slug, landing_url_template, pubid = null, payout = null,
      currency = 'INR', is_active = true, regenerate_key = false,
    } = await req.json();

    if (!name || !slug || !landing_url_template) {
      return NextResponse.json({ success: false, message: 'name, slug and landing_url_template are required' }, { status: 400 });
    }
    if (!landing_url_template.includes('{click_id}')) {
      return NextResponse.json({ success: false, message: 'landing_url_template must contain a {click_id} placeholder' }, { status: 400 });
    }

    const res = await pool.query(
      `UPDATE adv_advertisers
       SET name=$1, slug=$2, landing_url_template=$3, pubid=$4, payout=$5, currency=$6, is_active=$7, updated_at=NOW()
           ${regenerate_key ? ', postback_key=$9' : ''}
       WHERE id=$8
       RETURNING id, name, slug, landing_url_template, pubid, postback_key, payout, currency, is_active, created_at, updated_at`,
      regenerate_key
        ? [name.trim(), slug.toLowerCase().trim(), landing_url_template.trim(), pubid?.trim() || null, payout, currency, is_active, id, randomBytes(16).toString('hex')]
        : [name.trim(), slug.toLowerCase().trim(), landing_url_template.trim(), pubid?.trim() || null, payout, currency, is_active, id],
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Advertiser not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      return NextResponse.json({ success: false, message: 'Slug already exists' }, { status: 409 });
    }
    console.error('advertisers PUT error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { id } = await params;
    const res = await pool.query(`DELETE FROM adv_advertisers WHERE id=$1 RETURNING id`, [id]);

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Advertiser not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23503') {
      return NextResponse.json({ success: false, message: 'Cannot delete: advertiser has clicks/conversions logged' }, { status: 409 });
    }
    console.error('advertisers DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
