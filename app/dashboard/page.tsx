'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { PrivateEventRequest, ThreadStatus } from '@/lib/types';
import { StatsBar } from '@/components/StatsBar';
import { KanbanBoard } from '@/components/KanbanBoard';
import { useSearch } from '@/lib/search-context';
import { toast } from 'sonner';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Goedemorgen';
  if (hour < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

// ─── Date search helpers ─────────────────────────────────────────────────────

const MONTH_NAMES = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const MONTH_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

function dateMatchesSearch(eventDate: string | null, query: string): boolean {
  if (!eventDate) return false;
  const d = new Date(eventDate + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  const variants = [
    eventDate,
    `${day} ${MONTH_NAMES[month]} ${year}`,
    `${day} ${MONTH_SHORT[month]} ${year}`,
    `${day} ${MONTH_NAMES[month]}`,
    `${day} ${MONTH_SHORT[month]}`,
    `${MONTH_NAMES[month]} ${year}`,
    `${MONTH_SHORT[month]} ${year}`,
    `${MONTH_NAMES[month]}`,
    `${String(day).padStart(2, '0')}-${String(month + 1).padStart(2, '0')}-${year}`,
    `${day}-${month + 1}-${year}`,
  ];
  return variants.some(v => v.toLowerCase().includes(query));
}

function filterEvents(
  allEvents: Record<ThreadStatus, PrivateEventRequest[]>,
  query: string,
): Record<ThreadStatus, PrivateEventRequest[]> {
  if (!query) return allEvents;

  const s = query.toLowerCase().trim();
  const filtered: Record<ThreadStatus, PrivateEventRequest[]> = {} as Record<ThreadStatus, PrivateEventRequest[]>;

  for (const [status, items] of Object.entries(allEvents)) {
    filtered[status as ThreadStatus] = (items as PrivateEventRequest[]).filter(e =>
      e.sender_name?.toLowerCase().includes(s) ||
      e.sender_email?.toLowerCase().includes(s) ||
      e.occasion_type?.toLowerCase().includes(s) ||
      dateMatchesSearch(e.event_date, s)
    );
  }
  return filtered;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function DashboardContent() {
  const { query } = useSearch();

  const [allEvents, setAllEvents] = useState<Record<ThreadStatus, PrivateEventRequest[]> | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtered events, recalculated instantly when search query changes
  const events = useMemo(() => {
    if (!allEvents) return null;
    return filterEvents(allEvents, query);
  }, [allEvents, query]);

  const fetchEvents = useCallback(async () => {
    if (isDemo) {
      const dummyEvents: Record<ThreadStatus, PrivateEventRequest[]> = {
        TO_ANSWER: [
          {
            id: '1',
            gmail_thread_id: 'thread-1',
            sender_name: 'Jan Jansen',
            sender_email: 'jan@example.com',
            occasion_type: 'verjaardag',
            event_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            start_time: '19:00',
            end_time: '23:00',
            guest_count: 30,
            special_notes: 'Graag vegetarisch menu',
            ai_summary: 'Verjaardagsfeest voor 30 personen op 10 april, vegetarisch',
            status: 'TO_ANSWER',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            archived_at: null,
          },
        ],
        ANSWERED: [
          {
            id: '2',
            gmail_thread_id: 'thread-2',
            sender_name: 'Maria Rodriguez',
            sender_email: 'maria@example.com',
            occasion_type: 'receptie',
            event_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
            start_time: '17:00',
            end_time: '20:00',
            guest_count: 50,
            special_notes: null,
            ai_summary: 'Receptie voor 50 personen',
            status: 'ANSWERED',
            created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
            archived_at: null,
          },
        ],
        CONSULTATION_PLANNED: [],
        GO: [
          {
            id: '3',
            gmail_thread_id: 'thread-3',
            sender_name: 'Peter Wilders',
            sender_email: 'peter@example.com',
            occasion_type: 'diner',
            event_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            start_time: '19:30',
            end_time: '22:00',
            guest_count: 12,
            special_notes: 'Alleen glutenvrij',
            ai_summary: 'Bedrijfsdiner voor 12 personen, glutenvrij',
            status: 'GO',
            created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
            archived_at: null,
          },
        ],
        NO_GO: [],
        ARCHIVE: [],
      };
      setAllEvents(dummyEvents);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/private-events');
      if (!response.ok) throw new Error('Failed to fetch events');
      const data = await response.json();
      setAllEvents(data.data);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error('Kon aanvragen niet laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5 * 60 * 1000);

    // Re-fetch when Gmail sync completes
    const onSync = () => fetchEvents();
    window.addEventListener('gmail-sync-complete', onSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('gmail-sync-complete', onSync);
    };
  }, [fetchEvents]);

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
          {getGreeting()} <span style={{ color: '#A03110' }}>Suzan</span>
        </h1>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none kanban-scroll-container">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="kanban-column kanban-col rounded-2xl animate-pulse shrink-0"
              style={{ background: 'var(--clr-surface-low)', height: 400, scrollSnapAlign: 'start' }}
            />
          ))}
        </div>
      ) : events ? (
        <KanbanBoard events={events} />
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
