import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * READ-ONLY inventory of the current state of private_event_requests.
 * No mutations — just counts and samples so we can see what happened
 * yesterday before touching anything.
 */
export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Yesterday's window (Europe/Amsterdam): 2026-04-23 00:00 UTC → today 00:00 UTC.
  // Keep it simple — anything touched during the mess falls in this window.
  const yesterdayStart = '2026-04-23T00:00:00.000Z';
  const todayStart = '2026-04-24T00:00:00.000Z';

  // Total count per status
  const { data: all } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, status, sender_name, sender_email, event_date, gmail_thread_id, created_at, archived_at');

  const rows = all || [];
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  // Rows created yesterday (likely swept in by broken syncs)
  const createdYesterday = rows
    .filter(r => r.created_at && r.created_at >= yesterdayStart && r.created_at < todayStart)
    .map(r => ({
      sender_name: r.sender_name,
      sender_email: r.sender_email,
      event_date: r.event_date,
      status: r.status,
      created_at: r.created_at,
      gmail_thread_id: r.gmail_thread_id,
    }));

  // Rows archived yesterday (swept to ARCHIVE by the stale-archive logic during
  // a broken sync run — these may need to come back)
  const archivedYesterday = rows
    .filter(r => r.archived_at && r.archived_at >= yesterdayStart && r.archived_at < todayStart)
    .map(r => ({
      sender_name: r.sender_name,
      sender_email: r.sender_email,
      event_date: r.event_date,
      status: r.status,
      archived_at: r.archived_at,
      gmail_thread_id: r.gmail_thread_id,
    }));

  // Rows with synthetic gmail_thread_id (contain ':') — leftovers from the split endpoint
  const syntheticRows = rows
    .filter(r => r.gmail_thread_id?.includes(':'))
    .map(r => ({
      sender_name: r.sender_name,
      sender_email: r.sender_email,
      event_date: r.event_date,
      status: r.status,
      created_at: r.created_at,
      gmail_thread_id: r.gmail_thread_id,
    }));

  // Rows with a future event_date that currently sit in ARCHIVE — suspicious,
  // they were probably moved there by the stale-archive run.
  const today = new Date().toISOString().split('T')[0];
  const futureInArchive = rows
    .filter(r => r.status === 'ARCHIVE' && r.event_date && r.event_date >= today)
    .map(r => ({
      sender_name: r.sender_name,
      event_date: r.event_date,
      archived_at: r.archived_at,
      gmail_thread_id: r.gmail_thread_id,
    }));

  return NextResponse.json({
    totalRows: rows.length,
    byStatus,
    createdYesterday: {
      count: createdYesterday.length,
      sample: createdYesterday.slice(0, 20),
    },
    archivedYesterday: {
      count: archivedYesterday.length,
      sample: archivedYesterday.slice(0, 20),
    },
    syntheticRows: {
      count: syntheticRows.length,
      all: syntheticRows,
    },
    futureEventsInArchive: {
      count: futureInArchive.length,
      sample: futureInArchive.slice(0, 30),
    },
  });
}
