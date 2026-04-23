import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Undo the split-framer-threads run: deletes every private_event_requests row
 * whose gmail_thread_id contains a ':' (i.e. synthetic secondary rows created
 * by the split endpoint) and their associated messages.
 */
export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: syntheticRows } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, gmail_thread_id')
    .like('gmail_thread_id', '%:%');

  if (!syntheticRows || syntheticRows.length === 0) {
    return NextResponse.json({ success: true, deletedCount: 0 });
  }

  const ids = syntheticRows.map(r => r.id);

  // Delete messages first (in case no FK cascade).
  await supabaseAdmin.from('messages').delete().in('thread_id', ids);

  const { error } = await supabaseAdmin
    .from('private_event_requests')
    .delete()
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deletedCount: ids.length,
    deleted: syntheticRows.map(r => r.gmail_thread_id),
  });
}
