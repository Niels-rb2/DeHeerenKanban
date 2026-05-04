import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Merge multiple event cards that share the same sender_email into one.
 *
 * Strategy:
 *  - Pick the OLDEST card (smallest created_at) as the "keeper" — this is
 *    the one the user has typically been editing manually.
 *  - Re-point every message from the other matching cards to the keeper.
 *  - Delete the now-empty duplicate event rows.
 *
 * Body: { email: string, confirm?: boolean }
 * Default is dry-run unless confirm: true is passed.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email: string | undefined = body.email;
  const confirm: boolean = body.confirm === true;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Find all event rows for this email (case-insensitive)
  const { data: matches, error: findError } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, sender_name, sender_email, event_date, status, created_at, gmail_thread_id')
    .ilike('sender_email', normalizedEmail)
    .order('created_at', { ascending: true });

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!matches || matches.length < 2) {
    return NextResponse.json({
      dryRun: !confirm,
      matchCount: matches?.length || 0,
      note: 'Need at least 2 cards with the same email to merge.',
      matches: matches || [],
    });
  }

  const keeper = matches[0];
  const duplicates = matches.slice(1);
  const duplicateIds = duplicates.map(d => d.id);

  // Count messages that would move
  const { data: messagesToMove } = await supabaseAdmin
    .from('messages')
    .select('id, thread_id, gmail_message_id, from_email, date, snippet')
    .in('thread_id', duplicateIds);

  const plan = {
    keep: {
      id: keeper.id,
      sender_name: keeper.sender_name,
      sender_email: keeper.sender_email,
      event_date: keeper.event_date,
      status: keeper.status,
      created_at: keeper.created_at,
    },
    remove: duplicates.map(d => ({
      id: d.id,
      sender_name: d.sender_name,
      sender_email: d.sender_email,
      event_date: d.event_date,
      status: d.status,
      created_at: d.created_at,
    })),
    messagesToMove: messagesToMove?.length || 0,
    messagesPreview: (messagesToMove || []).slice(0, 10).map(m => ({
      from_email: m.from_email,
      date: m.date,
      snippet: m.snippet?.slice(0, 100),
    })),
  };

  if (!confirm) {
    return NextResponse.json({ dryRun: true, plan, note: 'Pass confirm: true in body to apply.' });
  }

  // Apply: re-point messages, then delete duplicates
  const { error: msgError } = await supabaseAdmin
    .from('messages')
    .update({ thread_id: keeper.id })
    .in('thread_id', duplicateIds);

  if (msgError) {
    return NextResponse.json({
      error: 'Failed to re-point messages',
      details: msgError.message,
    }, { status: 500 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from('private_event_requests')
    .delete()
    .in('id', duplicateIds);

  if (deleteError) {
    return NextResponse.json({
      error: 'Failed to delete duplicates (messages already moved)',
      details: deleteError.message,
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    keptId: keeper.id,
    removedIds: duplicateIds,
    messagesMoved: plan.messagesToMove,
  });
}
