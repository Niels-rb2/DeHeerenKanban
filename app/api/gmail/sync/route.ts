import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getGmailClient, extractEmailBody, parseEmailAddress, CAFE_EMAIL, GMAIL_LABEL } from '@/lib/gmail';
import { supabaseAdmin } from '@/lib/supabase';
import { ThreadStatus } from '@/lib/types';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const gmail = getGmailClient(session.accessToken);

    // Get label ID for "Besloten feestje"
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    const labels = labelsRes.data.labels || [];
    const targetLabel = labels.find(l => l.name?.toLowerCase() === GMAIL_LABEL.toLowerCase());

    if (!targetLabel?.id) {
      return NextResponse.json({ error: `Label "${GMAIL_LABEL}" not found` }, { status: 404 });
    }

    // Fetch threads with this label
    const threadsRes = await gmail.users.threads.list({
      userId: 'me',
      labelIds: [targetLabel.id],
      maxResults: 100,
    });

    const gmailThreads = threadsRes.data.threads || [];
    let synced = 0;

    for (const gmailThread of gmailThreads) {
      const threadDetail = await gmail.users.threads.get({
        userId: 'me',
        id: gmailThread.id!,
        format: 'full',
      });

      const messages = threadDetail.data.messages || [];
      if (messages.length === 0) continue;

      // Parse messages
      const parsedMessages = messages.map(msg => {
        const headers = msg.payload?.headers || [];
        const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        const fromHeader = getHeader('from');
        const { name: fromName, email: fromEmail } = parseEmailAddress(fromHeader);
        const toHeader = getHeader('to');
        const toEmails = toHeader.split(',').map(e => parseEmailAddress(e.trim()).email);
        const date = new Date(parseInt(msg.internalDate || '0')).toISOString();
        const { plain, html } = extractEmailBody(msg.payload);

        return {
          gmail_message_id: msg.id!,
          from_name: fromName,
          from_email: fromEmail,
          to_emails: toEmails,
          date,
          snippet: msg.snippet || '',
          body_plain: plain,
          body_html: html,
          direction: (fromEmail.toLowerCase() === CAFE_EMAIL.toLowerCase() ? 'OUTBOUND' : 'INBOUND') as 'INBOUND' | 'OUTBOUND',
        };
      });

      // Determine contact (first INBOUND message)
      const firstInbound = parsedMessages.find(m => m.direction === 'INBOUND');
      const contactEmail = firstInbound?.from_email || parsedMessages[0]?.from_email || '';
      const contactName = firstInbound?.from_name || null;
      const subject = messages[0]?.payload?.headers?.find(h => h.name?.toLowerCase() === 'subject')?.value || '(geen onderwerp)';
      const lastMessageAt = parsedMessages.reduce((latest, m) => m.date > latest ? m.date : latest, parsedMessages[0]?.date || new Date().toISOString());

      // Auto-determine status
      const sortedByDate = [...parsedMessages].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const lastMsg = sortedByDate[sortedByDate.length - 1];
      const hasOutbound = parsedMessages.some(m => m.direction === 'OUTBOUND');

      let autoStatus: ThreadStatus = 'TODO_REPLY';
      if (lastMsg.direction === 'INBOUND' && !parsedMessages.some(m => m.direction === 'OUTBOUND' && m.date > lastMsg.date)) {
        autoStatus = 'TODO_REPLY';
      } else if (hasOutbound) {
        autoStatus = 'REPLIED_NO_APPOINTMENT';
      }

      // Check if thread exists
      const { data: existing } = await supabaseAdmin
        .from('threads')
        .select('id, status')
        .eq('gmail_thread_id', gmailThread.id!)
        .single();

      if (existing) {
        // Update thread but preserve manual status
        await supabaseAdmin.from('threads').update({
          last_message_at: lastMessageAt,
          has_unread: lastMsg.direction === 'INBOUND',
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);

        // Upsert messages
        for (const msg of parsedMessages) {
          await supabaseAdmin.from('messages').upsert({
            thread_id: existing.id,
            ...msg,
          }, { onConflict: 'gmail_message_id' });
        }
      } else {
        // Insert new thread
        const { data: newThread } = await supabaseAdmin.from('threads').insert({
          gmail_thread_id: gmailThread.id!,
          subject,
          contact_name: contactName,
          contact_email: contactEmail,
          last_message_at: lastMessageAt,
          status: autoStatus,
          has_unread: lastMsg.direction === 'INBOUND',
          conversion: false,
        }).select().single();

        if (newThread) {
          for (const msg of parsedMessages) {
            await supabaseAdmin.from('messages').insert({
              thread_id: newThread.id,
              ...msg,
            });
          }
        }
      }
      synced++;
    }

    return NextResponse.json({ success: true, synced });
  } catch (error: any) {
    console.error('Gmail sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
