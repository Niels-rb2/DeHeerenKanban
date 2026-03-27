import { supabaseAdmin } from '@/lib/supabase';
import { ThreadStatus } from '@/lib/types';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = await request.json();

  // Validate status
  const validStatuses: ThreadStatus[] = [
    'TO_ANSWER',
    'ANSWERED',
    'CONSULTATION_PLANNED',
    'GO',
    'NO_GO',
    'ARCHIVE',
  ];

  if (!validStatuses.includes(status)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 });
  }

  try {
    const updateData: any = { status };

    // Set archived_at if moving to ARCHIVE
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
      return Response.json({ error: 'Failed to update status' }, { status: 500 });
    }

    return Response.json({ data });
  } catch (error) {
    console.error('Error updating status:', error);
    return Response.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}
