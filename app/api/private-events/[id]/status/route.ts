import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { ThreadStatus } from '@/lib/types';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = params;
    const body = await req.json();
    const { status } = body;

    if (!status || !['TO_ANSWER', 'ANSWERED', 'CONSULTATION_PLANNED', 'GO', 'NO_GO', 'ARCHIVE'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updateData: any = {
      status: status as ThreadStatus,
      updated_at: new Date().toISOString(),
    };

    // If status is ARCHIVE, set archived_at
    if (status === 'ARCHIVE') {
      updateData.archived_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('private_event_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error updating status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
