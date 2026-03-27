import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const unreadOnly = searchParams.get('unread') === 'true';
  const hasAppointment = searchParams.get('hasAppointment') === 'true';

  let query = supabaseAdmin
    .from('threads')
    .select('*')
    .order('last_message_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (unreadOnly) {
    query = query.eq('has_unread', true);
  }
  if (hasAppointment) {
    query = query.eq('conversion', true);
  }
  if (search) {
    query = query.or(`contact_name.ilike.%${search}%,contact_email.ilike.%${search}%,subject.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
