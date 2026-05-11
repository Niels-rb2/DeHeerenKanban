import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Merge two specific event cards into one.
 *
 * Body: { keepId: string, removeId: string, confirm?: boolean }
 *  - keepId: the card that stays (its manual edits and status are preserved)
 *  - removeId: the card whose messages move to keepId, then it gets deleted
 *
 * Default is dry-run unless confirm: true is passed.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const keepId: string | undefined = body.keepId;
  const removeId: string | undefined = body.removeId;
  const confirm: boolean = body.confirm === true;

  if (!keepId || !removeId) {
    return NextResponse.json({ error: 'Missing keepId or removeId' }, { status: 400 });
  }
  if (keepId === removeId) {
    return NextResponse.json({ error: 'keepId and removeId must differ' }, { status: 400 });
  }

  const { data: rows, error: findError } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, sender_name, sender_email, event_date, status, created_at, gmail_thread_id')
    .in('id', [keepId, removeId]);

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  const keep = rows?.find(r => r.id === keepId);
  const remove = rows?.find(r => r.id === removeId);

  if (!keep || !remove) {
    return NextResponse.json({
      error: 'One or both cards not found',
      foundIds: (rows || []).map(r => r.id),
    }, { status: 404 });
  }

  const { data: messagesToMove } = await supabaseAdmin
    .from('messages')
    .select('id, gmail_message_id, from_email, date, snippet')
    .eq('thread_id', removeId);

  const plan = {
    keep: {
      id: keep.id,
      sender_name: keep.sender_name,
      sender_email: keep.sender_email,
      event_date: keep.event_date,
      status: keep.status,
    },
    remove: {
      id: remove.id,
      sender_name: remove.sender_name,
      sender_email: remove.sender_email,
      event_date: remove.event_date,
      status: remove.status,
    },
    messagesToMove: messagesToMove?.length || 0,
    messagesPreview: (messagesToMove || []).slice(0, 10).map(m => ({
      from_email: m.from_email,
      date: m.date,
      snippet: m.snippet?.slice(0, 100),
    })),
  };

  if (!confirm) {
    return NextResponse.json({ dryRun: true, plan, note: 'Pass confirm: true to apply.' });
  }

  const { error: msgError } = await supabaseAdmin
    .from('messages')
    .update({ thread_id: keepId })
    .eq('thread_id', removeId);

  if (msgError) {
    return NextResponse.json({
      error: 'Failed to move messages',
      details: msgError.message,
    }, { status: 500 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from('private_event_requests')
    .delete()
    .eq('id', removeId);

  if (deleteError) {
    return NextResponse.json({
      error: 'Failed to delete duplicate (messages already moved)',
      details: deleteError.message,
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    keptId: keepId,
    removedId: removeId,
    messagesMoved: plan.messagesToMove,
  });
}
