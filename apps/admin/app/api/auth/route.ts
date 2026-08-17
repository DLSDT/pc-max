import { NextRequest, NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 });

  const upstream = await fetch(`${API}/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  // Relay the httpOnly refresh cookie set by the API onto our response.
  const response = NextResponse.json(data);
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  const refresh = setCookies.find((c) => c.startsWith('goh_refresh='));
  if (refresh) response.headers.set('set-cookie', refresh);
  return response;
}
