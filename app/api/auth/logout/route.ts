import { NextResponse } from 'next/server';

export async function GET() {
  // Clear the session cookie and redirect to login
  const response = NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL || 'http://localhost:3000'));

  // Delete NextAuth session cookies
  response.cookies.delete('authjs.session-token');
  response.cookies.delete('__Secure-authjs.session-token');
  response.cookies.delete('authjs.callback-url');
  response.cookies.delete('authjs.csrf-token');
  response.cookies.delete('__Secure-authjs.callback-url');
  response.cookies.delete('__Secure-authjs.csrf-token');
  // Also delete legacy next-auth cookies
  response.cookies.delete('next-auth.session-token');
  response.cookies.delete('__Secure-next-auth.session-token');
  response.cookies.delete('next-auth.callback-url');
  response.cookies.delete('next-auth.csrf-token');

  return response;
}
