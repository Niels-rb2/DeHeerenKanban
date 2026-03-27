'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ synced?: number; error?: string } | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' });
      const data = await res.json();
      setResult(data);
      if (res.ok) {
        toast.success(`${data.synced} gesprekken gesynchroniseerd`);
      } else {
        toast.error(data.error || 'Sync mislukt');
      }
    } catch (e) {
      toast.error('Sync mislukt');
      setResult({ error: 'Verbindingsfout' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--clr-text)' }}>
        Gmail Synchronisatie
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--clr-text-muted)' }}>
        Synchroniseer e-mails met het label "Besloten feestje" vanuit Gmail naar de database.
      </p>

      <div className="bento-card rounded-2xl mb-6">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--clr-text)' }}>
          Hoe werkt het?
        </h2>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--clr-text-dim)' }}>
          <li className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--clr-accent)' }} />
            Alle e-mails met het Gmail-label <strong>"Besloten feestje"</strong> worden opgehaald
          </li>
          <li className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--clr-accent)' }} />
            Nieuwe gesprekken worden toegevoegd aan de database
          </li>
          <li className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--clr-accent)' }} />
            Bestaande gesprekken worden bijgewerkt (status blijft bewaard)
          </li>
          <li className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--clr-accent)' }} />
            AI extractie wordt niet automatisch uitgevoerd – doe dit per gesprek
          </li>
        </ul>
      </div>

      <button
        onClick={handleSync}
        disabled={syncing}
        className="btn-accent flex items-center gap-3 text-base mb-6"
      >
        <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Synchroniseren...' : 'Start Gmail Sync'}
      </button>

      {result && (
        <div
          className={`flex items-center gap-3 p-4 rounded-2xl text-sm ${
            result.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {result.error ? (
            <>
              <AlertCircle size={16} />
              <span>Fout: {result.error}</span>
            </>
          ) : (
            <>
              <CheckCircle size={16} />
              <span>{result.synced} gesprekken succesvol gesynchroniseerd</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
