import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { PrivateEventRequest, ThreadStatus } from '@/lib/types';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    (data || []).forEach(request => {
      const status = request.status as ThreadStatus;
      if (grouped[status]) {
        grouped[status].push(request);
      }
    });

    return NextResponse.json({ success: true, data: grouped });
  } catch (error: any) {
    console.error('Error fetching private events:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
