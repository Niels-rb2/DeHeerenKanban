import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { extractEventDataFromEmail } from '@/lib/anthropic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = params;

    // Get event request
    const { data: event, error: eventError } = await supabaseAdmin
      .from('private_event_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get first inbound message to re-analyze
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', id)
      .eq('direction', 'INBOUND')
      .order('date', { ascending: true })
      .limit(1);

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No inbound message found' }, { status: 400 });
    }

    const firstInbound = messages[0];
    const emailBody = firstInbound.body_plain || firstInbound.snippet || '';

    // Re-extract using AI
    const extracted = await extractEventDataFromEmail(emailBody);

    // Update event request with new extracted data
    const { data: updated, error: updateError } = await supabaseAdmin
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

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Failed to update with re-analyzed data' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error reanalyzing event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
