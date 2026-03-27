'use client';

import { useRouter } from 'next/navigation';
import { Thread } from '@/lib/types';
import { formatDate, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import { Calendar, Users, Circle } from 'lucide-react';

const OCCASION_LABELS: Record<string, string> = {
  verjaardag: '🎂 Verjaardag',
  receptie: '🥂 Receptie',
  borrel: '🍺 Borrel',
  diner: '🍽️ Diner',
  trouwerij: '💍 Trouwerij',
  anders: '🎉 Anders',
};

interface ThreadCardProps {
  thread: Thread;
}

export function ThreadCard({ thread }: ThreadCardProps) {
  const router = useRouter();
  const appt = thread.extracted_appointment_json?.appointment;
  const confidence = thread.extracted_appointment_json?.confidence ?? 0;

  return (
    <div
      className="glass-card-hover rounded-2xl p-4 cursor-pointer relative"
      onClick={() => router.push(`/thread/${thread.id}`)}
    >
      {/* Unread dot */}
      {thread.has_unread && (
        <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-blue-500" />
      )}

      {/* Contact */}
      <div className="flex items-start gap-2 mb-2 pr-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--clr-text)' }}>
            {thread.contact_name || thread.contact_email}
          </p>
          {thread.contact_name && (
            <p className="text-xs truncate" style={{ color: 'var(--clr-text-muted)' }}>
              {thread.contact_email}
            </p>
          )}
        </div>
        <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>
          {formatDate(thread.last_message_at)}
        </span>
      </div>

      {/* Subject */}
      <p
        className="text-sm mb-2 line-clamp-2"
        style={{ color: 'var(--clr-text-dim)' }}
      >
        {thread.subject}
      </p>

      {/* Status badge */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className={`badge text-xs ${STATUS_COLORS[thread.status]}`}>
          {STATUS_LABELS[thread.status]}
        </span>

        {/* Occasion badge */}
        {appt?.occasion && (
          <span className="badge text-xs bg-purple-50 text-purple-700 border border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40">
            {OCCASION_LABELS[appt.occasion] || appt.occasion}
          </span>
        )}
      </div>

      {/* Appointment chip */}
      {appt?.date && (
        <div
          className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg text-xs"
          style={{ background: 'var(--clr-surface-low)', color: 'var(--clr-text-dim)' }}
        >
          <Calendar size={11} />
          <span>
            {new Date(appt.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
            {appt.time && ` om ${appt.time}`}
          </span>
          {appt.partySize && (
            <>
              <span style={{ color: 'var(--clr-text-subtle)' }}>·</span>
              <Users size={11} />
              <span>{appt.partySize} p.</span>
            </>
          )}
        </div>
      )}

      {/* Confidence bar */}
      {confidence > 0 && (
        <div className="mt-2">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--clr-surface-low)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(confidence * 100)}%`,
                background: confidence > 0.8 ? '#2E6B3E' : confidence > 0.5 ? '#d97706' : '#dc2626',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
