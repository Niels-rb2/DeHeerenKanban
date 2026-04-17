import { NextRequest, NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // Use NextAuth's signOut to properly clear session + cookies
  try {
    await signOut({ redirect: false });
  } catch (e) {
    console.error('[LOGOUT] signOut error:', e);
  }

  // Build redirect URL from the request origin (works on any host)
  const loginUrl = new URL('/login', req.nextUrl.origin);
  const response = NextResponse.redirect(loginUrl);

  // Belt-and-suspenders: also clear cookies manually in case signOut missed any
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
    'de-heeren-session',
    '__Secure-de-heeren-session',
  ];
  for (const name of cookiesToDelete) {
    response.cookies.delete(name);
  }

  return response;
}
