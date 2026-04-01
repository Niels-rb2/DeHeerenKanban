import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Move all events with event_date in the past to ARCHIVE
    // (but only if they're not already archived)
    const { data, error } = await supabaseAdmin
      .from('private_event_requests')
      .update({
        status: 'ARCHIVE',
        archived_at: new Date().toISOString(),
      })
      .lt('event_date', today)
      .neq('status', 'ARCHIVE')
      .not('event_date', 'is', null)
      .select('id, sender_name, event_date');

    if (error) throw error;

    return Response.json({
      success: true,
      archived: data?.length || 0,
      events: data,
    });
  } catch (error: any) {
    console.error('Archive error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
