import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hashPassword } from '@/lib/mbAuth';
import { verifyAdminToken } from '@/lib/adminAuth';

function authCheck(req: NextRequest) {
  return verifyAdminToken(req.cookies.get('pa_admin')?.value);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { id } = await params;
    const { name, email, password, is_active = true } = await req.json();
    if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

    let res;
    if (password?.trim()) {
      const passHash = await hashPassword(password.trim());
      res = await pool.query(
        `UPDATE adv_media_buyers SET name=$1, email=$2, password_hash=$3, is_active=$4, updated_at=NOW()
         WHERE id=$5
         RETURNING id, name, email, is_active, created_at, (password_hash IS NOT NULL) AS has_password`,
        [name.trim(), email?.trim() || null, passHash, is_active, id],
      );
    } else {
      res = await pool.query(
        `UPDATE adv_media_buyers SET name=$1, email=$2, is_active=$3, updated_at=NOW()
         WHERE id=$4
         RETURNING id, name, email, is_active, created_at, (password_hash IS NOT NULL) AS has_password`,
        [name.trim(), email?.trim() || null, is_active, id],
      );
    }

    if (res.rowCount === 0) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ success: false, message: 'Email already in use' }, { status: 409 });
    }
    console.error('mediabuyers PUT error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { id } = await params;

    const pixelCount = await pool.query(`SELECT COUNT(*) FROM adv_pixels WHERE media_buyer_id = $1`, [id]);
    if (parseInt(pixelCount.rows[0].count) > 0) {
      return NextResponse.json({ success: false, message: 'Cannot delete: media buyer has pixels configured' }, { status: 409 });
    }

    const res = await pool.query(`DELETE FROM adv_media_buyers WHERE id=$1 RETURNING id`, [id]);
    if (res.rowCount === 0) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('mediabuyers DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
