'use client';

import { useState, useEffect, useRef } from 'react';
import { Thread, ThreadStatus, Message } from '@/lib/types';
import { formatDate, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import {
  Calendar, Users, Sparkles, Save, ChevronDown, ChevronLeft,
  MessageSquare, Info, StickyNote, UserCheck,
  CheckCircle2, Circle, Clock, PartyPopper, FileText,
  Moon, Sun, Settings,
} from 'lucide-react';
import Image from 'next/image';
import { DatePickerInput } from './DatePickerInput';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import Link from 'next/link';

const STATUS_OPTIONS: ThreadStatus[] = [
  'TODO_REPLY',
  'REPLIED_NO_APPOINTMENT',
  'APPOINTMENT_SET',
  'CANCELLED',
  'ARCHIVE',
];

const OCCASION_OPTIONS = [
  { value: '', label: 'Onbekend' },
  { value: 'verjaardag',  label: '🎂 Verjaardag' },
  { value: 'receptie',   label: '🥂 Receptie' },
  { value: 'borrel',     label: '🍺 Borrel' },
  { value: 'diner',      label: '🍽️ Diner' },
  { value: 'trouwerij',  label: '💍 Trouwerij' },
  { value: 'anders',     label: '🎉 Anders' },
];

interface ThreadDetailPanelProps {
  thread: Thread;
  onUpdate?: (updated: Thread) => void;
}

/* ── Section header ─────────────────────────────────────── */
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

/* ── Field ──────────────────────────────────────────────── */
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

export function ThreadDetailPanel({ thread, onUpdate }: ThreadDetailPanelProps) {
  const appt = thread.extracted_appointment_json;
  const messages: Message[] = thread.messages || [];

  /* ── State ── */
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [status, setStatus]         = useState<ThreadStatus>(thread.status);
  const [notes, setNotes]           = useState(thread.notes || '');
  const [assignedTo, setAssignedTo] = useState(thread.assigned_to || '');
  const [hasUnread, setHasUnread]   = useState(thread.has_unread);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving]         = useState(false);

  /* Feestjegegevens — pre-filled from AI, manually editable */
  const [apptDate, setApptDate]         = useState(appt?.appointment?.date     ?? '');
  const [apptTime, setApptTime]         = useState(appt?.appointment?.time     ?? '');
  const [partySize, setPartySize]       = useState<string>(
    appt?.appointment?.partySize ? String(appt.appointment.partySize) : ''
  );
  const [occasion, setOccasion]         = useState(appt?.appointment?.occasion ?? '');
  const [bijzonderheden, setBijzonderheden] = useState(appt?.appointment?.notes ?? '');

  /* ── Handlers ── */
  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes,
          assigned_to: assignedTo || null,
          has_unread: hasUnread,
          manual_appointment: {
            date:      apptDate      || null,
            time:      apptTime      || null,
            partySize: partySize     ? parseInt(partySize) : null,
            occasion:  occasion      || null,
            notes:     bijzonderheden || null,
          },
        }),
      });
      if (!res.ok) throw new Error('Opslaan mislukt');
      const updated = await res.json();
      onUpdate?.(updated);
      toast.success('Opgeslagen');
    } catch {
      toast.error('Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  async function handleExtract() {
    setExtracting(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id }),
      });
      if (!res.ok) throw new Error('Extractie mislukt');
      toast.success('Extractie voltooid');
      window.location.reload();
    } catch {
      toast.error('Extractie mislukt');
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row -mx-4 md:-mx-6 -mb-4 md:-mb-6" style={{ height: '100dvh', overflow: 'hidden' }}>

      {/* ═══ LEFT — Overzicht & gegevens ═════════════════ */}
      <div className="w-full lg:w-2/3 shrink-0 flex flex-col gap-4 overflow-y-auto py-5 pr-8">

        {/* ── Logo + terug-knop (scrollen mee) ── */}
        <div className="flex flex-col items-start gap-2">
          <Link href="/dashboard" aria-label="Café De Heeren – home" className="w-[160px] h-[64px] m-5 block">
            <Image src="/logo.svg" alt="Café De Heeren" width={160} height={64} priority className="w-full h-full object-contain" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-3 py-1.5 transition-colors ml-5"
            style={{
              background: 'var(--clr-surface-low)',
              border: '1px solid var(--clr-outline-dim)',
              color: 'var(--clr-text-dim)',
            }}
          >
            <ChevronLeft size={14} />
            Dashboard
          </Link>
        </div>

        {/* ── Titelblok (geen kaart) ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-1 px-5">

          {/* Naam + onderwerp */}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight" style={{ color: 'var(--clr-text)' }}>
              {thread.contact_name || thread.contact_email}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--clr-text-muted)' }}>
              {thread.subject}
            </p>
          </div>

          {/* Status + dark mode + instellingen */}
          <div className="flex items-start gap-3 shrink-0">
            {/* Status */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-widest"
                style={{ color: 'var(--clr-text-muted)' }}>
                Status
              </label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ThreadStatus)}
                  className="rounded-full px-4 py-2 text-sm appearance-none cursor-pointer pr-8 transition-colors focus:outline-none border border-[#DDD5D0] dark:border-white/35"
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

            {/* Dark mode toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0"
              style={{ background: 'var(--clr-surface-low)', color: 'var(--clr-text-muted)' }}
              aria-label="Wissel thema"
            >
              {mounted && (theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />)}
            </button>

            {/* Instellingen */}
            <Link
              href="/dashboard/settings"
              className="w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0"
              style={{ background: 'var(--clr-surface-low)', color: 'var(--clr-text-muted)' }}
              aria-label="Instellingen"
            >
              <Settings size={15} />
            </Link>
          </div>
        </div>

        {/* AI Samenvatting — checklist */}
        <div className="bento-card ml-5 mr-5">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel icon={Info} label="Specificaties feestje" />
            {appt && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'var(--clr-surface-low)', color: 'var(--clr-text-muted)' }}>
                {Math.round(appt.confidence * 100)}% zekerheid
              </span>
            )}
          </div>

          {/* Checklist items */}
          <ul className="space-y-2">
            {[
              {
                icon: Calendar,
                label: 'Datum',
                value: appt?.appointment?.date
                  ? new Date(appt.appointment.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                  : null,
              },
              {
                icon: Clock,
                label: 'Tijdstip',
                value: appt?.appointment?.time ?? null,
              },
              {
                icon: Users,
                label: 'Aantal personen',
                value: appt?.appointment?.partySize ? `${appt.appointment.partySize} personen` : null,
              },
              {
                icon: PartyPopper,
                label: 'Gelegenheid',
                value: appt?.appointment?.occasion
                  ? appt.appointment.occasion.charAt(0).toUpperCase() + appt.appointment.occasion.slice(1)
                  : null,
              },
              {
                icon: FileText,
                label: 'Bijzonderheden',
                value: appt?.appointment?.notes ?? null,
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

          {/* Key evidence */}
          {appt?.keyEvidence && appt.keyEvidence.length > 0 && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--clr-outline)' }}>
              <p className="text-[10px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--clr-text-muted)' }}>
                Bewijs uit conversatie
              </p>
              <ul className="space-y-1">
                {appt.keyEvidence.map((ev: string, i: number) => (
                  <li key={i} className="text-xs italic px-2 py-1 rounded-lg"
                    style={{ background: 'var(--clr-surface-low)', color: 'var(--clr-text-dim)' }}>
                    "{ev}"
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!appt && !thread.extracted_summary && (
            <p className="text-sm italic" style={{ color: 'var(--clr-text-subtle)' }}>
              Nog geen extractie — klik op Nieuwe extractie.
            </p>
          )}
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="mt-3 btn-gold text-xs inline-flex items-center gap-1.5 py-2 px-4 self-start"
          >
            <Sparkles size={12} />
            {extracting ? 'Bezig…' : 'Nieuwe extractie'}
          </button>
        </div>

        {/* Feestjegegevens */}
        <div className="bento-card space-y-3 ml-5 mr-5" style={{ background: 'var(--clr-surface-low)', boxShadow: 'none', border: '1px solid var(--clr-outline)' }}>
          <SectionLabel icon={Calendar} label="Feestjegegevens" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum feestje">
              <DatePickerInput value={apptDate} onChange={setApptDate} />
            </Field>
            <Field label="Tijdstip">
              <input
                type="time"
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                className="w-full rounded-full px-4 py-2.5 text-sm transition-colors focus:outline-none border border-[#DDD5D0] dark:border-white/35 appearance-none"
                style={{
                  background: 'var(--clr-input)',
                  color: apptTime ? 'var(--clr-text)' : 'var(--clr-text-subtle)',
                }}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Aantal personen">
              <input
                type="number"
                min={1}
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                placeholder="Aantal"
                className="w-full rounded-full px-4 py-2.5 text-sm transition-colors focus:outline-none border border-[#DDD5D0] dark:border-white/35 appearance-none"
                style={{
                  background: 'var(--clr-input)',
                  color: 'var(--clr-text)',
                }}
              />
            </Field>
            <Field label="Gelegenheid">
              <div className="relative">
                <select
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  className="w-full rounded-full px-4 py-2.5 text-sm appearance-none cursor-pointer pr-9 transition-colors focus:outline-none border border-[#DDD5D0] dark:border-white/35"
                  style={{
                    background: 'var(--clr-input)',
                    color: 'var(--clr-text)',
                  }}
                >
                  {OCCASION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--clr-text-muted)' }} />
              </div>
            </Field>
          </div>

          <Field label="Bijzonderheden">
            <textarea
              value={bijzonderheden}
              onChange={(e) => setBijzonderheden(e.target.value)}
              rows={2}
              placeholder="Dieetwensen, thema, speciale verzoeken…"
              className="w-full rounded-2xl px-4 py-2.5 text-sm resize-none transition-colors focus:outline-none border border-[#DDD5D0] dark:border-white/35"
              style={{
                background: 'var(--clr-input)',
                color: 'var(--clr-text)',
              }}
            />
          </Field>
        </div>

        {/* Notities */}
        <div className="bento-card ml-5 mr-5" style={{ background: 'var(--clr-surface-low)', boxShadow: 'none', border: '1px solid var(--clr-outline)' }}>
          <SectionLabel icon={StickyNote} label="Interne notities" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Interne aantekeningen (niet zichtbaar voor gast)…"
            className="w-full rounded-2xl px-4 py-2.5 text-sm resize-none transition-colors focus:outline-none border border-[#DDD5D0] dark:border-white/35"
            style={{
              background: 'var(--clr-input)',
              color: 'var(--clr-text)',
            }}
          />
        </div>


        {/* Opslaan */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-accent inline-flex items-center gap-2 text-sm self-start ml-5"
        >
          <Save size={14} />
          {saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
        </button>
      </div>

      {/* ═══ RIGHT — E-mailwisseling (chat) ══════════════ */}
      <div className="w-full lg:w-1/3 min-w-0 flex flex-col overflow-y-auto px-8 py-5 border-l" style={{ borderColor: 'var(--clr-outline)' }}>
        {/* Chat header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--clr-text)' }}>
            E-mail discussie
          </h2>
          <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>
            {messages.length} berichten
          </span>
        </div>

        {/* Messages */}
        <div
          className="flex-1 space-y-4 pr-1"
        >
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
