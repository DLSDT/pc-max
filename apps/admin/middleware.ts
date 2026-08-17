import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight route gate. Real authorization happens server-side in the API;
 * here we only check that a refresh cookie exists so logged-out users are
 * redirected to /login instead of seeing a broken dashboard.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get('goh_refresh')?.value);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/games/:path*',
    '/categories/:path*',
    '/tags/:path*',
    '/optimization-categories/:path*',
    '/versions/:path*',
    '/admins/:path*',
    '/audit/:path*',
  ],
};
