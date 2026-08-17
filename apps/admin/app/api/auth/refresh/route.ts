import { NextRequest, NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get('goh_refresh')?.value;
  if (!cookie) return NextResponse.json({ error: { message: 'No refresh token' } }, { status: 401 });

  const upstream = await fetch(`${API}/admin/auth/refresh`, {
    method: 'POST',
    headers: { cookie: `goh_refresh=${cookie}` },
  });
  const data = await upstream.json();

  const response = NextResponse.json(data, { status: upstream.status });
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  const refresh = setCookies.find((c) => c.startsWith('goh_refresh='));
  if (refresh) response.headers.set('set-cookie', refresh);
  return response;
}
