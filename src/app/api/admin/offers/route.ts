import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import pool from '@/lib/db';
import { verifyAdminToken } from '@/lib/adminAuth';
import { OFFER_SELECT, OFFER_GROUP, parseOfferInput, setOfferPublishers } from './shared';

function authCheck(req: NextRequest) {
  return verifyAdminToken(req.cookies.get('pa_admin')?.value);
}

export async function GET(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const res = await pool.query(`${OFFER_SELECT} ${OFFER_GROUP} ORDER BY o.created_at DESC`);
    return NextResponse.json({ success: true, data: res.rows });
  } catch (err) {
    console.error('offers GET error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  const input = parseOfferInput(await req.json());
  if (typeof input === 'string') return NextResponse.json({ success: false, message: input }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO adv_offers (name, advertiser_id, landing_url_template, postback_key, payout, currency, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.name, input.advertiser_id, input.landing_url_template, randomBytes(16).toString('hex'), input.payout, input.currency, input.is_active],
    );
    const id = ins.rows[0].id;
    await setOfferPublishers(client, id, input.publisher_ids);
    await client.query('COMMIT');

    const res = await pool.query(`${OFFER_SELECT} WHERE o.id = $1 ${OFFER_GROUP}`, [id]);
    return NextResponse.json({ success: true, data: res.rows[0] }, { status: 201 });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    if ((err as { code?: string }).code === '23503') {
      return NextResponse.json({ success: false, message: 'Unknown advertiser or publisher' }, { status: 400 });
    }
    console.error('offers POST error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  } finally {
    client.release();
  }
}
