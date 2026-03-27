import { supabaseAdmin } from '@/lib/supabase';
import { PrivateEventRequest, ThreadStatus } from '@/lib/types';

export async function GET(request: Request) {
  try {
    const { data, error } = await supabaseAdmin
      .from('private_event_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by status
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
