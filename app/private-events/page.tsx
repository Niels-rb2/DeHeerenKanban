'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KanbanBoard } from '@/components/KanbanBoard';
import { PrivateEventRequest, ThreadStatus } from '@/lib/types';

export default function PrivateEventsPage() {
  const [events, setEvents] = useState<Record<ThreadStatus, PrivateEventRequest[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const response = await fetch('/api/private-events');
        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }
        const data = await response.json();
        setEvents(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching events:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--clr-bg)' }}>
        <p style={{ color: 'var(--clr-text)' }}>Verzoeken laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--clr-bg)' }}>
        <div className="text-center">
          <p style={{ color: 'var(--clr-text)' }} className="mb-4">Fout: {error}</p>
          <Link href="/dashboard" style={{ color: 'var(--clr-primary)' }} className="underline">
            Terug naar dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ background: 'var(--clr-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--clr-text)' }}>
            Feestjes
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--clr-text-muted)' }}>
            Beheer verzoeken voor besloten feestjes
          </p>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-lg transition-colors"
          style={{
            background: 'var(--clr-surface)',
            color: 'var(--clr-text)',
          }}
        >
          ← Dashboard
        </Link>
      </div>

      {/* Kanban Board */}
      {events && <KanbanBoard events={events} />}
    </div>
  );
}
