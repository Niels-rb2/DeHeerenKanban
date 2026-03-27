import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export async function middleware(request: NextRequest) {
  const session = await auth();
  const pathname = request.nextUrl.pathname;

  // Protect /private-events routes (skip protection in demo mode)
  if (pathname.startsWith('/private-events') || pathname.startsWith('/api/private-events')) {
    if (!isDemo && !session?.user) {
      // Redirect to login
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/private-events/:path*', '/api/private-events/:path*'],
};
