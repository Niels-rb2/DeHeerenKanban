import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getGmailClient, extractEmailBody, parseEmailAddress, CAFE_EMAIL, GMAIL_LABEL } from '@/lib/gmail';
import { supabaseAdmin } from '@/lib/supabase';
import { extractEventDataFromEmail } from '@/lib/anthropic';
import { ThreadStatus, PrivateEventRequest } from '@/lib/types';

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
      // Check if already synced
      const { data: existing } = await supabaseAdmin
        .from('private_event_requests')
        .select('id, gmail_thread_id')
        .eq('gmail_thread_id', gmailThread.id!)
        .single();

      // Fetch full thread from Gmail
      const threadDetail = await gmail.users.threads.get({
        userId: 'me',
        id: gmailThread.id!,
        format: 'full',
      });

      const messages = threadDetail.data.messages || [];
      if (messages.length === 0) continue;

      // Parse all messages from Gmail
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

      if (existing) {
        // ── Re-sync: insert only NEW messages for existing thread ──
        const { data: existingMessages } = await supabaseAdmin
          .from('messages')
          .select('gmail_message_id')
          .eq('thread_id', existing.id);

        const existingIds = new Set((existingMessages || []).map(m => m.gmail_message_id));
        const newMessages = parsedMessages.filter(m => !existingIds.has(m.gmail_message_id));

        if (newMessages.length > 0) {
          for (const msg of newMessages) {
            await supabaseAdmin.from('messages').insert({
              thread_id: existing.id,
              ...msg,
            });
          }

          // Update the event's updated_at timestamp
          await supabaseAdmin
            .from('private_event_requests')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', existing.id);

          synced++;
        }
        continue;
      }

      // ── New thread: full creation flow ──
      const firstInbound = parsedMessages.find(m => m.direction === 'INBOUND');
      if (!firstInbound) continue;

      const senderEmail = firstInbound.from_email;
      const senderName = firstInbound.from_name;
      const emailBody = firstInbound.body_plain || firstInbound.snippet || '';

      // AI extraction
      let extractedData = {
        senderName: senderName,
        occasionType: null as string | null,
        eventDate: null as string | null,
        startTime: null as string | null,
        endTime: null as string | null,
        guestCount: null as number | null,
        specialNotes: null as string | null,
        aiSummary: null as string | null,
      };

      try {
        extractedData = await extractEventDataFromEmail(emailBody);
      } catch (error) {
        console.warn('AI extraction failed, using defaults:', error);
      }

      const newRequest: PrivateEventRequest = {
        id: '',
        gmail_thread_id: gmailThread.id!,
        sender_name: extractedData.senderName || senderName,
        sender_email: senderEmail,
        occasion_type: extractedData.occasionType,
        event_date: extractedData.eventDate,
        start_time: extractedData.startTime,
        end_time: extractedData.endTime,
        guest_count: extractedData.guestCount,
        special_notes: extractedData.specialNotes,
        ai_summary: extractedData.aiSummary,
        status: 'TO_ANSWER' as ThreadStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      };

      const { data: created } = await supabaseAdmin
        .from('private_event_requests')
        .insert(newRequest)
        .select()
        .single();

      if (created) {
        for (const msg of parsedMessages) {
          await supabaseAdmin.from('messages').insert({
            thread_id: created.id,
            ...msg,
          });
        }
        synced++;
      }
    }

    return NextResponse.json({ success: true, synced });
  } catch (error: any) {
    console.error('Gmail sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
