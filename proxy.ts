import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Export the NextAuth auth() middleware directly so cookies are managed
// correctly (setting the session cookie, refreshing tokens, etc.).
export default auth((req) => {
  // Skip protection in demo mode
  if (isDemo) return NextResponse.next();

  const pathname = req.nextUrl.pathname;

  if (!req.auth?.user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/private-events/:path*',
    '/api/gmail/:path*',
  ],
};
