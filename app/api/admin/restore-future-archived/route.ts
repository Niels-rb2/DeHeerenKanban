import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Restore rows that were incorrectly archived by yesterday's broken sync:
 *   - status = ARCHIVE
 *   - archived_at between yesterday 00:00 UTC and today 00:00 UTC
 *   - event_date in the future (so we know it was a real upcoming party)
 *
 * By default returns a dry-run list. Pass ?confirm=true to actually flip
 * their status back to GO and clear archived_at.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const confirm = new URL(req.url).searchParams.get('confirm') === 'true';

  const yesterdayStart = '2026-04-23T00:00:00.000Z';
  const todayStart = '2026-04-24T00:00:00.000Z';
  const today = new Date().toISOString().split('T')[0];

  const { data: candidates, error: findError } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, sender_name, event_date, status, archived_at')
    .eq('status', 'ARCHIVE')
    .gte('archived_at', yesterdayStart)
    .lt('archived_at', todayStart)
    .gte('event_date', today);

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  const list = (candidates || []).map(r => ({
    id: r.id,
    sender_name: r.sender_name,
    event_date: r.event_date,
    archived_at: r.archived_at,
  }));

  if (!confirm) {
    return NextResponse.json({
      dryRun: true,
      wouldRestoreCount: list.length,
      wouldRestore: list,
      note: 'Pass ?confirm=true to actually restore these to GO.',
    });
  }

  if (list.length === 0) {
    return NextResponse.json({ success: true, restoredCount: 0 });
  }

  const ids = list.map(r => r.id);
  const { error: updateError } = await supabaseAdmin
    .from('private_event_requests')
    .update({
      status: 'GO',
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    restoredCount: list.length,
    restored: list,
  });
}
