import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Merge two specific event cards into one.
 *
 * Body: { keepId: string, removeId: string, confirm?: boolean }
 *
 * Steps when applying:
 *  1. Re-point every existing message from removeId → keepId.
 *  2. Re-point any merged_threads rows that previously pointed to removeId
 *     (because removeId was itself a keeper for an even older merge).
 *  3. Insert a new merged_threads row mapping removeId's gmail_thread_id
 *     to keepId, so the next Gmail sync recognises the thread.
 *  4. Delete the removeId event row.
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
      gmail_thread_id: keep.gmail_thread_id,
    },
    remove: {
      id: remove.id,
      sender_name: remove.sender_name,
      sender_email: remove.sender_email,
      event_date: remove.event_date,
      status: remove.status,
      gmail_thread_id: remove.gmail_thread_id,
    },
    messagesToMove: messagesToMove?.length || 0,
  };

  if (!confirm) {
    return NextResponse.json({ dryRun: true, plan, note: 'Pass confirm: true to apply.' });
  }

  // 1. Re-point messages
  const { error: msgError } = await supabaseAdmin
    .from('messages')
    .update({ thread_id: keepId })
    .eq('thread_id', removeId);
  if (msgError) {
    return NextResponse.json({ error: 'Failed to move messages', details: msgError.message }, { status: 500 });
  }

  // 2. Re-point any merged_threads rows that pointed to remove
  const { error: rePointError } = await supabaseAdmin
    .from('merged_threads')
    .update({ keeper_id: keepId })
    .eq('keeper_id', removeId);
  if (rePointError) {
    console.warn('[MERGE] Could not re-point existing merged_threads:', rePointError.message);
  }

  // 3. Insert new mapping for remove's gmail_thread_id (upsert in case it exists)
  const { error: mappingError } = await supabaseAdmin
    .from('merged_threads')
    .upsert(
      { gmail_thread_id: remove.gmail_thread_id, keeper_id: keepId },
      { onConflict: 'gmail_thread_id' }
    );
  if (mappingError) {
    return NextResponse.json({
      error: 'Failed to record merge mapping',
      details: mappingError.message,
      hint: 'Did you run the merged_threads table SQL?',
    }, { status: 500 });
  }

  // 4. Delete the duplicate row
  const { error: deleteError } = await supabaseAdmin
    .from('private_event_requests')
    .delete()
    .eq('id', removeId);
  if (deleteError) {
    return NextResponse.json({
      error: 'Failed to delete duplicate (messages already moved, mapping created)',
      details: deleteError.message,
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    keptId: keepId,
    removedId: removeId,
    messagesMoved: plan.messagesToMove,
    mappingStored: remove.gmail_thread_id,
  });
}
