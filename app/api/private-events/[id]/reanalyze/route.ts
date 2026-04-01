import { supabaseAdmin } from '@/lib/supabase';
import { extractEventDataFromThread } from '@/lib/anthropic';

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

    // Get ALL messages for the thread (not just first inbound)
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('direction, from_name, from_email, date, body_plain, body_html, snippet')
      .eq('thread_id', event.id)
      .order('date', { ascending: true });

    if (messagesError || !messages || messages.length === 0) {
      return Response.json({ error: 'No messages found' }, { status: 404 });
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const extracted = await extractEventDataFromThread(messages, today);

      // Determine final status
      let finalStatus = extracted.statusHint || 'TO_ANSWER';
      const validStatuses = ['TO_ANSWER', 'ANSWERED', 'CONSULTATION_PLANNED', 'GO', 'NO_GO', 'ARCHIVE'];
      if (!validStatuses.includes(finalStatus)) finalStatus = 'TO_ANSWER';

      // Auto-archive if event date is in the past
      if (extracted.eventDate && extracted.eventDate < today) {
        finalStatus = 'ARCHIVE';
      }

      // Determine sender_email (prefer real customer email)
      const ignoredEmails = ['noreply@framer.com', 'notifications@forms.elfsightmail.com', 'info@cafedeheeren.nl'];
      let senderEmail = event.sender_email;
      if (extracted.senderEmail && !ignoredEmails.includes(extracted.senderEmail.toLowerCase())) {
        senderEmail = extracted.senderEmail;
      }

      const { data, error } = await supabaseAdmin
        .from('private_event_requests')
        .update({
          sender_name: extracted.senderName || event.sender_name,
          sender_email: senderEmail,
          occasion_type: extracted.occasionType,
          event_date: extracted.eventDate,
          start_time: extracted.startTime,
          end_time: extracted.endTime,
          guest_count: extracted.guestCount,
          special_notes: extracted.specialNotes,
          ai_summary: extracted.aiSummary,
          status: finalStatus,
          archived_at: finalStatus === 'ARCHIVE' ? new Date().toISOString() : null,
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
