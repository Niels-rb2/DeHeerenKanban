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

    // Fetch threads with this label — paginate up to ~500 so newly-arrived
    // threads aren't silently dropped when there are more than 100 labeled threads.
    const MAX_PAGES = 5;
    type GmailThreadStub = { id?: string | null; historyId?: string | null };
    const threadMap = new Map<string, GmailThreadStub>();
    let pageToken: string | undefined = undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listRes: any = await gmail.users.threads.list({
        userId: 'me',
        labelIds: [targetLabel.id],
        maxResults: 100,
        pageToken,
      });
      for (const t of (listRes.data.threads || []) as GmailThreadStub[]) {
        if (t.id) threadMap.set(t.id, t);
      }
      pageToken = listRes.data.nextPageToken || undefined;
      if (!pageToken) break;
    }

    // Safety net: also run several broad Gmail searches so we never miss a
    // recent Framer submission, regardless of label state / filter delay /
    // exact subject wording. Results merge into threadMap (deduped by id).
    const fallbackQueries = [
      'subject:"Aanvraag Besloten Feestje" newer_than:60d',
      'subject:feestje newer_than:30d',
      '"via de website" newer_than:30d',
      'from:noreply@framer.com newer_than:30d',
    ];
    for (const q of fallbackQueries) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = await gmail.users.threads.list({
          userId: 'me',
          q,
          maxResults: 50,
        });
        for (const t of (res.data.threads || []) as GmailThreadStub[]) {
          if (t.id && !threadMap.has(t.id)) threadMap.set(t.id, t);
        }
      } catch (e) {
        console.warn(`[SYNC] Fallback search failed (${q}):`, e);
      }
    }

    const gmailThreads: GmailThreadStub[] = Array.from(threadMap.values());

    let synced = 0;
    let alreadyUpToDate = 0;
    const errors: string[] = [];
    const skipped: string[] = [];
    type Outcome = 'created' | 'updated' | 'unchanged' | 'skipped' | 'error';
    const threadOutcomes: Array<{ id: string; subject: string; outcome: Outcome; detail?: string }> = [];

    // Batch-query existing rows for all threads (single Supabase query instead of 100)
    const allThreadIds = gmailThreads.map(t => t.id!).filter(Boolean);
    const { data: existingRows } = await supabaseAdmin
      .from('private_event_requests')
      .select('id, gmail_thread_id, status, event_date')
      .in('gmail_thread_id', allThreadIds);
    const existingByThreadId = new Map(
      (existingRows || []).map(r => [r.gmail_thread_id, r])
    );

    // Batch-query existing message IDs per thread (single query) so we can
    // skip the expensive full Gmail fetch when an existing thread has no new messages.
    const existingThreadPkIds = (existingRows || []).map(r => r.id);
    const existingMessagesByThread = new Map<string, Set<string>>();
    if (existingThreadPkIds.length > 0) {
      const { data: allMsgs } = await supabaseAdmin
        .from('messages')
        .select('thread_id, gmail_message_id')
        .in('thread_id', existingThreadPkIds);
      for (const m of allMsgs || []) {
        if (!existingMessagesByThread.has(m.thread_id)) {
          existingMessagesByThread.set(m.thread_id, new Set());
        }
        existingMessagesByThread.get(m.thread_id)!.add(m.gmail_message_id);
      }
    }

    const processThread = async (gmailThread: typeof gmailThreads[number]) => {
      const tid = gmailThread.id!;
      try {
        const existing = existingByThreadId.get(tid) || null;

        // Fast path: for existing threads, first fetch metadata only.
        // If we already have every message ID, count as unchanged and skip the full fetch.
        if (existing) {
          const meta = await gmail.users.threads.get({
            userId: 'me',
            id: tid,
            format: 'metadata',
            metadataHeaders: ['Subject'],
          });
          const metaMessages = meta.data.messages || [];
          const subject = metaMessages[0]?.payload?.headers?.find(
            h => h.name?.toLowerCase() === 'subject'
          )?.value || '';
          const known = existingMessagesByThread.get(existing.id) || new Set();
          const hasNew = metaMessages.some(m => m.id && !known.has(m.id));
          if (!hasNew) {
            alreadyUpToDate++;
            threadOutcomes.push({ id: tid, subject, outcome: 'unchanged' });
            return;
          }
        }

        // Fetch full thread from Gmail
        const threadDetail = await gmail.users.threads.get({
          userId: 'me',
          id: tid,
          format: 'full',
        });

        const messages = threadDetail.data.messages || [];
        const subjectHeader = messages[0]?.payload?.headers?.find(
          h => h.name?.toLowerCase() === 'subject'
        )?.value || '';
        if (messages.length === 0) {
          skipped.push(`${tid}: no messages`);
          threadOutcomes.push({ id: tid, subject: subjectHeader, outcome: 'skipped', detail: 'no messages' });
          return;
        }

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

          // Framer notifications were originally sent from noreply@framer.com, but can
          // now also arrive from the cafe's own address (when Framer is configured to
          // send via the customer's domain). Fall back to subject and content detection.
          const bodySample = `${msg.snippet || ''}\n${plain || ''}\n${html || ''}`;
          const isFramer =
            fromEmail.toLowerCase() === FRAMER_EMAIL.toLowerCase() ||
            /aanvraag\s+besloten\s+feestje/i.test(subjectStr) ||
            /support@framer\.com|submission from your site/i.test(bodySample) ||
            (/Voornaam/i.test(bodySample) && /Beschrijf/i.test(bodySample));

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

        console.log(`[SYNC] Thread ${tid}: ${messages.length} messages, existing=${!!existing}`);

        if (existing) {
          // ── Re-sync: insert only NEW messages for existing thread ──
          const existingIds = existingMessagesByThread.get(existing.id) || new Set();
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
            threadOutcomes.push({ id: tid, subject: subjectHeader, outcome: 'updated', detail: `+${newMessages.length} berichten` });
          } else {
            alreadyUpToDate++;
            threadOutcomes.push({ id: tid, subject: subjectHeader, outcome: 'unchanged' });
          }
          return;
        }

        // ── New thread: full creation flow ──

        // Step 1: Find customer info
        // First check for a Framer notification (website form submission)
        const framerMsg = parsedMessages.find(m => m._isFramer);
        // Also find the first real customer reply (not Framer, not Café)
        const customerReply = parsedMessages.find(m =>
          m.direction === 'INBOUND' &&
          !m._isFramer &&
          m.from_email.toLowerCase() !== CAFE_EMAIL.toLowerCase()
        );

        let senderName = '';
        let senderEmail = '';
        let requestBody = '';

        console.log(`[SYNC] Thread ${tid}: framer=${!!framerMsg}, customerReply=${!!customerReply}, directions=${parsedMessages.map(m => m.direction).join(',')}, from=${parsedMessages.map(m => m.from_email).join(',')}`);

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
          skipped.push(`${tid}: no inbound (${dirs})`);
          threadOutcomes.push({ id: tid, subject: subjectHeader, outcome: 'skipped', detail: `no inbound (${dirs})` });
          return;
        }

        console.log(`[SYNC] Thread ${tid}: senderName=${senderName}, senderEmail=${senderEmail}, requestBody=${requestBody?.substring(0, 100)}`);

        if (!senderEmail) {
          skipped.push(`${tid}: no email found (framer=${!!framerMsg}, customer=${!!customerReply}, name=${senderName})`);
          threadOutcomes.push({ id: tid, subject: subjectHeader, outcome: 'skipped', detail: 'no email found' });
          return;
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

        // Determine starting status: if the latest message is older than 30 days,
        // this is a historical thread that got swept up by the sync — it should not
        // appear in "Nog te antwoorden" because it's stale. Archive it immediately.
        const latestMessageMs = Math.max(
          ...parsedMessages.map(m => new Date(m.date).getTime()).filter(n => !Number.isNaN(n)),
          0
        );
        const STALE_MS = 30 * 24 * 60 * 60 * 1000;
        const isStale = latestMessageMs > 0 && Date.now() - latestMessageMs > STALE_MS;
        const initialStatus: ThreadStatus = isStale ? 'ARCHIVE' : 'TO_ANSWER';

        // Step 3: Insert the event
        const newRequest = {
          gmail_thread_id: tid,
          sender_name: extractedData.senderName || senderName,
          sender_email: senderEmail,
          occasion_type: extractedData.occasionType,
          event_date: extractedData.eventDate,
          start_time: extractedData.startTime,
          end_time: extractedData.endTime,
          guest_count: extractedData.guestCount,
          special_notes: extractedData.specialNotes,
          ai_summary: extractedData.aiSummary,
          status: initialStatus,
          archived_at: isStale ? new Date().toISOString() : null,
        };

        const { data: created, error: insertError } = await supabaseAdmin
          .from('private_event_requests')
          .insert(newRequest)
          .select()
          .single();

        if (insertError) {
          errors.push(`Thread ${tid}: ${insertError.message}`);
          threadOutcomes.push({ id: tid, subject: subjectHeader, outcome: 'error', detail: insertError.message });
          return;
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
          threadOutcomes.push({ id: tid, subject: subjectHeader, outcome: 'created', detail: `${senderName} <${senderEmail}>` });
        }
      } catch (threadError: any) {
        errors.push(`Thread ${tid}: ${threadError.message}`);
        threadOutcomes.push({ id: tid, subject: '', outcome: 'error', detail: threadError.message });
      }
    };

    // Process threads in parallel batches (concurrency = 10)
    const CONCURRENCY = 10;
    for (let i = 0; i < gmailThreads.length; i += CONCURRENCY) {
      const batch = gmailThreads.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processThread));
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

    // ── Auto-archive: active threads whose latest Gmail message is > 30 days old ──
    // Covers historical threads that got swept up by a wider sync (e.g. mails from
    // 2021 that only just got processed), or threads where AI never extracted an
    // event_date so the past-event check couldn't fire.
    const staleCutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const staleCutoffIso = new Date(staleCutoffMs).toISOString();
    const { data: activeThreadRows } = await supabaseAdmin
      .from('private_event_requests')
      .select('id')
      .in('status', ['TO_ANSWER', 'ANSWERED', 'CONSULTATION_PLANNED', 'GO']);

    if (activeThreadRows && activeThreadRows.length > 0) {
      const activeIds = activeThreadRows.map(t => t.id);
      const { data: latestMsgs } = await supabaseAdmin
        .from('messages')
        .select('thread_id, date')
        .in('thread_id', activeIds)
        .order('date', { ascending: false });

      const latestByThread = new Map<string, string>();
      for (const m of latestMsgs || []) {
        if (!latestByThread.has(m.thread_id)) {
          latestByThread.set(m.thread_id, m.date);
        }
      }

      const staleIds = activeIds.filter(id => {
        const latest = latestByThread.get(id);
        return latest && latest < staleCutoffIso;
      });

      if (staleIds.length > 0) {
        const { error: staleError } = await supabaseAdmin
          .from('private_event_requests')
          .update({ status: 'ARCHIVE', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .in('id', staleIds);
        if (!staleError) {
          autoArchived += staleIds.length;
          console.log(`[SYNC] Auto-archived ${staleIds.length} stale threads (>30d old)`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      alreadyUpToDate,
      autoArchived,
      totalThreads: gmailThreads.length,
      errors: errors.slice(0, 5),
      skipped: skipped.slice(0, 10),
      threadOutcomes: threadOutcomes.slice(0, 50),
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
