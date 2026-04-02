import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist_Mono } from 'next/font/google';
import { AdminNav } from '@/components/AdminNav';
import { ClientToaster } from '@/components/ClientToaster';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SearchProvider } from '@/lib/search-context';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: ['800'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Café De Heeren – Feestje Dashboard',
  description: 'Beheer besloten feestje aanvragen via Gmail automatisering.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning className={`${bricolage.variable} ${geistMono.variable} light`}>
      <body suppressHydrationWarning className="antialiased min-h-screen">
        <ThemeProvider>
          <SearchProvider>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
            >
              Ga naar inhoud
            </a>

            <AdminNav />
            <main
              className="flex flex-col px-4 pb-4 md:px-6 md:pb-6 min-h-screen"
              id="main-content"
            >
              {children}
            </main>

            <ClientToaster />
          </SearchProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
