import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyToken } from '@/lib/mbAuth';

function auth(req: NextRequest) {
  return verifyToken(req.cookies.get('pa_mb_token')?.value);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const mediaBuyerId = auth(req);
  if (!mediaBuyerId) return NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;
  const pixelId = parseInt(id);
  if (isNaN(pixelId)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const { label, pixel_id, access_token, ad_account_id = null } = await req.json();
    if (!label || !pixel_id || !access_token) {
      return NextResponse.json({ success: false, message: 'label, pixel_id, access_token required' }, { status: 400 });
    }

    const res = await pool.query(
      `UPDATE adv_pixels
       SET label=$1, pixel_id=$2, access_token=$3, ad_account_id=$4, updated_at=NOW()
       WHERE id=$5 AND media_buyer_id=$6
       RETURNING id, label, pixel_id, ad_account_id`,
      [label.trim(), pixel_id.trim(), access_token.trim(), ad_account_id, pixelId, mediaBuyerId],
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (err) {
    console.error('mb pixels PUT error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const mediaBuyerId = auth(req);
  if (!mediaBuyerId) return NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;
  const pixelId = parseInt(id);
  if (isNaN(pixelId)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const res = await pool.query(`DELETE FROM adv_pixels WHERE id=$1 AND media_buyer_id=$2 RETURNING id`, [pixelId, mediaBuyerId]);
    if (res.rowCount === 0) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('mb pixels DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
