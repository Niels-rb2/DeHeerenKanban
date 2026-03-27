import { notFound } from 'next/navigation';
import { ThreadDetailPanel } from '@/components/ThreadDetailPanel';
import { Thread } from '@/lib/types';
import { DEMO_THREADS, DEMO_MESSAGES } from '@/lib/demo-data';
import { supabaseAdmin } from '@/lib/supabase';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

async function getThread(id: string): Promise<Thread | null> {
  if (isDemo) {
    const thread = DEMO_THREADS.find(t => t.id === id);
    if (!thread) return null;
    return {
      ...thread,
      messages: DEMO_MESSAGES[id] || [],
    };
  }

  const { data, error } = await supabaseAdmin
    .from('threads')
    .select('*, messages(*)')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  if (data.messages) {
    data.messages.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  return data as Thread;
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = await getThread(id);

  if (!thread) {
    notFound();
  }

  return <ThreadDetailPanel thread={thread} />;
}
