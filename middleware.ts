import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const session = await auth();
  const pathname = request.nextUrl.pathname;

  // Protect /private-events routes
  if (pathname.startsWith('/private-events') || pathname.startsWith('/api/private-events')) {
    if (!session?.user) {
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
