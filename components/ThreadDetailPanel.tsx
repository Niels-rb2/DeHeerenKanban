'use client';

import { useState } from 'react';
import { Thread, ThreadStatus, Message } from '@/lib/types';
import { formatDate, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import {
  Calendar, Users, Sparkles, Save, ChevronDown,
  MessageSquare, Info, StickyNote, UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

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
    <div className="flex flex-col lg:flex-row gap-5 h-full">

      {/* ═══ LEFT — Overzicht & gegevens ═════════════════ */}
      <div
        className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 180px)' }}
      >
        {/* Contact + status */}
        <div className="bento-card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight truncate" style={{ color: 'var(--clr-text)' }}>
                {thread.contact_name || thread.contact_email}
              </p>
              {thread.contact_name && (
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--clr-text-muted)' }}>
                  {thread.contact_email}
                </p>
              )}
            </div>
            <span className={`badge text-xs shrink-0 ${STATUS_COLORS[thread.status]}`}>
              {STATUS_LABELS[thread.status]}
            </span>
          </div>

          {/* Status selector */}
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ThreadStatus)}
              className="input-dark appearance-none pr-8 cursor-pointer w-full text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--clr-text-muted)' }} />
          </div>
        </div>

        {/* AI Samenvatting */}
        <div className="bento-card">
          <SectionLabel icon={Info} label="AI samenvatting" />
          {thread.extracted_summary ? (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--clr-text-dim)' }}>
              {thread.extracted_summary}
            </p>
          ) : (
            <p className="text-sm italic" style={{ color: 'var(--clr-text-subtle)' }}>
              Nog geen samenvatting — klik op Nieuwe extractie.
            </p>
          )}
          {appt && (
            <p className="mt-2 text-xs" style={{ color: 'var(--clr-text-subtle)' }}>
              Zekerheid: {Math.round(appt.confidence * 100)}%
            </p>
          )}
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="mt-3 w-full btn-gold text-xs flex items-center justify-center gap-1.5 py-2"
          >
            <Sparkles size={12} />
            {extracting ? 'Bezig…' : 'Nieuwe extractie'}
          </button>
        </div>

        {/* Feestjegegevens */}
        <div className="bento-card space-y-3">
          <SectionLabel icon={Calendar} label="Feestjegegevens" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum feestje">
              <input
                type="date"
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="input-dark text-sm w-full"
              />
            </Field>
            <Field label="Tijdstip">
              <input
                type="time"
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                className="input-dark text-sm w-full"
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
                placeholder="0"
                className="input-dark text-sm w-full"
              />
            </Field>
            <Field label="Gelegenheid">
              <div className="relative">
                <select
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  className="input-dark appearance-none pr-7 cursor-pointer w-full text-sm"
                >
                  {OCCASION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
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
              className="input-dark resize-none text-sm w-full"
            />
          </Field>
        </div>

        {/* Notities */}
        <div className="bento-card">
          <SectionLabel icon={StickyNote} label="Interne notities" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Interne aantekeningen (niet zichtbaar voor gast)…"
            className="input-dark resize-none text-sm w-full"
          />
        </div>

        {/* Toegewezen + ongelezen */}
        <div className="bento-card space-y-3">
          <SectionLabel icon={UserCheck} label="Beheer" />

          <Field label="Toegewezen aan">
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Naam medewerker…"
              className="input-dark text-sm w-full"
            />
          </Field>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs" style={{ color: 'var(--clr-text-muted)' }}>Markeer als ongelezen</span>
            <button
              onClick={() => setHasUnread(!hasUnread)}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                hasUnread ? 'bg-[#88280B]' : 'bg-gray-200 dark:bg-[#332E29]'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                hasUnread ? 'left-5' : 'left-1'
              }`} />
            </button>
          </label>
        </div>

        {/* Opslaan */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-accent w-full flex items-center justify-center gap-2 text-sm"
        >
          <Save size={14} />
          {saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
        </button>
      </div>

      {/* ═══ RIGHT — E-mailwisseling (chat) ══════════════ */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Chat header */}
        <div
          className="flex items-center gap-2 px-1 mb-3"
        >
          <MessageSquare size={13} style={{ color: 'var(--clr-text-muted)' }} />
          <span
            className="text-[10px] font-medium uppercase tracking-widest"
            style={{ color: 'var(--clr-text-muted)' }}
          >
            E-mailwisseling · {messages.length} berichten
          </span>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto space-y-4 pr-1"
          style={{ maxHeight: 'calc(100vh - 220px)' }}
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
