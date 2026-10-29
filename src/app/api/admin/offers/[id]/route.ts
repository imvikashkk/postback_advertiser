import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';
import { OFFER_SELECT, OFFER_GROUP, parseOfferInput, setOfferPublishers } from '../shared';

function authCheck(req: NextRequest) {
  return verifyAdminToken(req.cookies.get('pa_admin')?.value);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const input = parseOfferInput(body);
  if (typeof input === 'string') return NextResponse.json({ success: false, message: input }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE adv_offers
       SET name=$1, advertiser_id=$2, landing_url_template=$3, payout=$4, currency=$5, is_active=$6, updated_at=NOW()
           ${body.regenerate_key ? ', postback_key=$8' : ''}
       WHERE id=$7 RETURNING id`,
      body.regenerate_key
        ? [input.name, input.advertiser_id, input.landing_url_template, input.payout, input.currency, input.is_active, id, randomBytes(16).toString('hex')]
        : [input.name, input.advertiser_id, input.landing_url_template, input.payout, input.currency, input.is_active, id],
    );
    if (upd.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, message: 'Offer not found' }, { status: 404 });
    }
    await setOfferPublishers(client, upd.rows[0].id, input.publisher_ids);
    await client.query('COMMIT');

    const res = await pool.query(`${OFFER_SELECT} WHERE o.id = $1 ${OFFER_GROUP}`, [id]);
    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    if ((err as { code?: string }).code === '23503') {
      return NextResponse.json({ success: false, message: 'Unknown advertiser or publisher' }, { status: 400 });
    }
    console.error('offers PUT error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { id } = await params;
    const res = await pool.query(`DELETE FROM adv_offers WHERE id=$1 RETURNING id`, [id]);
    if (res.rows.length === 0) return NextResponse.json({ success: false, message: 'Offer not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23503') {
      return NextResponse.json({ success: false, message: 'Cannot delete: offer has clicks/conversions logged — mark it inactive instead' }, { status: 409 });
    }
    console.error('offers DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
