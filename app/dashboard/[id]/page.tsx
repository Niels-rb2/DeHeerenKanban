import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { EventDetailPanel } from '@/components/EventDetailPanel';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    // Fetch event directly from Supabase (no self-fetch)
    const { data: event, error: eventError } = await supabaseAdmin
      .from('private_event_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      notFound();
    }

    // Fetch messages using the event's UUID (thread_id in messages table)
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', event.id)
      .order('date', { ascending: false });

    return <EventDetailPanel event={{ ...event, messages: messages || [] }} />;
  } catch (error) {
    console.error('Error fetching event:', error);
    notFound();
  }
}
