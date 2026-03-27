import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
