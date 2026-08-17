import { NextRequest, NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get('goh_refresh')?.value;
  if (cookie) {
    await fetch(`${API}/admin/auth/logout`, {
      method: 'POST',
      headers: { cookie: `goh_refresh=${cookie}` },
    });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set('set-cookie', 'goh_refresh=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  return response;
}
