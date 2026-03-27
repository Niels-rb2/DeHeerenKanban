'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PrivateEventRequest, ThreadStatus, Message } from '@/lib/types';
import { formatDate, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import {
  Calendar, Users, Sparkles, ChevronDown, ChevronLeft,
  Info, StickyNote, CheckCircle2, Circle, Clock, PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';

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
  trouwerij: '💍 Trouwerij',
  bruiloft: '💍 Bruiloft',
  jubileum: '🎉 Jubileum',
  bedrijfsfeest: '🎉 Bedrijfsfeest',
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

  // Editable fields
  const [eventDate, setEventDate] = useState(event.event_date || '');
  const [occasionType, setOccasionType] = useState(event.occasion_type || '');
  const [startTime, setStartTime] = useState(event.start_time || '');
  const [endTime, setEndTime] = useState(event.end_time || '');
  const [guestCount, setGuestCount] = useState(event.guest_count?.toString() || '');
  const [specialNotes, setSpecialNotes] = useState(event.special_notes || '');
  const [savingDetails, setSavingDetails] = useState(false);

  async function handleReanalyze() {
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/private-events/${event.id}/reanalyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Reanalyze failed');
      toast.success('Heropgeanalyseerd');
      window.location.reload();
    } catch {
      toast.error('Reanalyze mislukt');
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
    <div className="flex flex-col lg:flex-row -mx-4 md:-mx-6 -mb-4 md:-mb-6" style={{ height: '100dvh', overflow: 'hidden' }}>
      {/* ═══ LEFT — Event details ═════════════════ */}
      <div className="w-full lg:w-2/3 shrink-0 flex flex-col gap-4 overflow-y-auto pr-8">
        {/* Logo + back button */}
        <div className="flex flex-col items-start gap-0">
          <Link href="/private-events" aria-label="Café De Heeren – feestjes" className="w-[160px] h-[64px] m-5 block">
            <Image src="/logo.svg" alt="Café De Heeren" width={160} height={64} priority className="w-full h-full object-contain" />
          </Link>
          <Link
            href="/private-events"
            className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-3 py-1.5 transition-colors mb-5 ml-5"
            style={{
              background: 'var(--clr-surface-low)',
              border: '1px solid var(--clr-outline-dim)',
              color: 'var(--clr-text-dim)',
            }}
          >
            <ChevronLeft size={14} />
            Feestjes
          </Link>
        </div>

        {/* Title block */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-1 px-5">
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
        <div className="bento-card ml-5 mr-5">
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
                  <span className="text-xs font-medium" style={{ color: 'var(--clr-text-muted)' }}>{label}: </span>
                  {value ? (
                    <span className="text-xs" style={{ color: 'var(--clr-text)' }}>{value}</span>
                  ) : (
                    <span className="text-xs italic" style={{ color: 'var(--clr-text-subtle)' }}>Onbekend</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* AI Summary text */}
          {event.ai_summary && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--clr-outline)' }}>
              <p className="text-xs" style={{ color: 'var(--clr-text-dim)' }}>
                {event.ai_summary}
              </p>
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
            className="btn-gold text-xs inline-flex items-center gap-1.5 py-2 px-4 self-start"
          >
            <Sparkles size={12} />
            {reanalyzing ? 'Bezig…' : 'Heropanalyse'}
          </button>
        </div>

        {/* Special notes */}
        {event.special_notes && (
          <div className="bento-card ml-5 mr-5" style={{ background: 'var(--clr-surface-low)', boxShadow: 'none', border: '1px solid var(--clr-outline)' }}>
            <SectionLabel icon={StickyNote} label="Bijzonderheden" />
            <p className="text-sm" style={{ color: 'var(--clr-text)' }}>
              {event.special_notes}
            </p>
          </div>
        )}

        {/* Event details card - editable form */}
        <div className="bento-card ml-5 mr-5" style={{ background: 'var(--clr-surface-low)', boxShadow: 'none', border: '1px solid var(--clr-outline)' }}>
          <SectionLabel icon={Calendar} label="Details" />
          <div className="space-y-3">
            {/* Datum feestje */}
            <Field label="Datum feestje">
              <input
                type="date"
                value={eventDate ? eventDate.split('T')[0] : ''}
                onChange={(e) => setEventDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--clr-input)',
                  borderColor: 'var(--clr-outline)',
                  color: 'var(--clr-text)',
                }}
              />
            </Field>

            {/* Reden feestje (occasion) */}
            <Field label="Reden feestje">
              <select
                value={occasionType}
                onChange={(e) => setOccasionType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--clr-input)',
                  borderColor: 'var(--clr-outline)',
                  color: 'var(--clr-text)',
                }}
              >
                <option value="">-- Selecteer gelegenheid --</option>
                <option value="verjaardag">🎂 Verjaardag</option>
                <option value="receptie">🥂 Receptie</option>
                <option value="borrel">🍺 Borrel</option>
                <option value="diner">🍽️ Diner</option>
                <option value="trouwerij">💍 Trouwerij</option>
                <option value="bruiloft">💍 Bruiloft</option>
                <option value="jubileum">🎉 Jubileum</option>
                <option value="bedrijfsfeest">🎉 Bedrijfsfeest</option>
                <option value="anders">🎉 Anders</option>
              </select>
            </Field>

            {/* Begintijd - Eindtijd */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Begintijd">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
                  style={{
                    background: 'var(--clr-input)',
                    borderColor: 'var(--clr-outline)',
                    color: 'var(--clr-text)',
                  }}
                />
              </Field>
              <Field label="Eindtijd">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
                  style={{
                    background: 'var(--clr-input)',
                    borderColor: 'var(--clr-outline)',
                    color: 'var(--clr-text)',
                  }}
                />
              </Field>
            </div>

            {/* Aantal personen */}
            <Field label="Aantal personen">
              <input
                type="number"
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--clr-input)',
                  borderColor: 'var(--clr-outline)',
                  color: 'var(--clr-text)',
                }}
              />
            </Field>

            {/* Bijzonderheden */}
            <Field label="Bijzonderheden">
              <textarea
                value={specialNotes}
                onChange={(e) => setSpecialNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 resize-none"
                style={{
                  background: 'var(--clr-input)',
                  borderColor: 'var(--clr-outline)',
                  color: 'var(--clr-text)',
                }}
              />
            </Field>

            {/* Contact info (read-only) */}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--clr-outline)' }}>
              <Field label="E-mailadres">
                <p className="text-sm" style={{ color: 'var(--clr-text)' }}>{event.sender_email}</p>
              </Field>
              <Field label="Ontvangen">
                <p className="text-sm" style={{ color: 'var(--clr-text)' }}>
                  {new Date(event.created_at).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </Field>
            </div>

            {/* Save button */}
            <button
              onClick={handleSaveDetails}
              disabled={savingDetails}
              className="w-full btn-gold text-sm py-2 px-4 rounded-lg transition-all"
              style={{
                opacity: savingDetails ? 0.7 : 1,
              }}
            >
              {savingDetails ? 'Bezig…' : 'Opslaan'}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT — Email thread ══════════════ */}
      <div className="w-full lg:w-1/3 min-w-0 flex flex-col overflow-y-auto px-8 py-5 border-l" style={{ borderColor: 'var(--clr-outline)' }}>
        {/* Chat header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--clr-text)' }}>
            E-mailwisseling
          </h2>
          <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
            {messages.length} berichten
          </span>
        </div>

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
            messages.map((msg) => {
              const isOut = msg.direction === 'OUTBOUND';
              return (
                <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[82%]">
                    {/* Sender + time */}
                    <div className={`flex items-center gap-1.5 mb-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
                      {!isOut && (
                        <span className="text-xs font-semibold" style={{ color: 'var(--clr-text-dim)' }}>
                          {msg.from_name || msg.from_email}
                        </span>
                      )}
                      <span className="text-xs tabular-nums" style={{ color: 'var(--clr-text-subtle)' }}>
                        {formatDate(msg.date)}
                      </span>
                      {isOut && (
                        <span className="text-xs font-semibold" style={{ color: 'var(--clr-text-dim)' }}>
                          Café De Heeren
                        </span>
                      )}
                    </div>
                    {/* Bubble */}
                    <div
                      className={`p-3.5 text-sm whitespace-pre-wrap leading-relaxed ${
                        isOut ? 'msg-outbound' : 'msg-inbound'
                      }`}
                    >
                      {msg.body_plain || msg.snippet}
                    </div>
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
