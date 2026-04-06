import { supabaseAdmin } from '@/lib/supabase';
import { PrivateEventRequest, ThreadStatus } from '@/lib/types';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Demo mode dummy events
const demoDummyEvents: PrivateEventRequest[] = [
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
    status: 'TO_ANSWER' as ThreadStatus,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
  },
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
    status: 'ANSWERED' as ThreadStatus,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
  },
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
    status: 'GO' as ThreadStatus,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
  },
];

export async function GET(request: Request) {
  // Handle demo mode
  if (isDemo) {
    const grouped: Record<ThreadStatus, PrivateEventRequest[]> = {
      TO_ANSWER: [],
      ANSWERED: [],
      CONSULTATION_PLANNED: [],
      GO: [],
      NO_GO: [],
      ARCHIVE: [],
    };

    demoDummyEvents.forEach((event) => {
      grouped[event.status].push(event);
    });

    return Response.json({ data: grouped });
  }

  try {
    // Auto-archive events with event_date in the past
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin
      .from('private_event_requests')
      .update({ status: 'ARCHIVE', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .lt('event_date', today)
      .not('status', 'in', '("ARCHIVE","NO_GO")');

    const { data, error } = await supabaseAdmin
      .from('private_event_requests')
      .select('*')
      .neq('sender_name', '_DISMISSED')
      .order('event_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by status, sorted: soonest event_date first, nulls at end
    const grouped: Record<ThreadStatus, PrivateEventRequest[]> = {
      TO_ANSWER: [],
      ANSWERED: [],
      CONSULTATION_PLANNED: [],
      GO: [],
      NO_GO: [],
      ARCHIVE: [],
    };

    (data || []).forEach((event: any) => {
      const status = event.status as ThreadStatus;
      if (status in grouped) {
        grouped[status].push(event);
      }
    });

    return Response.json({ data: grouped });
  } catch (error) {
    console.error('Error fetching private events:', error);
    return Response.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
