'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DOMPurify from 'isomorphic-dompurify';
import { PrivateEventRequest, ThreadStatus, Message } from '@/lib/types';
import { formatDate, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import {
  Calendar, Users, Sparkles, ChevronDown, ChevronLeft,
  Info, StickyNote, CheckCircle2, Circle, Clock, PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Strip quoted replies, forwarded content and signatures from an email body
 * so each message bubble only shows the original content.
 */
function cleanMessageForDisplay(body: string): string {
  if (!body) return '';

  // Strip Framer boilerplate lines before processing
  let preprocessed = body
    .replace(/The form on your website just received a new submission!\s*/gi, '')
    .replace(/Je hebt de volgende aanvraag ontvangen via de website:\s*/gi, '');

  const lines = preprocessed.split('\n');
  const cleaned: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop at Framer footer
    if (/^This email is a submission/i.test(trimmed)) break;
    if (/^Not expecting this email/i.test(trimmed)) break;
    if (/support@framer\.com/i.test(trimmed)) break;

    // Stop at quoted lines (> prefix)
    if (trimmed.startsWith('>')) break;

    // Stop at forwarded-message separators
    // "___" or "---" (3+ underscores/dashes as separator)
    if (/^[_]{3,}$/.test(trimmed) || /^[-]{3,}$/.test(trimmed)) break;

    // Stop at forwarded headers: "Van: ...", "From: ..."
    if (/^Van:\s+/i.test(trimmed) || /^From:\s+/i.test(trimmed)) break;

    // Stop at "Op <date> schreef" / "Op <date> bij <time>" (Dutch quote header)
    if (/^Op\s+\d{1,2}\s+\w+\s+\d{4}\s+bij\s+/i.test(trimmed)) break;
    if (/^Op\s+\d{1,2}\s+\w+\s+\d{4}\s+om\s+/i.test(trimmed)) break;
    if (/^Op\s+\w+\s+\d{1,2}\s+\w+\s+\d{4}\s/i.test(trimmed)) break;

    // Stop at "On <date> ... wrote:" (English quote header)
    if (/^On\s+.+wrote:\s*$/i.test(trimmed)) break;

    // Stop at "Verzonden vanuit/vanaf" / "Verstuurd vanaf" / "Sent from"
    if (/^(Verzonden\s+vanuit|Verzonden\s+vanaf|Verstuurd\s+vanaf|Sent\s+from)\s/i.test(trimmed)) break;

    // Stop at signature markers followed by contact info
    if (/^(Met vriendelijke groet|Mvg|Groet|Groeten|Groetjes|Kind regards|Best regards|Vriendelijke groet|Hartelijke groet|Liefs|Cheers)\s*[,.]?\s*$/i.test(trimmed)) {
      // Include the greeting line itself, then grab the name line(s) after it
      cleaned.push(line);
      // Grab up to 2 more lines (name + maybe one more), then stop
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextTrimmed = lines[j].trim();
        // If this next line looks like a URL, phone, email header, or separator, stop
        if (!nextTrimmed) { cleaned.push(lines[j]); continue; }
        if (/^(www\.|http|[_]{3}|[-]{3}|Van:|From:|Op\s+\d|0\d{2,4}[\s-])/.test(nextTrimmed)) break;
        cleaned.push(lines[j]);
      }
      break;
    }

    cleaned.push(line);
  }

  // Final cleanup: trim trailing empty lines
  let result = cleaned.join('\n').trimEnd();

  // Handle inline signatures in HTML-converted text (no line breaks)
  // e.g. "Tekst hier.  Met vriendelijke groet,Suzan Bijmanwww..."
  const inlineSigPatterns = [
    /\s{2,}Met vriendelijke groet[,.]?.*/i,
    /\s{2,}Mvg[,.]?.*/i,
    /\s{2,}Groet(?:en|jes)?[,.]?.*/i,
    /\s{2,}Kind regards[,.]?.*/i,
  ];
  for (const pattern of inlineSigPatterns) {
    const match = result.match(pattern);
    if (match && match.index !== undefined) {
      result = result.substring(0, match.index).trimEnd();
      break;
    }
  }

  return result;
}

/**
 * Clean HTML email: strip quoted content, signatures, and sanitize for display.
 * Returns safe HTML string ready for dangerouslySetInnerHTML.
 */
function cleanHtmlForDisplay(html: string): string {
  // Remove <style> blocks
  let cleaned = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove <img> tags (logos, spacers, tracking pixels)
  cleaned = cleaned.replace(/<img[^>]*>/gi, '');

  // Strip Framer boilerplate text
  cleaned = cleaned.replace(/The form on your website just received a new submission!\s*/gi, '');
  cleaned = cleaned.replace(/Je hebt de volgende aanvraag ontvangen via de website:\s*/gi, '');
  cleaned = cleaned.replace(/This email is a submission of a Framer form[\s\S]*$/i, '');
  cleaned = cleaned.replace(/Not expecting this email\?[\s\S]*$/i, '');

  // ── Strip known signature / quote containers by ID ────────────
  // Outlook mobile: separator line + signature + forwarded content
  cleaned = cleaned.replace(/<div[^>]*id="ms-outlook-mobile-body-separator-line"[\s\S]*$/i, '');
  cleaned = cleaned.replace(/<div[^>]*id="ms-outlook-mobile-signature"[\s\S]*$/i, '');
  // Outlook desktop: divRplyFwdMsg
  cleaned = cleaned.replace(/<div[^>]*id="divRplyFwdMsg"[\s\S]*$/i, '');
  cleaned = cleaned.replace(/<div[^>]*id="appendonsend"[\s\S]*$/i, '');
  // Outlook separator border
  cleaned = cleaned.replace(/<div[^>]*style="[^"]*border-top:\s*solid\s+#[A-Fa-f0-9]+[\s\S]*$/i, '');
  // Bloop (macOS mail client) signature
  cleaned = cleaned.replace(/<div[^>]*id="bloop_sign_[^"]*"[\s\S]*$/i, '');
  // Gmail quote blocks
  cleaned = cleaned.replace(/<div[^>]*class="gmail_quote"[\s\S]*$/i, '');
  cleaned = cleaned.replace(/<div[^>]*class="gmail_attr"[\s\S]*$/i, '');
  // Generic blockquote
  cleaned = cleaned.replace(/<blockquote[\s\S]*$/i, '');

  // ── Strip signature greetings and everything after ────────────
  const sigPatterns = [
    /<div[^>]*>\s*Met vriendelijke groet[\s\S]*$/i,
    /<div[^>]*>\s*Mvg[\s,.][\s\S]*$/i,
    /<div[^>]*>\s*Groet(?:en|jes)?[\s,.][\s\S]*$/i,
    /<div[^>]*>\s*Kind regards[\s\S]*$/i,
    /<div[^>]*>\s*Vriendelijke groet[\s\S]*$/i,
    /<div[^>]*>\s*Hartelijke groet[\s\S]*$/i,
    // "Verzonden vanaf Outlook" / "Sent from" as plain text in a div
    /<div[^>]*>\s*Verzonden\s+(?:vanaf|vanuit)[\s\S]*$/i,
    /<div[^>]*>\s*Sent\s+from[\s\S]*$/i,
    // "Op <date> bij/om ... schreef:" (Dutch quote intro)
    /<div[^>]*>\s*Op\s+\d{1,2}\s+\w+\s+\d{4}\s+(?:bij|om)[\s\S]*$/i,
  ];

  for (const pattern of sigPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // ── Strip ALL inline styles (removes height/padding/margin that cause gaps) ──
  cleaned = cleaned.replace(/\s*style="[^"]*"/gi, '');

  // Remove clutter IDs
  cleaned = cleaned.replace(/\s*id="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s*class="[^"]*"/gi, '');

  // Remove table layout elements entirely (keep their text content via DOMPurify)
  cleaned = cleaned.replace(/<\/?(table|tbody|thead|tfoot|tr|td|th|col|colgroup|caption)[^>]*>/gi, '');

  // Sanitize with DOMPurify - allow basic formatting tags
  let sanitized = DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'a'],
    ALLOWED_ATTR: ['href', 'target'],
    ADD_ATTR: ['target'],
  });

  // ── Collapse whitespace (run multiple passes for nested empties) ──
  let prev = '';
  while (prev !== sanitized) {
    prev = sanitized;
    // Remove empty tags: <p></p>, <div></div>, <span></span>, etc.
    sanitized = sanitized.replace(/<(p|div|span|h[1-3])[^>]*>\s*<\/\1>/gi, '');
    // Remove tags that only contain <br> or &nbsp;
    sanitized = sanitized.replace(/<(p|div|span)[^>]*>\s*(?:<br\s*\/?>|\s|&nbsp;)*\s*<\/\1>/gi, '');
  }
  // Collapse 3+ consecutive <br> into max 2
  sanitized = sanitized.replace(/(<br\s*\/?\s*>[\s]*){3,}/gi, '<br><br>');
  // Remove leading <br> tags
  sanitized = sanitized.replace(/^(\s*<br\s*\/?\s*>\s*)+/i, '');
  // Remove trailing <br> tags
  sanitized = sanitized.replace(/(\s*<br\s*\/?\s*>\s*)+$/i, '');

  // Add target="_blank" to all links
  return sanitized.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
}

/**
 * Convert plain-text email body to formatted HTML for display.
 */
function plainTextToHtml(text: string): string {
  const cleaned = cleanMessageForDisplay(text);
  // Escape HTML entities, then convert line breaks to <br>
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n{3,}/g, '\n\n')   // Collapse 3+ newlines to max 2
    .replace(/\n/g, '<br>');
}

/**
 * Get clean HTML for a message.
 * For outbound (café) messages: prefer HTML for rich formatting.
 * For inbound (customer) messages: prefer plain text (cleaner to strip quotes).
 * If only one format is available, use that.
 */
function getMessageHtml(msg: { body_plain: string | null; body_html: string | null; snippet: string; direction?: string }): string {
  const hasPlain = !!msg.body_plain;
  const hasHtml = !!msg.body_html;
  const isOutbound = msg.direction === 'OUTBOUND';

  // Outbound: prefer HTML (has bold, paragraphs, structure)
  if (isOutbound && hasHtml) {
    return cleanHtmlForDisplay(msg.body_html!);
  }

  // Inbound: prefer plain text (easier to strip Outlook/Gmail quoted content)
  if (hasPlain) {
    return plainTextToHtml(msg.body_plain!);
  }

  // Fallback: use whatever is available
  if (hasHtml) {
    return cleanHtmlForDisplay(msg.body_html!);
  }

  return plainTextToHtml(msg.snippet || '');
}

const STATUS_OPTIONS: ThreadStatus[] = [
  'TO_ANSWER',
  'ANSWERED',
  'CONSULTATION_PLANNED',
  'GO',
  'NO_GO',
  'ARCHIVE',
];

const OCCASION_LABELS: Record<string, string> = {
  verjaardag: '🎂 Verjaardag',
  receptie: '🥂 Receptie',
  borrel: '🍺 Borrel',
  diner: '🍽️ Diner',
  diner_borrel: '🍽️🍺 Diner + borrel',
  trouwerij: '💍 Bruiloft',
  bruiloft: '💍 Bruiloft',
  jubileum: '🎉 Jubileum',
  besloten_feest: '🎊 Besloten feest',
  bedrijfsfeest: '🏢 Bedrijfsfeest',
  bedrijfspubquiz: '🧠 Bedrijfspubquiz',
  themafeest: '🎭 Themafeest',
  anders: '🎉 Anders',
};

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={13} style={{ color: 'var(--clr-text-muted)' }} />
      <span
        className="text-[10px] font-medium uppercase tracking-widest"
        style={{ color: 'var(--clr-text-muted)' }}
      >
        {label}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: 'var(--clr-text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

interface EventDetailPanelProps {
  event: PrivateEventRequest & { messages?: Message[] };
}

export function EventDetailPanel({ event }: EventDetailPanelProps) {
  const messages: Message[] = event.messages || [];
  const [status, setStatus] = useState<ThreadStatus>(event.status);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [mobileTab, setMobileTab] = useState<'specificaties' | 'emails'>('specificaties');

  // Editable fields
  const [eventDate, setEventDate] = useState(event.event_date || '');
  const [occasionType, setOccasionType] = useState(event.occasion_type || '');
  const [startTime, setStartTime] = useState(event.start_time || '');
  const [endTime, setEndTime] = useState(event.end_time || '');
  const [guestCount, setGuestCount] = useState(event.guest_count?.toString() || '');
  const [specialNotes, setSpecialNotes] = useState(event.special_notes || '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);

  async function handleReanalyze() {
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/private-events/${event.id}/reanalyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.details || body.error || `HTTP ${res.status}`);
      }
      toast.success('Heropgeanalyseerd');
      window.location.reload();
    } catch (err: any) {
      toast.error(`Reanalyze mislukt: ${err?.message || 'onbekende fout'}`);
    } finally {
      setReanalyzing(false);
    }
  }

  async function handleStatusChange(newStatus: ThreadStatus) {
    if (newStatus === status) return;

    setUpdatingStatus(true);
    setStatus(newStatus);

    try {
      const res = await fetch(`/api/private-events/${event.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Status update failed');
      toast.success('Status bijgewerkt');
    } catch {
      toast.error('Status bijwerken mislukt');
      setStatus(event.status);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSaveDetails() {
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/private-events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_date: eventDate || null,
          occasion_type: occasionType || null,
          start_time: startTime || null,
          end_time: endTime || null,
          guest_count: guestCount ? parseInt(guestCount) : null,
          special_notes: specialNotes || null,
        }),
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success('Gegevens opgeslagen');
    } catch {
      toast.error('Opslaan mislukt');
    } finally {
      setSavingDetails(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row -mx-4 md:-mx-6 -mb-4 md:-mb-6 min-h-dvh lg:h-dvh lg:overflow-hidden">
      {/* ═══ LEFT — Event details ═════════════════ */}
      <div className={`w-full lg:w-2/3 shrink-0 flex flex-col gap-4 lg:overflow-y-auto lg:pr-8 pb-5 ${mobileTab === 'specificaties' ? '' : 'hidden lg:flex'}`}>
        {/* Logo */}
        <div className="px-4 pt-3 md:px-5">
          <Link href="/dashboard" aria-label="Café De Heeren – feestjes" className="w-[120px] h-[48px] md:w-[160px] md:h-[64px] block">
            <Image src="/logo.svg" alt="Café De Heeren" width={160} height={64} priority className="w-full h-full object-contain" />
          </Link>
        </div>

        {/* Back button + mobile tab toggle */}
        <div className="flex items-center gap-3 px-4 md:px-5 mb-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-3 py-1.5 transition-colors shrink-0"
            style={{
              background: 'var(--clr-surface-low)',
              border: '1px solid var(--clr-outline-dim)',
              color: 'var(--clr-text-dim)',
            }}
          >
            <ChevronLeft size={14} />
            Feestjes
          </Link>

          {/* Mobile tab toggle — hidden on desktop */}
          <div
            className="flex rounded-full p-1 gap-1 flex-1 lg:hidden"
            style={{ background: 'var(--clr-surface-low)' }}
          >
            <button
              onClick={() => setMobileTab('specificaties')}
              className="flex-1 py-1.5 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer text-center whitespace-nowrap"
              style={{
                background: mobileTab === 'specificaties' ? 'var(--clr-surface)' : 'transparent',
                color: mobileTab === 'specificaties' ? 'var(--clr-text)' : 'var(--clr-text-muted)',
                boxShadow: mobileTab === 'specificaties' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Specificaties
            </button>
            <button
              onClick={() => setMobileTab('emails')}
              className="flex-1 py-1.5 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer text-center whitespace-nowrap"
              style={{
                background: mobileTab === 'emails' ? 'var(--clr-surface)' : 'transparent',
                color: mobileTab === 'emails' ? 'var(--clr-text)' : 'var(--clr-text-muted)',
                boxShadow: mobileTab === 'emails' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              E-mails
            </button>
          </div>
        </div>

        {/* Title block */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-1 px-4 md:px-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight" style={{ color: 'var(--clr-text)' }}>
              {event.sender_name || event.sender_email}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--clr-text-muted)' }}>
              {event.sender_email}
            </p>
          </div>

          {/* Status selector */}
          <div className="flex flex-col gap-1 items-start">
            <label className="text-[10px] font-medium uppercase tracking-widest"
              style={{ color: 'var(--clr-text-muted)' }}>
              Status
            </label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as ThreadStatus)}
                disabled={updatingStatus}
                className="rounded-full px-4 py-2 text-sm appearance-none cursor-pointer pr-8 transition-colors focus:outline-none border border-[#DDD5D0] dark:border-white/35 disabled:opacity-50"
                style={{
                  background: 'var(--clr-input)',
                  color: 'var(--clr-text)',
                }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--clr-text-muted)' }} />
            </div>
          </div>
        </div>

        {/* AI Summary */}
        <div className="bento-card mx-4 md:mx-5">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel icon={Info} label="Feestje samenvatting" />
          </div>

          {/* Event checklist */}
          <ul className="space-y-2 mb-3">
            {[
              {
                icon: PartyPopper,
                label: 'Gelegenheid',
                value: event.occasion_type ? OCCASION_LABELS[event.occasion_type.toLowerCase()] || event.occasion_type : null,
              },
              {
                icon: Calendar,
                label: 'Datum',
                value: event.event_date
                  ? new Date(event.event_date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                  : null,
              },
              {
                icon: Clock,
                label: 'Tijdstip',
                value: event.start_time ?? null,
              },
              {
                icon: Users,
                label: 'Aantal personen',
                value: event.guest_count ? `${event.guest_count} personen` : null,
              },
            ].map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex items-start gap-2.5">
                {value ? (
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
                ) : (
                  <Circle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--clr-text-subtle)' }} />
                )}
                <div className="min-w-0">
                  <span className="text-sm font-medium" style={{ color: 'var(--clr-text-muted)' }}>{label}: </span>
                  {value ? (
                    <span className="text-sm" style={{ color: 'var(--clr-text)' }} suppressHydrationWarning>{value}</span>
                  ) : (
                    <span className="text-sm italic" style={{ color: 'var(--clr-text-subtle)' }}>Onbekend</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* AI Summary text */}
          {event.ai_summary && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--clr-outline)' }}>
              <ul className="space-y-1.5">
                {event.ai_summary
                  .split('\n')
                  .map(line => line.trim())
                  .filter(line => line.length > 0)
                  .map((line, i) => {
                    // Strip leading bullet chars (•, -, *)
                    const text = line.replace(/^[•\-\*]\s*/, '');
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--clr-text-dim)' }}>
                        <span className="shrink-0 mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>•</span>
                        <span>{text}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          {!event.ai_summary && (
            <p className="text-sm italic mb-3" style={{ color: 'var(--clr-text-subtle)' }}>
              Nog geen samenvatting — klik op Heropanalyse.
            </p>
          )}

          <button
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="btn-gold text-sm inline-flex items-center gap-1.5 py-3 px-6 rounded-full font-semibold self-start mt-4"
          >
            <Sparkles size={12} />
            {reanalyzing ? 'Bezig…' : 'Heropanalyse'}
          </button>
        </div>

        {/* Special notes */}
        {event.special_notes && (
          <div className="bento-card mx-4 md:mx-5" style={{ background: 'var(--clr-surface-low)', boxShadow: 'none', border: '1px solid var(--clr-outline)' }}>
            <SectionLabel icon={StickyNote} label="Bijzonderheden" />
            {event.special_notes.includes('\n') || event.special_notes.includes('•') ? (
              <ul className="space-y-1.5">
                {event.special_notes
                  .split('\n')
                  .map(line => line.trim())
                  .filter(line => line.length > 0)
                  .map((line, i) => {
                    const text = line.replace(/^[•\-\*]\s*/, '');
                    return (
                      <li key={i} className="flex items-start gap-2 text-base" style={{ color: 'var(--clr-text)' }}>
                        <span className="shrink-0 mt-0.5" style={{ color: 'var(--clr-text-muted)' }}>•</span>
                        <span>{text}</span>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="text-base" style={{ color: 'var(--clr-text)' }}>
                {event.special_notes}
              </p>
            )}
          </div>
        )}

        {/* Event details card - editable form */}
        <div className="bento-card mx-4 md:mx-5" style={{ background: 'var(--clr-surface-low)', boxShadow: 'none', border: '1px solid var(--clr-outline)' }}>
          <SectionLabel icon={Calendar} label="Details" />
          <div className="space-y-3">
            {/* Datum feestje | Reden feestje | Aantal personen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Field label="Datum feestje">
                <div className="relative">
                  <input
                    type="date"
                    value={eventDate ? eventDate.split('T')[0] : ''}
                    onChange={(e) => setEventDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                    className="w-full px-3 py-2 pr-9 rounded-lg text-base border appearance-none focus:outline-none focus:ring-2"
                    style={{
                      background: 'var(--clr-input)',
                      borderColor: 'var(--clr-input-border)',
                      color: 'var(--clr-text)',
                    }}
                  />
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--clr-text-muted)' }} />
                </div>
              </Field>

              <Field label="Reden feestje">
                <div className="relative">
                  <select
                    value={occasionType}
                    onChange={(e) => setOccasionType(e.target.value)}
                    className="w-full px-3 py-2 pr-9 rounded-lg text-base border appearance-none focus:outline-none focus:ring-2"
                    style={{
                      background: 'var(--clr-input)',
                      borderColor: 'var(--clr-input-border)',
                      color: 'var(--clr-text)',
                    }}
                    suppressHydrationWarning
                  >
                    <option value="">-- Selecteer --</option>
                    <option value="verjaardag">🎂 Verjaardag</option>
                    <option value="receptie">🥂 Receptie</option>
                    <option value="borrel">🍺 Borrel</option>
                    <option value="diner">🍽️ Diner</option>
                    <option value="diner_borrel">🍽️🍺 Diner + borrel</option>
                    <option value="bruiloft">💍 Bruiloft</option>
                    <option value="jubileum">🎉 Jubileum</option>
                    <option value="besloten_feest">🎊 Besloten feest</option>
                    <option value="bedrijfsfeest">🏢 Bedrijfsfeest</option>
                    <option value="bedrijfspubquiz">🧠 Bedrijfspubquiz</option>
                    <option value="themafeest">🎭 Themafeest</option>
                    <option value="anders">🎉 Anders</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--clr-text-muted)' }} />
                </div>
              </Field>

              <Field label="Aantal personen">
                <input
                  type="number"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-base border focus:outline-none focus:ring-2"
                  style={{
                    background: 'var(--clr-input)',
                    borderColor: 'var(--clr-input-border)',
                    color: 'var(--clr-text)',
                  }}
                />
              </Field>
            </div>

            {/* Begintijd - Eindtijd */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Begintijd">
                <div className="relative">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 pr-9 rounded-lg text-base border appearance-none focus:outline-none focus:ring-2"
                    style={{
                      background: 'var(--clr-input)',
                      borderColor: 'var(--clr-input-border)',
                      color: 'var(--clr-text)',
                    }}
                  />
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--clr-text-muted)' }} />
                </div>
              </Field>
              <Field label="Eindtijd">
                <div className="relative">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 pr-9 rounded-lg text-base border appearance-none focus:outline-none focus:ring-2"
                    style={{
                      background: 'var(--clr-input)',
                      borderColor: 'var(--clr-input-border)',
                      color: 'var(--clr-text)',
                    }}
                  />
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--clr-text-muted)' }} />
                </div>
              </Field>
            </div>

            {/* Bijzonderheden */}
            <Field label="Bijzonderheden">
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
                value={specialNotes}
                onChange={(e) => {
                  setSpecialNotes(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                rows={1}
                className="w-full px-3 py-2 rounded-lg text-base border focus:outline-none focus:ring-2 resize-none overflow-hidden"
                style={{
                  background: 'var(--clr-input)',
                  borderColor: 'var(--clr-input-border)',
                  color: 'var(--clr-text)',
                }}
              />
            </Field>

            {/* Contact info (read-only) */}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--clr-outline)' }}>
              <Field label="E-mailadres">
                <p className="text-base" style={{ color: 'var(--clr-text)' }}>{event.sender_email}</p>
              </Field>
              <Field label="Ontvangen">
                <p className="text-base" style={{ color: 'var(--clr-text)' }}>
                  {new Date(event.created_at).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </Field>
            </div>

            {/* Save button */}
            <button
              onClick={handleSaveDetails}
              disabled={savingDetails}
              className="inline-flex items-center gap-1.5 bg-[#88280B] hover:bg-[#a03010]
                         disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-full
                         transition-colors text-sm"
            >
              {savingDetails ? 'Bezig…' : 'Opslaan'}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT — Email thread ══════════════ */}
      <div className={`w-full lg:w-1/3 min-w-0 flex flex-col overflow-y-auto px-4 md:px-8 pt-3 pb-5 lg:py-5 lg:border-l ${mobileTab === 'emails' ? '' : 'hidden lg:flex'}`} style={{ borderColor: 'var(--clr-outline)' }}>
        {/* Mobile-only: logo + back + toggle (shown when emails tab is active) */}
        <div className="lg:hidden mb-3">
          <Link href="/dashboard" aria-label="Café De Heeren – feestjes" className="w-[120px] h-[48px] block mb-4">
            <Image src="/logo.svg" alt="Café De Heeren" width={160} height={64} priority className="w-full h-full object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-3 py-1.5 transition-colors shrink-0"
              style={{
                background: 'var(--clr-surface-low)',
                border: '1px solid var(--clr-outline-dim)',
                color: 'var(--clr-text-dim)',
              }}
            >
              <ChevronLeft size={14} />
              Feestjes
            </Link>
            <div
              className="flex rounded-full p-1 gap-1 flex-1"
              style={{ background: 'var(--clr-surface-low)' }}
            >
              <button
                onClick={() => setMobileTab('specificaties')}
                className="flex-1 py-1.5 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer text-center whitespace-nowrap"
                style={{
                  background: mobileTab === 'specificaties' ? 'var(--clr-surface)' : 'transparent',
                  color: mobileTab === 'specificaties' ? 'var(--clr-text)' : 'var(--clr-text-muted)',
                  boxShadow: mobileTab === 'specificaties' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                Specificaties
              </button>
              <button
                onClick={() => setMobileTab('emails')}
                className="flex-1 py-1.5 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer text-center whitespace-nowrap"
                style={{
                  background: mobileTab === 'emails' ? 'var(--clr-surface)' : 'transparent',
                  color: mobileTab === 'emails' ? 'var(--clr-text)' : 'var(--clr-text-muted)',
                  boxShadow: mobileTab === 'emails' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                E-mails
              </button>
            </div>
          </div>
        </div>

        {/* Chat header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl lg:text-2xl font-semibold" style={{ color: 'var(--clr-text)' }}>
            E-mailwisseling
          </h2>
          <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
            {messages.length} berichten
          </span>
        </div>

        {/* Sort toggle */}
        {messages.length > 1 && (
          <div
            className="flex rounded-full p-1 gap-1 mb-4"
            style={{ background: 'var(--clr-surface-low)' }}
          >
            <button
              onClick={() => setNewestFirst(true)}
              className="flex-1 py-1.5 px-3 rounded-full text-xs font-medium transition-all cursor-pointer text-center"
              style={{
                background: newestFirst ? 'var(--clr-surface)' : 'transparent',
                color: newestFirst ? 'var(--clr-text)' : 'var(--clr-text-muted)',
                boxShadow: newestFirst ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Nieuwste eerst
            </button>
            <button
              onClick={() => setNewestFirst(false)}
              className="flex-1 py-1.5 px-3 rounded-full text-xs font-medium transition-all cursor-pointer text-center"
              style={{
                background: !newestFirst ? 'var(--clr-surface)' : 'transparent',
                color: !newestFirst ? 'var(--clr-text)' : 'var(--clr-text-muted)',
                boxShadow: !newestFirst ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Oudste eerst
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-4 pr-1">
          {messages.length === 0 ? (
            <div
              className="text-center py-16 text-sm rounded-2xl"
              style={{ color: 'var(--clr-text-subtle)', background: 'var(--clr-surface-low)' }}
            >
              Geen berichten geladen
            </div>
          ) : (
            (newestFirst ? [...messages] : [...messages].reverse()).map((msg) => {
              const isOut = msg.direction === 'OUTBOUND';
              const msgDate = new Date(msg.date);
              const dateStr = msgDate.toLocaleDateString('nl-NL', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
              });
              const timeStr = msgDate.toLocaleTimeString('nl-NL', {
                hour: '2-digit', minute: '2-digit',
              });
              return (
                <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[82%]">
                    {/* Sender + date + time */}
                    <div className={`flex items-center gap-1.5 mb-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
                      {!isOut && (
                        <span className="text-xs font-semibold" style={{ color: 'var(--clr-text-dim)' }}>
                          {msg.from_name || msg.from_email}
                        </span>
                      )}
                      <span className="text-xs tabular-nums" style={{ color: 'var(--clr-text-subtle)' }}>
                        {dateStr} · {timeStr}
                      </span>
                      {isOut && (
                        <span className="text-xs font-semibold" style={{ color: 'var(--clr-text-dim)' }}>
                          Café De Heeren
                        </span>
                      )}
                    </div>
                    {/* Bubble */}
                    <div
                      className={`p-3.5 text-sm leading-relaxed msg-body ${
                        isOut ? 'msg-outbound' : 'msg-inbound'
                      }`}
                      dangerouslySetInnerHTML={{ __html: getMessageHtml(msg) }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
