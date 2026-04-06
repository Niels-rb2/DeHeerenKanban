import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function proxy(request: NextRequest) {
  return auth((req) => {
    // Skip protection in demo mode
    if (isDemo) return NextResponse.next();

    const pathname = req.nextUrl.pathname;

    // req.auth is set by the auth() wrapper
    if (!req.auth?.user) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', req.url));
    }

    return NextResponse.next();
  })(request, {} as any);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/private-events/:path*',
    '/api/gmail/:path*',
  ],
};
