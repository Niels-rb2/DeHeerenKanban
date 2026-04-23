import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getGmailClient, extractEmailBody, parseEmailAddress, CAFE_EMAIL, GMAIL_LABEL } from '@/lib/gmail';
import { supabaseAdmin } from '@/lib/supabase';
import { extractEventDataFromEmail } from '@/lib/anthropic';
import { ThreadStatus } from '@/lib/types';

const FRAMER_EMAIL = 'noreply@framer.com';

/**
 * Forcibly clear all NextAuth session-related cookies on the response.
 * Used when Google rejects our access token — we need to invalidate the
 * session server-side so the login page doesn't redirect back to /dashboard.
 */
function killSessionCookies(response: NextResponse) {
  const names = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'authjs.callback-url',
    '__Secure-authjs.callback-url',
    'authjs.csrf-token',
    '__Host-authjs.csrf-token',
    '__Secure-authjs.csrf-token',
  ];
  for (const name of names) {
    response.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      secure: name.startsWith('__Secure-') || name.startsWith('__Host-'),
      httpOnly: true,
      sameSite: 'lax',
    });
  }
}

/**
 * Parse a Framer form notification email.
 * Extracts customer name, email, phone, and request text from HTML body.
 * Uses regex to handle cases where fields run together without clean line breaks.
 */
function parseFramerNotification(html: string): {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  request: string | null;
} {
  // Strip HTML tags, decode entities, clean up
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|td|th|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/[\u200B\u00AD\u034F\u2007\u200C\u200D\uFEFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  // Extract fields using regex patterns that match "Label: Value" or "Label\nValue"
  const emailMatch = text.match(/E-?mailadres[:\s]+([^\s,]+@[^\s,]+)/i);
  const firstNameMatch = text.match(/Voornaam[:\s]+([A-Za-zÀ-ÿ\-\.]+)/i);
  const lastNameMatch = text.match(/Achternaam[:\s]+([A-Za-zÀ-ÿ\s\-\.]+?)(?=\s*(?:E-?mailadres|Telefoonnummer|Beschrijf|$))/i);
  const phoneMatch = text.match(/Telefoonnummer[:\s]+([\d\s\+\-()]{8,})/i);
  const requestMatch = text.match(/Beschrijf[^:]*:[:\s]+([\s\S]+?)(?=This email is a submission|support@framer\.com|Not expecting this|$)/i);

  const firstName = firstNameMatch?.[1]?.trim() || null;
  const lastName = lastNameMatch?.[1]?.trim() || null;
  const email = emailMatch?.[1]?.trim() || null;
  const phone = phoneMatch?.[1]?.trim() || null;
  const request = requestMatch?.[1]?.trim() || null;

  return { firstName, lastName, email, phone, request };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  console.log('[GMAIL SYNC] Session check:', {
    hasSession: !!session,
    hasUser: !!session?.user,
    userEmail: session?.user?.email,
    hasAccessToken: !!session?.accessToken,
    error: session?.error,
  });
  if (!session?.accessToken) {
    // If the session has a known auth error (like RefreshTokenMissing),
    // flag needsReauth so the frontend auto-redirects to signout.
    const isAuthIssue =
      session?.error === 'RefreshTokenMissing' ||
      session?.error === 'RefreshTokenError';
    const r = NextResponse.json({
      error: 'Unauthorized',
      details: session?.error || 'No access token in session. Log uit en log opnieuw in.',
      needsReauth: isAuthIssue || !session,
    }, { status: 401 });
    if (isAuthIssue) killSessionCookies(r);
    return r;
  }

  // Parse options from request body (optional)
  let skipAI = false;
  try {
    const body = await req.json().catch(() => ({}));
    skipAI = body.skipAI === true;
  } catch {}

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
    const errors: string[] = [];
    const skipped: string[] = [];

    for (const gmailThread of gmailThreads) {
      try {
        // Check if already synced
        const { data: existing } = await supabaseAdmin
          .from('private_event_requests')
          .select('id, gmail_thread_id, status, event_date')
          .eq('gmail_thread_id', gmailThread.id!)
          .maybeSingle();

        // Fetch full thread from Gmail
        const threadDetail = await gmail.users.threads.get({
          userId: 'me',
          id: gmailThread.id!,
          format: 'full',
        });

        const messages = threadDetail.data.messages || [];
        if (messages.length === 0) { skipped.push(`${gmailThread.id}: no messages`); continue; }

        // Parse all messages from Gmail
        const parsedMessages = messages.map(msg => {
          const headers = msg.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

          const fromHeader = getHeader('from');
          const { name: fromName, email: fromEmail } = parseEmailAddress(fromHeader);
          const toHeader = getHeader('to');
          const toEmails = toHeader.split(',').map(e => parseEmailAddress(e.trim()).email);
          const subjectStr = getHeader('subject');
          const date = new Date(parseInt(msg.internalDate || '0')).toISOString();
          const { plain, html } = extractEmailBody(msg.payload);

          const isOutbound = fromEmail.toLowerCase() === CAFE_EMAIL.toLowerCase();

          // Framer notifications originally came from noreply@framer.com. They now
          // arrive from the cafe's own address (Framer configured to send via our
          // domain) — so also recognize them by the subject line our form uses.
          const isFramer =
            fromEmail.toLowerCase() === FRAMER_EMAIL.toLowerCase() ||
            /aanvraag\s+besloten\s+feestje/i.test(subjectStr);

          return {
            gmail_message_id: msg.id!,
            from_name: fromName,
            from_email: fromEmail,
            to_emails: toEmails,
            date,
            snippet: msg.snippet || '',
            body_plain: plain,
            body_html: html,
            // Framer notifications count as INBOUND (they represent customer submissions)
            direction: (isFramer || !isOutbound ? 'INBOUND' : 'OUTBOUND') as 'INBOUND' | 'OUTBOUND',
            _isFramer: isFramer,
          };
        });

        console.log(`[SYNC] Thread ${gmailThread.id}: ${messages.length} messages, existing=${!!existing}`);

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
              const { _isFramer, ...msgData } = msg;
              await supabaseAdmin.from('messages').insert({
                thread_id: existing.id,
                ...msgData,
              });
            }

            // Auto-move TO_ANSWER → ANSWERED when Café De Heeren replies
            const hasNewOutbound = newMessages.some(m => m.direction === 'OUTBOUND');
            if (hasNewOutbound && existing.status === 'TO_ANSWER') {
              await supabaseAdmin
                .from('private_event_requests')
                .update({ status: 'ANSWERED', updated_at: new Date().toISOString() })
                .eq('id', existing.id);
              console.log(`[SYNC] Auto-moved ${existing.id} to ANSWERED (outbound reply detected)`);
            } else {
              await supabaseAdmin
                .from('private_event_requests')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', existing.id);
            }

            synced++;
          }
          continue;
        }

        // ── New thread: full creation flow ──

        // Step 1: Find customer info
        // Collect ALL Framer submissions in this Gmail thread (when Gmail has
        // threaded multiple form submissions together because they share a
        // subject line + sender, we want a separate card per submission).
        const framerMessages = parsedMessages.filter(m => m._isFramer);
        const framerMsg = framerMessages[0];
        // Also find the first real customer reply (not Framer, not Café)
        const customerReply = parsedMessages.find(m =>
          m.direction === 'INBOUND' &&
          !m._isFramer &&
          m.from_email.toLowerCase() !== CAFE_EMAIL.toLowerCase()
        );

        let senderName = '';
        let senderEmail = '';
        let requestBody = '';

        console.log(`[SYNC] Thread ${gmailThread.id}: framer=${!!framerMsg}, customerReply=${!!customerReply}, directions=${parsedMessages.map(m => m.direction).join(',')}, from=${parsedMessages.map(m => m.from_email).join(',')}`);

        if (framerMsg) {
          // Parse customer details from Framer HTML
          const parsed = parseFramerNotification(framerMsg.body_html || '');
          console.log(`[SYNC] Framer parsed:`, JSON.stringify(parsed));

          senderName = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ') || '';
          senderEmail = parsed.email || '';
          requestBody = parsed.request || framerMsg.snippet || '';

          // If Framer didn't have an email, try the customer reply
          if (!senderEmail && customerReply) {
            senderEmail = customerReply.from_email;
            if (!senderName) senderName = customerReply.from_name;
          }

          // Rewrite the Framer message's from fields to show the actual customer
          if (senderName || senderEmail) {
            framerMsg.from_name = senderName || 'Klant (via website)';
            framerMsg.from_email = senderEmail || FRAMER_EMAIL;
          }
        } else if (customerReply) {
          // No Framer message — use first customer reply
          senderName = customerReply.from_name;
          senderEmail = customerReply.from_email;
          requestBody = customerReply.body_plain || customerReply.snippet || '';
        } else {
          // No inbound at all — skip
          const dirs = parsedMessages.map(m => `${m.from_email}=${m.direction}`).join(', ');
          skipped.push(`${gmailThread.id}: no inbound (${dirs})`);
          continue;
        }

        console.log(`[SYNC] Thread ${gmailThread.id}: senderName=${senderName}, senderEmail=${senderEmail}, requestBody=${requestBody?.substring(0, 100)}`);

        if (!senderEmail) {
          skipped.push(`${gmailThread.id}: no email found (framer=${!!framerMsg}, customer=${!!customerReply}, name=${senderName})`);
          continue;
        }

        // Step 2: AI extraction on the request body
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

        if (requestBody && !skipAI) {
          try {
            extractedData = await extractEventDataFromEmail(requestBody);
          } catch (error) {
            console.warn('[SYNC] AI extraction failed:', error);
          }
        }

        // Step 3: Insert the event
        const newRequest = {
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
        };

        const { data: created, error: insertError } = await supabaseAdmin
          .from('private_event_requests')
          .insert(newRequest)
          .select()
          .single();

        if (insertError) {
          errors.push(`Thread ${gmailThread.id}: ${insertError.message}`);
          continue;
        }

        if (created) {
          // Step 4: Insert all messages
          for (const msg of parsedMessages) {
            const { _isFramer, ...msgData } = msg;
            const { error: msgError } = await supabaseAdmin.from('messages').insert({
              thread_id: created.id,
              ...msgData,
            });
            if (msgError) console.error('[SYNC] Message insert error:', msgError.message);
          }
          synced++;

          // Step 5: if the Gmail thread contained multiple Framer submissions
          // (e.g. same-email test data), create a secondary card per extra
          // submission so each one is tracked independently.
          for (let i = 1; i < framerMessages.length; i++) {
            const extraMsg = framerMessages[i];
            const synthTid = `${gmailThread.id}:${extraMsg.gmail_message_id}`;
            const extraParsed = parseFramerNotification(extraMsg.body_html || '');
            const extraName = [extraParsed.firstName, extraParsed.lastName].filter(Boolean).join(' ') || '';
            const extraEmail = extraParsed.email || '';
            const extraBody = extraParsed.request || extraMsg.snippet || '';
            if (!extraEmail) continue;

            let extraExtracted = {
              senderName: extraName,
              occasionType: null as string | null,
              eventDate: null as string | null,
              startTime: null as string | null,
              endTime: null as string | null,
              guestCount: null as number | null,
              specialNotes: null as string | null,
              aiSummary: null as string | null,
            };
            if (extraBody && !skipAI) {
              try {
                extraExtracted = await extractEventDataFromEmail(extraBody);
              } catch {}
            }

            const { data: extraRow } = await supabaseAdmin
              .from('private_event_requests')
              .insert({
                gmail_thread_id: synthTid,
                sender_name: extraExtracted.senderName || extraName,
                sender_email: extraEmail,
                occasion_type: extraExtracted.occasionType,
                event_date: extraExtracted.eventDate,
                start_time: extraExtracted.startTime,
                end_time: extraExtracted.endTime,
                guest_count: extraExtracted.guestCount,
                special_notes: extraExtracted.specialNotes,
                ai_summary: extraExtracted.aiSummary,
                status: 'TO_ANSWER' as ThreadStatus,
              })
              .select()
              .single();

            if (extraRow) {
              await supabaseAdmin.from('messages').insert({
                thread_id: extraRow.id,
                gmail_message_id: `${extraMsg.gmail_message_id}:${synthTid}`,
                from_name: extraName || 'Klant (via website)',
                from_email: extraEmail,
                to_emails: extraMsg.to_emails,
                date: extraMsg.date,
                snippet: extraMsg.snippet,
                body_plain: extraMsg.body_plain,
                body_html: extraMsg.body_html,
                direction: 'INBOUND',
              });
              synced++;
            }
          }
        }
      } catch (threadError: any) {
        errors.push(`Thread ${gmailThread.id}: ${threadError.message}`);
      }
    }

    // ── Auto-archive: events with event_date in the past ──
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { data: pastEvents } = await supabaseAdmin
      .from('private_event_requests')
      .select('id')
      .lt('event_date', today)
      .in('status', ['TO_ANSWER', 'ANSWERED', 'CONSULTATION_PLANNED', 'GO']);

    let autoArchived = 0;
    if (pastEvents && pastEvents.length > 0) {
      const ids = pastEvents.map(e => e.id);
      const { error: archiveError } = await supabaseAdmin
        .from('private_event_requests')
        .update({ status: 'ARCHIVE', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in('id', ids);

      if (!archiveError) {
        autoArchived = ids.length;
        console.log(`[SYNC] Auto-archived ${autoArchived} events with past event_date`);
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      autoArchived,
      totalThreads: gmailThreads.length,
      errors: errors.slice(0, 5),
      skipped: skipped.slice(0, 10),
    });
  } catch (error: any) {
    console.error('[SYNC] Error:', error.message);

    // Detect Google OAuth auth errors and return 401 so frontend can redirect to login
    const msg = error.message || '';
    const isAuthError =
      msg.includes('invalid authentication credentials') ||
      msg.includes('invalid_grant') ||
      msg.includes('401') ||
      error?.response?.status === 401 ||
      error?.code === 401;

    if (isAuthError) {
      const r = NextResponse.json({
        error: 'Unauthorized',
        details: 'Google authenticatie is verlopen. Log uit en log opnieuw in.',
        needsReauth: true,
      }, { status: 401 });
      // Kill the session cookie server-side so /login doesn't redirect back
      killSessionCookies(r);
      return r;
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
