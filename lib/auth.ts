import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required on Vercel so NextAuth trusts the X-Forwarded-Host header
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'consent select_account',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Naam-override voor gedeelde accounts
      if (profile?.email === 'info@cafedeheeren.nl') {
        token.name = 'Suzan';
      }

      // On initial sign-in, store tokens
      if (account) {
        console.log('[AUTH JWT] Initial sign-in — account received:', {
          hasAccessToken: !!account.access_token,
          hasRefreshToken: !!account.refresh_token,
          expiresAt: account.expires_at,
          scope: account.scope,
          provider: account.provider,
        });
        token.accessToken = account.access_token;
        // Persist existing refresh token if Google didn't send a new one
        // (happens if user re-auths without revoking)
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at;
        return token;
      }

      // If token hasn't expired yet, return as-is
      if (typeof token.expiresAt === 'number' && Date.now() < token.expiresAt * 1000) {
        return token;
      }

      // Token expired — refresh it
      if (!token.refreshToken) {
        console.error('No refresh token available, user must re-login');
        return { ...token, error: 'RefreshTokenMissing' };
      }

      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken as string,
          }),
        });

        const refreshed = await response.json();

        if (!response.ok) {
          console.error('Failed to refresh token:', refreshed);
          return { ...token, error: 'RefreshTokenError' };
        }

        console.log('OAuth token refreshed successfully');

        return {
          ...token,
          accessToken: refreshed.access_token,
          expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
          // Keep existing refresh token if Google didn't send a new one
          refreshToken: refreshed.refresh_token ?? token.refreshToken,
        };
      } catch (error) {
        console.error('Error refreshing token:', error);
        return { ...token, error: 'RefreshTokenError' };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.AUTH_SECRET,
});
