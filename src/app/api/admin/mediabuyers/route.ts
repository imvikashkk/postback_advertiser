import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hashPassword } from '@/lib/mbAuth';
import { verifyAdminToken } from '@/lib/adminAuth';

function authCheck(req: NextRequest) {
  return verifyAdminToken(req.cookies.get('pa_admin')?.value);
}

export async function GET(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const res = await pool.query(
      `SELECT id, name, email, is_active, created_at,
              (password_hash IS NOT NULL) AS has_password
       FROM adv_media_buyers
       ORDER BY name ASC`,
    );
    return NextResponse.json({ success: true, data: res.rows });
  } catch (err) {
    console.error('mediabuyers GET error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const { name, email, password } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
    }

    const passHash = password?.trim() ? await hashPassword(password.trim()) : null;

    const res = await pool.query(
      `INSERT INTO adv_media_buyers (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, is_active, created_at,
                 (password_hash IS NOT NULL) AS has_password`,
      [name.trim(), email?.trim() || null, passHash],
    );

    return NextResponse.json({ success: true, data: res.rows[0] }, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ success: false, message: 'Email already in use' }, { status: 409 });
    }
    console.error('mediabuyers POST error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
