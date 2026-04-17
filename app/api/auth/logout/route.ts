import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Build redirect URL from the current request (works on any host)
  const loginUrl = new URL('/login', req.nextUrl.origin);
  const response = NextResponse.redirect(loginUrl);

  // Delete NextAuth session cookies (modern + legacy)
  const cookiesToDelete = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'authjs.callback-url',
    'authjs.csrf-token',
    '__Secure-authjs.callback-url',
    '__Host-authjs.csrf-token',
    '__Secure-authjs.csrf-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.callback-url',
    'next-auth.csrf-token',
    // Legacy custom cookie from old auth config
    'de-heeren-session',
    '__Secure-de-heeren-session',
  ];
  for (const name of cookiesToDelete) {
    response.cookies.delete(name);
  }

  return response;
}
