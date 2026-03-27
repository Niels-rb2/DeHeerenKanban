import { supabaseAdmin } from '@/lib/supabase';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Demo mode dummy data
const demoDummyEvents = {
  '1': {
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
  '2': {
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
  '3': {
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
};

const demoDummyMessages = {
  'thread-1': [
    {
      id: 'msg-1',
      thread_id: 'thread-1',
      from_name: 'Jan Jansen',
      from_email: 'jan@example.com',
      subject: 'Verjaardagsfeest op 10 april',
      body: 'Hallo, ik wil graag een verjaardagsfeest organiseren op 10 april voor ongeveer 30 personen. Graag vegetarisch menu.',
      date: new Date().toISOString(),
      direction: 'INBOUND',
    },
  ],
  'thread-2': [
    {
      id: 'msg-2',
      thread_id: 'thread-2',
      from_name: 'Maria Rodriguez',
      from_email: 'maria@example.com',
      subject: 'Receptie voor 50 personen',
      body: 'Goedemorgen, we zoeken catering voor een receptie op 17 april voor 50 personen.',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      direction: 'INBOUND',
    },
    {
      id: 'msg-2-reply',
      thread_id: 'thread-2',
      from_name: 'Café De Heeren',
      from_email: 'info@cafedeheeren.nl',
      subject: 'Re: Receptie voor 50 personen',
      body: 'Hartelijk dank voor uw aanvraag. We hebben u per e-mail meer informatie gestuurd.',
      date: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
      direction: 'OUTBOUND',
    },
  ],
  'thread-3': [
    {
      id: 'msg-3',
      thread_id: 'thread-3',
      from_name: 'Peter Wilders',
      from_email: 'peter@example.com',
      subject: 'Bedrijfsdiner 3 april',
      body: 'Hallo, we willen graag een diner organiseren op 3 april voor 12 personen. Iedereen eet glutenvrij.',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      direction: 'INBOUND',
    },
  ],
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Handle demo mode
  if (isDemo) {
    const event = demoDummyEvents[id as keyof typeof demoDummyEvents];
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }
    return Response.json({
      data: {
        ...event,
        messages: demoDummyMessages[event.gmail_thread_id as keyof typeof demoDummyMessages] || [],
      },
    });
  }

  try {
    const { data: event, error: eventError } = await supabaseAdmin
      .from('private_event_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    // Fetch messages for this event
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', event.gmail_thread_id)
      .order('date', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
    }

    return Response.json({
      data: {
        ...event,
        messages: messages || [],
      },
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    return Response.json(
      { error: 'Failed to fetch event' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();

    // In demo mode, just return success (don't actually update)
    if (isDemo) {
      return Response.json({ success: true });
    }

    const { data, error } = await supabaseAdmin
      .from('private_event_requests')
      .update({
        event_date: body.event_date,
        occasion_type: body.occasion_type,
        start_time: body.start_time,
        end_time: body.end_time,
        guest_count: body.guest_count,
        special_notes: body.special_notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error updating event:', error);
    return Response.json(
      { error: 'Failed to update event' },
      { status: 500 }
    );
  }
}
