import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin.from('threads').select('status, conversion');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const threads = data || [];
  const total = threads.length;
  const todoReply = threads.filter(t => t.status === 'TODO_REPLY').length;
  const appointmentSet = threads.filter(t => t.status === 'APPOINTMENT_SET').length;
  const cancelled = threads.filter(t => t.status === 'CANCELLED').length;
  const conversionRate = total > 0 ? Math.round((appointmentSet / total) * 100) : 0;

  return NextResponse.json({ total, todoReply, appointmentSet, cancelled, conversionRate });
}
