import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { extractAppointmentFromThread } from '@/lib/extract';

export async function POST(req: NextRequest) {
  const { threadId } = await req.json();

  if (!threadId) {
    return NextResponse.json({ error: 'threadId required' }, { status: 400 });
  }

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('date', { ascending: true });

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'No messages found' }, { status: 404 });
  }

  const result = await extractAppointmentFromThread(messages);

  // Update thread with extraction results
  const updateData: any = {
    extracted_appointment_json: result,
    updated_at: new Date().toISOString(),
  };

  if (result.confidence > 0.7) {
    updateData.status = result.statusHint;
    updateData.conversion = result.hasAppointment && result.statusHint === 'APPOINTMENT_SET';
  }

  await supabaseAdmin.from('threads').update(updateData).eq('id', threadId);

  return NextResponse.json(result);
}
