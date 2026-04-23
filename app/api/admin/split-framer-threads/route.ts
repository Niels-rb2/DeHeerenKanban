import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parseFramerNotification, CAFE_EMAIL, FRAMER_EMAIL } from '@/lib/gmail';
import { supabaseAdmin } from '@/lib/supabase';
import { extractEventDataFromEmail } from '@/lib/anthropic';
import { ThreadStatus } from '@/lib/types';

type Message = {
  id: string;
  thread_id: string;
  gmail_message_id: string;
  from_email: string | null;
  body_html: string | null;
  body_plain: string | null;
  snippet: string | null;
  date: string | null;
  to_emails: string[] | null;
};

/**
 * For each existing primary event row, look at the messages already stored in
 * our DB. If more than one message looks like an original Framer website-form
 * submission, create a secondary event row per extra submission.
 *
 * Framer-submission detection here runs on the message body content we already
 * have in Supabase — no Gmail round-trip needed.
 */
export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only primary (non-synthetic) rows. Synthetic rows already represent a split.
  const { data: primaryRows } = await supabaseAdmin
    .from('private_event_requests')
    .select('id, gmail_thread_id, status')
    .not('gmail_thread_id', 'like', '%:%');

  const created: Array<{
    parentThreadId: string;
    syntheticThreadId: string;
    senderName: string;
    senderEmail: string;
  }> = [];
  const errors: string[] = [];
  const diagnostics: Array<{ parentThreadId: string; framerCount: number }> = [];

  for (const row of primaryRows || []) {
    try {
      const { data: msgs } = await supabaseAdmin
        .from('messages')
        .select('id, thread_id, gmail_message_id, from_email, body_html, body_plain, snippet, date, to_emails')
        .eq('thread_id', row.id)
        .order('date', { ascending: true });

      const messages = (msgs || []) as Message[];

      const isFramerMsg = (m: Message) => {
        const fromIsFramer = (m.from_email || '').toLowerCase() === FRAMER_EMAIL.toLowerCase();
        const body = `${m.snippet || ''}\n${m.body_plain || ''}\n${m.body_html || ''}`;
        const hasFramerFooter =
          /support@framer\.com/i.test(body) ||
          /submission of a Framer form/i.test(body) ||
          /This email is a submission/i.test(body);
        const hasFormFields =
          /Voornaam[:\s]/i.test(body) &&
          /E-?mailadres[:\s]/i.test(body) &&
          /Beschrijf/i.test(body);
        // Classic Framer sender, OR sender is cafe self-mail with Framer footer,
        // OR body has the full form signature (fields + footer).
        return (
          fromIsFramer ||
          (hasFramerFooter && hasFormFields)
        );
      };

      const framerMsgs = messages.filter(isFramerMsg);
      diagnostics.push({ parentThreadId: row.gmail_thread_id, framerCount: framerMsgs.length });

      if (framerMsgs.length <= 1) continue;

      // First Framer msg stays tied to the existing primary row. Split the rest out.
      for (let i = 1; i < framerMsgs.length; i++) {
        const fMsg = framerMsgs[i];
        const synthTid = `${row.gmail_thread_id}:${fMsg.gmail_message_id}`;

        const { data: existing } = await supabaseAdmin
          .from('private_event_requests')
          .select('id')
          .eq('gmail_thread_id', synthTid)
          .maybeSingle();
        if (existing) continue;

        const parsed = parseFramerNotification(fMsg.body_html || '');
        const senderName = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ') || '';
        const senderEmail = parsed.email || '';
        const requestBody = parsed.request || fMsg.snippet || '';
        if (!senderEmail) {
          errors.push(`${synthTid}: no email extracted from body`);
          continue;
        }

        let extracted = {
          senderName,
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
            extracted = await extractEventDataFromEmail(requestBody);
          } catch (e) {
            console.warn('[SPLIT] AI extraction failed:', e);
          }
        }

        const { data: insertedRow, error: insertError } = await supabaseAdmin
          .from('private_event_requests')
          .insert({
            gmail_thread_id: synthTid,
            sender_name: extracted.senderName || senderName,
            sender_email: senderEmail,
            occasion_type: extracted.occasionType,
            event_date: extracted.eventDate,
            start_time: extracted.startTime,
            end_time: extracted.endTime,
            guest_count: extracted.guestCount,
            special_notes: extracted.specialNotes,
            ai_summary: extracted.aiSummary,
            status: 'TO_ANSWER' as ThreadStatus,
          })
          .select()
          .single();

        if (insertError || !insertedRow) {
          errors.push(`${synthTid}: ${insertError?.message || 'insert failed'}`);
          continue;
        }

        await supabaseAdmin.from('messages').insert({
          thread_id: insertedRow.id,
          gmail_message_id: `${fMsg.gmail_message_id}:${synthTid}`,
          from_name: senderName || 'Klant (via website)',
          from_email: senderEmail,
          to_emails: fMsg.to_emails || [CAFE_EMAIL],
          date: fMsg.date,
          snippet: fMsg.snippet || '',
          body_plain: fMsg.body_plain,
          body_html: fMsg.body_html,
          direction: 'INBOUND',
        });

        created.push({
          parentThreadId: row.gmail_thread_id,
          syntheticThreadId: synthTid,
          senderName: extracted.senderName || senderName,
          senderEmail,
        });
      }
    } catch (err: any) {
      errors.push(`${row.gmail_thread_id}: ${err.message}`);
    }
  }

  const multiFramerThreads = diagnostics.filter(d => d.framerCount > 1);

  return NextResponse.json({
    success: true,
    createdCount: created.length,
    created,
    errors: errors.slice(0, 20),
    threadsScanned: diagnostics.length,
    threadsWithMultipleFramer: multiFramerThreads.length,
    multiFramerSample: multiFramerThreads.slice(0, 10),
  });
}
