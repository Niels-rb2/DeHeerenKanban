import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * List candidate cards that the current event could be merged with.
 * Returns recent non-archived/no-go cards, ordered with same-email matches first.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: current, error: currentError } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, sender_email')
    .eq('id', id)
    .maybeSingle();

  if (currentError || !current) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, sender_name, sender_email, event_date, status, created_at')
    .neq('id', id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Promote same-email matches to the top
  const currentEmail = (current.sender_email || '').toLowerCase();
  const sorted = (rows || []).slice().sort((a, b) => {
    const aMatch = (a.sender_email || '').toLowerCase() === currentEmail;
    const bMatch = (b.sender_email || '').toLowerCase() === currentEmail;
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0; // preserve created_at order
  });

  return NextResponse.json({
    currentEmail,
    candidates: sorted.map(r => ({
      id: r.id,
      sender_name: r.sender_name,
      sender_email: r.sender_email,
      event_date: r.event_date,
      status: r.status,
      created_at: r.created_at,
      sameEmail: (r.sender_email || '').toLowerCase() === currentEmail,
    })),
  });
}
