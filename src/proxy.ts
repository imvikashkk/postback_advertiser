import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const adminToken = req.cookies.get('pa_admin')?.value;
  const mbToken = req.cookies.get('pa_mb_token')?.value;

  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin_auth')) {
      if (adminToken) return NextResponse.redirect(new URL('/admin/postbacks', req.url));
      return NextResponse.next();
    }
    if (!adminToken) return NextResponse.redirect(new URL('/admin_auth', req.url));
    return NextResponse.next();
  }

  if (pathname.startsWith('/mediabuyer')) {
    if (pathname.startsWith('/mediabuyer/login')) {
      if (mbToken) return NextResponse.redirect(new URL('/mediabuyer', req.url));
      return NextResponse.next();
    }
    if (!mbToken) return NextResponse.redirect(new URL('/mediabuyer/login', req.url));
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|go|api).*)'],
};
