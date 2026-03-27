'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Thread, KPIStats } from '@/lib/types';
import { StatsBar } from '@/components/StatsBar';
import { KanbanBoard } from '@/components/KanbanBoard';
import { DEMO_THREADS } from '@/lib/demo-data';
import { toast } from 'sonner';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Goedemorgen';
  if (hour < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const search = searchParams.get('q') ?? '';

  const [threads, setThreads] = useState<Thread[]>([]);
  const [stats, setStats] = useState<KPIStats>({ total: 0, todoReply: 0, appointmentSet: 0, conversionRate: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);

  const computeStats = useCallback((data: Thread[]): KPIStats => {
    const total = data.length;
    const todoReply = data.filter(t => t.status === 'TODO_REPLY').length;
    const appointmentSet = data.filter(t => t.status === 'APPOINTMENT_SET').length;
    const cancelled = data.filter(t => t.status === 'CANCELLED').length;
    const conversionRate = total > 0 ? Math.round((appointmentSet / total) * 100) : 0;
    return { total, todoReply, appointmentSet, conversionRate, cancelled };
  }, []);

  const fetchThreads = useCallback(async () => {
    if (isDemo) {
      let filtered = [...DEMO_THREADS];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(t =>
          t.contact_name?.toLowerCase().includes(s) ||
          t.contact_email.toLowerCase().includes(s) ||
          t.subject.toLowerCase().includes(s)
        );
      }
      setThreads(filtered);
      setStats(computeStats(DEMO_THREADS));
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const [threadsRes, statsRes] = await Promise.all([
        fetch(`/api/threads?${params}`),
        fetch('/api/stats'),
      ]);
      if (threadsRes.ok) setThreads(await threadsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {
      toast.error('Kon gesprekken niet laden');
    } finally {
      setLoading(false);
    }
  }, [search, computeStats]);

  useEffect(() => {
    fetchThreads();
    const interval = setInterval(fetchThreads, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchThreads]);

  return (
    <div>
      {/* Paginatitel */}
      <div className="mb-6 mt-4">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <p className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--clr-text-muted)' }}>
            Aanvragen Feestjes
          </p>
          {isDemo && (
            <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Demo
            </span>
          )}
        </div>
        <h1
          className="text-2xl md:text-[2.5rem] font-medium leading-none"
          style={{ color: 'var(--clr-text)' }}
        >
          {getGreeting()} Suzan
        </h1>
      </div>

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Kanban board */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="kanban-column rounded-2xl animate-pulse shrink-0"
              style={{ background: 'var(--clr-surface-low)', height: 400, width: 'calc(20% - 13px)', minWidth: '240px' }}
            />
          ))}
        </div>
      ) : (
        <KanbanBoard threads={threads} />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex gap-4 overflow-x-auto pb-4 mt-8">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="kanban-column rounded-2xl animate-pulse shrink-0"
            style={{ background: 'var(--clr-surface-low)', height: 400, width: 'calc(20% - 13px)', minWidth: '240px' }}
          />
        ))}
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
