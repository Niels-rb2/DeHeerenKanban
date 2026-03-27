import { supabaseAdmin } from '@/lib/supabase';
import { extractEventDataFromEmail } from '@/lib/anthropic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Get the event
    const { data: event, error: eventError } = await supabaseAdmin
      .from('private_event_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get the first inbound message
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', event.gmail_thread_id)
      .eq('direction', 'INBOUND')
      .order('date', { ascending: true })
      .limit(1);

    if (messagesError || !messages || messages.length === 0) {
      return Response.json({ error: 'No messages found' }, { status: 404 });
    }

    const firstMessage = messages[0];

    // Re-extract data
    try {
      const extracted = await extractEventDataFromEmail(firstMessage.body_plain || firstMessage.snippet || '');

      // Update event with new extracted data
      const { data, error } = await supabaseAdmin
        .from('private_event_requests')
        .update({
          occasion_type: extracted.occasionType,
          event_date: extracted.eventDate,
          start_time: extracted.startTime,
          end_time: extracted.endTime,
          guest_count: extracted.guestCount,
          special_notes: extracted.specialNotes,
          ai_summary: extracted.aiSummary,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error || !data) {
        return Response.json({ error: 'Failed to update event' }, { status: 500 });
      }

      return Response.json({ data });
    } catch (extractError) {
      console.error('AI extraction error:', extractError);
      return Response.json(
        { error: 'Failed to extract event data' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error reanalyzing event:', error);
    return Response.json(
      { error: 'Failed to reanalyze event' },
      { status: 500 }
    );
  }
}
