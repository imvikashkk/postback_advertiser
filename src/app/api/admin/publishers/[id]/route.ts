import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';
import { buildPublisherPostbackUrl, firePublisherPostback } from '@/lib/publisherPostback';

function authCheck(req: NextRequest) {
  return verifyAdminToken(req.cookies.get('pa_admin')?.value);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { id } = await params;
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
      `UPDATE adv_publishers
       SET name=$1, postback_url_template=$2, payout=$3, currency=$4, is_active=$5, updated_at=NOW()
       WHERE id=$6
       RETURNING id, name, postback_url_template, payout, currency, is_active, created_at, updated_at`,
      [name.trim(), postback_url_template.trim(), payout, currency, is_active, id],
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Publisher not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (err) {
    console.error('publishers PUT error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

// Fires a test postback at the publisher's URL with a dummy click id, so their
// integration can be checked before any real conversion comes in.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { id } = await params;
    const res = await pool.query(`SELECT postback_url_template, payout, currency FROM adv_publishers WHERE id=$1`, [id]);
    const publisher = res.rows[0];
    if (!publisher) return NextResponse.json({ success: false, message: 'Publisher not found' }, { status: 404 });

    const url = buildPublisherPostbackUrl(publisher.postback_url_template, {
      clickId: 'TEST_CLICK_ID',
      payout: publisher.payout !== null ? Number(publisher.payout) : 0,
      currency: publisher.currency,
      event: 'test',
      conversionId: 0,
    });
    const error = await firePublisherPostback(url);
    return NextResponse.json({ success: error === null, url, message: error ?? 'Postback fired successfully' });
  } catch (err) {
    console.error('publishers test postback error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { id } = await params;
    const res = await pool.query(`DELETE FROM adv_publishers WHERE id=$1 RETURNING id`, [id]);

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Publisher not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23503') {
      return NextResponse.json({ success: false, message: 'Cannot delete: publisher has clicks logged — mark it inactive instead' }, { status: 409 });
    }
    console.error('publishers DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
