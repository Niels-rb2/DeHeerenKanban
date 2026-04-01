import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { extractEventDataFromThread } from '@/lib/anthropic';

export const maxDuration = 300; // 5 min timeout

export async function POST() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all events without ai_summary (not yet extracted)
    const { data: events, error } = await supabaseAdmin
      .from('private_event_requests')
      .select('id, sender_name, sender_email')
      .is('ai_summary', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!events || events.length === 0) {
      return NextResponse.json({ success: true, extracted: 0, message: 'No events to extract' });
    }

    let extracted = 0;
    const errors: string[] = [];
    const ignoredEmails = ['noreply@framer.com', 'notifications@forms.elfsightmail.com', 'info@cafedeheeren.nl'];

    for (const event of events) {
      try {
        // Get ALL messages for this event
        const { data: messages } = await supabaseAdmin
          .from('messages')
          .select('direction, from_name, from_email, date, body_plain, body_html, snippet')
          .eq('thread_id', event.id)
          .order('date', { ascending: true });

        if (!messages || messages.length === 0) continue;

        // Full-thread extraction
        const data = await extractEventDataFromThread(messages, today);

        // Determine final status
        let finalStatus = data.statusHint || 'TO_ANSWER';
        const validStatuses = ['TO_ANSWER', 'ANSWERED', 'CONSULTATION_PLANNED', 'GO', 'NO_GO', 'ARCHIVE'];
        if (!validStatuses.includes(finalStatus)) finalStatus = 'TO_ANSWER';

        if (data.eventDate && data.eventDate < today) {
          finalStatus = 'ARCHIVE';
        }

        // Determine sender_email
        let senderEmail = event.sender_email;
        if (data.senderEmail && !ignoredEmails.includes(data.senderEmail.toLowerCase())) {
          senderEmail = data.senderEmail;
        }

        const { error: updateError } = await supabaseAdmin
          .from('private_event_requests')
          .update({
            sender_name: data.senderName || event.sender_name,
            sender_email: senderEmail,
            occasion_type: data.occasionType,
            event_date: data.eventDate,
            start_time: data.startTime,
            end_time: data.endTime,
            guest_count: typeof data.guestCount === 'number' ? data.guestCount : null,
            special_notes: data.specialNotes,
            ai_summary: data.aiSummary,
            status: finalStatus,
            archived_at: finalStatus === 'ARCHIVE' ? new Date().toISOString() : null,
          })
          .eq('id', event.id);

        if (updateError) {
          errors.push(`${event.sender_name}: ${updateError.message}`);
        } else {
          extracted++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${event.sender_name}: ${message}`);
      }
    }

    return NextResponse.json({
      success: true,
      total: events.length,
      extracted,
      errors: errors.slice(0, 10),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
