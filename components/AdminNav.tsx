'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { RefreshCw, Settings, Moon, Sun, Search, X, LogOut } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useSearch } from '@/lib/search-context';
const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function AdminNavInner() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { query, setQuery } = useSearch();
  const [syncing, setSyncing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  async function handleSync() {
    if (isDemo) {
      toast.info('Sync niet beschikbaar in demo-modus');
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const parts = [`${data.synced} gesprekken gesynchroniseerd`];
        if (data.autoArchived > 0) parts.push(`${data.autoArchived} automatisch gearchiveerd`);
        toast.success(parts.join(' · '));
        window.dispatchEvent(new Event('gmail-sync-complete'));
        router.refresh();
      } else {
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error || 'Sync mislukt');
        toast.error(msg);
        // If Google auth is expired, force a full sign-out so user can re-auth
        if (data.needsReauth) {
          setTimeout(() => {
            window.location.href = '/api/auth/signout';
          }, 2000);
        }
      }
    } catch {
      toast.error('Sync mislukt');
    } finally {
      setSyncing(false);
    }
  }

  const onDashboard = pathname === '/dashboard';
  const onSettingsPage = pathname === '/dashboard/settings';
  const onDetailPage = !onSettingsPage && (pathname.startsWith('/thread/') || /^\/dashboard\/[\w-]+$/.test(pathname));

  if (onDetailPage) return null;

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ backgroundColor: 'var(--clr-bg)', borderColor: 'var(--clr-outline)' }}
    >
      {/* Row 1: Logo + (desktop: search) + action buttons */}
      <div className="flex items-center gap-2 px-4 py-3 md:px-6">
        {/* Logo */}
        <Link href="/dashboard" aria-label="Café De Heeren – home" className="shrink-0 w-[120px] h-[48px] md:w-[160px] md:h-[64px] block">
          <Image src="/logo.svg" alt="Café De Heeren" width={160} height={64} priority className="w-full h-full object-contain" />
        </Link>

        {/* Desktop search — gecentreerd tussen logo en knoppen */}
        {onDashboard ? (
          <div className="hidden md:flex flex-1 justify-center">
            <div className="relative flex w-full max-w-sm items-center">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--clr-text-subtle)' }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op naam of datum…"
                className="w-full pl-8 pr-8 py-2 rounded-full text-sm border focus:outline-none focus:ring-2 transition-all"
                style={{
                  background: 'var(--clr-surface-low)',
                  borderColor: 'var(--clr-outline)',
                  color: 'var(--clr-text)',
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition-colors cursor-pointer"
                  style={{ color: 'var(--clr-text-muted)', background: 'var(--clr-surface-variant)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-muted)'; }}
                  aria-label="Zoekopdracht wissen"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Spacer wanneer geen zoekveld */
          <div className="flex-1" />
        )}

        {/* Mobiel spacer — op desktop neemt het zoekveld flex-1 in */}
        {onDashboard && <div className="flex-1 md:hidden" />}

        {/* Action buttons — rechts uitgelijnd */}
        {onDashboard && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-accent flex items-center gap-2 text-sm py-2 px-3 md:px-4"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{syncing ? 'Synchroniseren…' : 'Gmail Sync'}</span>
          </button>
        )}

        {!onDetailPage && <>
          <a
            href="https://www.bijcafedeheeren.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-icon-btn group relative"
            aria-label="Dashboard"
          >
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
              <path d="M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48Z" />
            </svg>
            <span className="nav-tooltip">Dashboard</span>
          </a>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="nav-icon-btn group relative"
            aria-label={mounted && theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {mounted && theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span className="nav-tooltip">{mounted && theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <Link
            href="/dashboard/settings"
            className="nav-icon-btn group relative"
            data-active={pathname === '/dashboard/settings' ? 'true' : undefined}
            aria-label="Instellingen"
          >
            <Settings size={15} />
            <span className="nav-tooltip">Instellingen</span>
          </Link>
          <a
            href="/api/auth/logout"
            className="nav-icon-btn group relative"
            aria-label="Uitloggen"
          >
            <LogOut size={15} />
            <span className="nav-tooltip">Uitloggen</span>
          </a>
        </>}
      </div>

      {/* Row 2: Mobile-only search bar — volledige breedte */}
      {onDashboard && (
        <div className="px-4 pb-3 md:hidden">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--clr-text-subtle)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam of datum…"
              className="w-full pl-8 pr-8 py-2 rounded-full text-sm border focus:outline-none focus:ring-2 transition-all"
              style={{
                background: 'var(--clr-surface-low)',
                borderColor: 'var(--clr-outline)',
                color: 'var(--clr-text)',
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition-colors cursor-pointer"
                style={{ color: 'var(--clr-text-muted)', background: 'var(--clr-surface-variant)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-muted)'; }}
                aria-label="Zoekopdracht wissen"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function AdminNav() {
  return <AdminNavInner />;
}
