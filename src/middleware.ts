import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'auth_token';
const TOKEN_VALUE = 'authenticated';

export function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (token === TOKEN_VALUE) {
    return NextResponse.next();
  }

  const signInUrl = new URL('/sign-in', req.url);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    '/((?!sign-in|api/auth|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
