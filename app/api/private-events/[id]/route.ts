import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

    // Get messages for this event
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', id)
      .order('date', { ascending: true });

    if (messagesError) throw messagesError;

    return NextResponse.json({
      success: true,
      data: {
        ...event,
        messages: messages || [],
      },
    });
  } catch (error: any) {
    console.error('Error fetching private event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
