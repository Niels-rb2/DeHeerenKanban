import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getGmailClient,
  extractEmailBody,
  parseEmailAddress,
  parseFramerNotification,
  isFramerSubmission,
  CAFE_EMAIL,
} from '@/lib/gmail';
import { supabaseAdmin } from '@/lib/supabase';
import { extractEventDataFromEmail } from '@/lib/anthropic';
import { ThreadStatus } from '@/lib/types';

/**
 * One-shot endpoint: for every active thread in the DB that actually contains
 * multiple Framer submissions in its Gmail thread (e.g. when testing with the
 * same sender email and Gmail threaded two form submissions together), create
 * a secondary event row per extra Framer submission.
 *
 * Synthetic thread id: `${gmail_thread_id}:${framer_message_id}` so each row
 * stays unique while still being traceable back to the original Gmail thread.
 */
export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gmail = getGmailClient(session.accessToken);

  // Load all primary (non-synthetic) threads from the DB.
  const { data: primaryRows } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, gmail_thread_id, status')
    .not('gmail_thread_id', 'like', '%:%');

  const created: Array<{ gmail_thread_id: string; senderName: string; senderEmail: string }> = [];
  const errors: string[] = [];

  for (const row of primaryRows || []) {
    const tid = row.gmail_thread_id;
    try {
      const threadDetail = await gmail.users.threads.get({
        userId: 'me',
        id: tid,
        format: 'full',
      });
      const messages = threadDetail.data.messages || [];

      const framerMessages = messages.filter(msg => {
        const hdr = msg.payload?.headers || [];
        const from = hdr.find(h => h.name?.toLowerCase() === 'from')?.value || '';
        const subject = hdr.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
        const fromEmail = parseEmailAddress(from).email;
        const { plain, html } = extractEmailBody(msg.payload);
        const body = `${msg.snippet || ''}\n${plain || ''}\n${html || ''}`;
        return isFramerSubmission(fromEmail, subject, body);
      });

      if (framerMessages.length <= 1) continue;

      // The first Framer submission is already represented by the primary row.
      for (let i = 1; i < framerMessages.length; i++) {
        const fMsg = framerMessages[i];
        const synthTid = `${tid}:${fMsg.id}`;

        const { data: existing } = await supabaseAdmin
          .from('private_event_requests')
          .select('id')
          .eq('gmail_thread_id', synthTid)
          .maybeSingle();
        if (existing) continue;

        const { plain, html } = extractEmailBody(fMsg.payload);
        const parsed = parseFramerNotification(html || '');
        const senderName = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ') || '';
        const senderEmail = parsed.email || '';
        const requestBody = parsed.request || fMsg.snippet || '';
        if (!senderEmail) {
          errors.push(`${synthTid}: no email extracted`);
          continue;
        }

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
        if (requestBody) {
          try {
            extractedData = await extractEventDataFromEmail(requestBody);
          } catch (e) {
            console.warn('[SPLIT] AI extraction failed:', e);
          }
        }

        const { data: insertedRow, error: insertError } = await supabaseAdmin
          .from('private_event_requests')
          .insert({
            gmail_thread_id: synthTid,
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
          })
          .select()
          .single();

        if (insertError || !insertedRow) {
          errors.push(`${synthTid}: ${insertError?.message || 'insert failed'}`);
          continue;
        }

        // Copy the Framer submission message with a synthetic gmail_message_id
        // so the new card shows the customer's original request.
        const date = new Date(parseInt(fMsg.internalDate || '0')).toISOString();
        const { error: msgError } = await supabaseAdmin.from('messages').insert({
          thread_id: insertedRow.id,
          gmail_message_id: `${fMsg.id}:${synthTid}`,
          from_name: senderName || 'Klant (via website)',
          from_email: senderEmail,
          to_emails: [CAFE_EMAIL],
          date,
          snippet: fMsg.snippet || '',
          body_plain: plain,
          body_html: html,
          direction: 'INBOUND',
        });
        if (msgError) {
          console.error('[SPLIT] Message insert error:', msgError.message);
        }

        created.push({
          gmail_thread_id: synthTid,
          senderName: extractedData.senderName || senderName,
          senderEmail,
        });
      }
    } catch (threadError: any) {
      errors.push(`${tid}: ${threadError.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    createdCount: created.length,
    created,
    errors: errors.slice(0, 20),
  });
}
