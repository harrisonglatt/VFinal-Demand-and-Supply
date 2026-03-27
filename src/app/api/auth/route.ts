import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SITE_PASSWORD = process.env.SITE_PASSWORD ?? '';
const COOKIE_NAME = 'auth_token';
const TOKEN_VALUE = 'authenticated';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = body?.password ?? '';

  if (!SITE_PASSWORD) {
    return NextResponse.json({ error: 'SITE_PASSWORD not configured' }, { status: 500 });
  }

  if (password !== SITE_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(COOKIE_NAME, TOKEN_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
