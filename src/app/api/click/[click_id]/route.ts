import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// Fired from the /go/ bridge page once the Meta pixel has set its cookies,
// so we have real _fbp/_fbc to match on when the advertiser's postback arrives later.
export async function POST(req: NextRequest, { params }: { params: Promise<{ click_id: string }> }) {
  try {
    const { click_id } = await params;
    const { fbp, fbc } = await req.json();
    if (!fbp && !fbc) return NextResponse.json({ success: true });

    const patch: Record<string, string> = {};
    if (fbp) patch.fbp = fbp;
    if (fbc) patch.fbc = fbc;

    await pool.query(
      `UPDATE adv_clicks SET meta = COALESCE(meta, '{}'::jsonb) || $1::jsonb WHERE click_id = $2`,
      [JSON.stringify(patch), click_id],
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('click patch error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
