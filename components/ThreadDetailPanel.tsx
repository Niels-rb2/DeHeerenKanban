'use client';

import { useState } from 'react';
import { Thread, ThreadStatus, Message } from '@/lib/types';
import { formatDate, formatDateFull, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import { Calendar, Users, Clock, Sparkles, Save, RotateCcw, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_OPTIONS: ThreadStatus[] = [
  'TODO_REPLY',
  'REPLIED_NO_APPOINTMENT',
  'APPOINTMENT_SET',
  'CANCELLED',
  'ARCHIVE',
];

const OCCASION_LABELS: Record<string, string> = {
  verjaardag: 'Verjaardag',
  receptie: 'Receptie',
  borrel: 'Borrel',
  diner: 'Diner',
  trouwerij: 'Trouwerij',
  anders: 'Anders',
};

interface ThreadDetailPanelProps {
  thread: Thread;
  onUpdate?: (updated: Thread) => void;
}

export function ThreadDetailPanel({ thread, onUpdate }: ThreadDetailPanelProps) {
  const [status, setStatus] = useState<ThreadStatus>(thread.status);
  const [notes, setNotes] = useState(thread.notes || '');
  const [assignedTo, setAssignedTo] = useState(thread.assigned_to || '');
  const [hasUnread, setHasUnread] = useState(thread.has_unread);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const appt = thread.extracted_appointment_json;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes, assigned_to: assignedTo || null, has_unread: hasUnread }),
      });
      if (!res.ok) throw new Error('Opslaan mislukt');
      const updated = await res.json();
      onUpdate?.(updated);
      toast.success('Opgeslagen');
    } catch (e) {
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
    } catch (e) {
      toast.error('Extractie mislukt');
    } finally {
      setExtracting(false);
    }
  }

  const messages: Message[] = thread.messages || [];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: message timeline */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="bento-card mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-bold mb-1 leading-tight" style={{ color: 'var(--clr-text)' }}>
                {thread.subject}
              </h1>
              <p className="text-sm" style={{ color: 'var(--clr-text-muted)' }}>
                {thread.contact_name && <span className="font-medium">{thread.contact_name} · </span>}
                {thread.contact_email}
              </p>
            </div>
            <span className={`badge text-xs shrink-0 ${STATUS_COLORS[thread.status]}`}>
              {STATUS_LABELS[thread.status]}
            </span>
          </div>

          {/* Extracted summary */}
          {thread.extracted_summary && (
            <div
              className="mt-3 p-3 rounded-xl text-sm"
              style={{ background: 'var(--clr-surface-low)', color: 'var(--clr-text-dim)' }}
            >
              <span className="font-medium" style={{ color: 'var(--clr-text)' }}>AI samenvatting: </span>
              {thread.extracted_summary}
            </div>
          )}
        </div>

        {/* Appointment card */}
        {appt?.hasAppointment && appt.appointment && (
          <div className="bento-card mb-4 border-l-4" style={{ borderLeftColor: '#16a34a' }}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-green-700 dark:text-green-400" />
              <span className="font-semibold text-sm text-green-700 dark:text-green-400">Afspraak bevestigd</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                {Math.round(appt.confidence * 100)}% zekerheid
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {appt.appointment.date && (
                <div>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Datum</span>
                  <p className="font-medium" style={{ color: 'var(--clr-text)' }}>
                    {formatDateFull(appt.appointment.date)}
                  </p>
                </div>
              )}
              {appt.appointment.time && (
                <div>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Tijd</span>
                  <p className="font-medium" style={{ color: 'var(--clr-text)' }}>
                    {appt.appointment.time}
                  </p>
                </div>
              )}
              {appt.appointment.partySize && (
                <div>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Aantal personen</span>
                  <p className="font-medium" style={{ color: 'var(--clr-text)' }}>
                    {appt.appointment.partySize}
                  </p>
                </div>
              )}
              {appt.appointment.occasion && (
                <div>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Gelegenheid</span>
                  <p className="font-medium" style={{ color: 'var(--clr-text)' }}>
                    {OCCASION_LABELS[appt.appointment.occasion] || appt.appointment.occasion}
                  </p>
                </div>
              )}
            </div>
            {appt.appointment.notes && (
              <p className="mt-2 text-sm" style={{ color: 'var(--clr-text-dim)' }}>
                {appt.appointment.notes}
              </p>
            )}
            {appt.keyEvidence?.length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--clr-outline)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--clr-text-muted)' }}>
                  Bewijs:
                </p>
                <ul className="space-y-0.5">
                  {appt.keyEvidence.map((ev, i) => (
                    <li key={i} className="text-xs italic" style={{ color: 'var(--clr-text-dim)' }}>
                      "{ev}"
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Message timeline */}
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div
              className="text-center py-12 text-sm rounded-2xl"
              style={{ color: 'var(--clr-text-subtle)', background: 'var(--clr-surface-low)' }}
            >
              Geen berichten geladen
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
              >
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-2 mb-1">
                    {msg.direction === 'INBOUND' && (
                      <span className="text-xs font-medium" style={{ color: 'var(--clr-text-dim)' }}>
                        {msg.from_name || msg.from_email}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--clr-text-subtle)' }}>
                      {formatDate(msg.date)}
                    </span>
                    {msg.direction === 'OUTBOUND' && (
                      <span className="text-xs font-medium" style={{ color: 'var(--clr-text-dim)' }}>
                        {msg.from_name || msg.from_email}
                      </span>
                    )}
                  </div>
                  <div
                    className={`p-3 text-sm whitespace-pre-wrap leading-relaxed ${
                      msg.direction === 'INBOUND' ? 'msg-inbound' : 'msg-outbound'
                    }`}
                  >
                    {msg.body_plain || msg.snippet}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: actions sidebar */}
      <div className="w-full lg:w-72 shrink-0 space-y-4">
        {/* Status */}
        <div className="bento-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--clr-text)' }}>
            Status
          </h3>
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ThreadStatus)}
              className="input-dark appearance-none pr-8 cursor-pointer"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--clr-text-muted)' }}
            />
          </div>
        </div>

        {/* AI Extract */}
        <div className="bento-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--clr-text)' }}>
            AI Extractie
          </h3>
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="btn-gold w-full text-sm flex items-center justify-center gap-2"
          >
            <Sparkles size={14} />
            {extracting ? 'Bezig...' : 'Nieuwe extractie'}
          </button>
          {appt && (
            <p className="mt-2 text-xs text-center" style={{ color: 'var(--clr-text-subtle)' }}>
              Zekerheid: {Math.round(appt.confidence * 100)}%
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="bento-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--clr-text)' }}>
            Notities
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Notities over dit gesprek..."
            className="input-dark resize-none text-sm"
          />
        </div>

        {/* Assigned to */}
        <div className="bento-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--clr-text)' }}>
            Toegewezen aan
          </h3>
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Naam medewerker..."
            className="input-dark text-sm"
          />
        </div>

        {/* Unread toggle */}
        <div className="bento-card">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium" style={{ color: 'var(--clr-text)' }}>
              Ongelezen
            </span>
            <button
              onClick={() => setHasUnread(!hasUnread)}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                hasUnread ? 'bg-blue-500' : 'bg-gray-200 dark:bg-[#332E29]'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                  hasUnread ? 'left-5' : 'left-1'
                }`}
              />
            </button>
          </label>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-accent w-full flex items-center justify-center gap-2 text-sm"
        >
          <Save size={14} />
          {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
        </button>
      </div>
    </div>
  );
}
