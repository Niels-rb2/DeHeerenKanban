import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Merge another card into this one.
 *
 * URL: /api/private-events/[id]/merge   ← id is the KEEPER
 * Body: { removeId: string, confirm?: boolean }
 *
 * Moves every message from `removeId` to the keeper, then deletes the
 * removeId row. Dry-run by default unless confirm:true is passed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: keepId } = await params;
  const body = await req.json().catch(() => ({}));
  const removeId: string | undefined = body.removeId;
  const confirm: boolean = body.confirm === true;

  if (!removeId) {
    return NextResponse.json({ error: 'Missing removeId' }, { status: 400 });
  }
  if (keepId === removeId) {
    return NextResponse.json({ error: 'Cannot merge a card with itself' }, { status: 400 });
  }

  const { data: rows, error: findError } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, sender_name, sender_email, event_date, status')
    .in('id', [keepId, removeId]);

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  const keep = rows?.find(r => r.id === keepId);
  const remove = rows?.find(r => r.id === removeId);
  if (!keep || !remove) {
    return NextResponse.json({ error: 'One or both cards not found' }, { status: 404 });
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
  };

  if (!confirm) {
    return NextResponse.json({ dryRun: true, plan });
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
