'use client';

import Link from 'next/link';
import { PrivateEventRequest } from '@/lib/types';
import { formatDate, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import { Calendar, Users } from 'lucide-react';

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

interface EventCardProps {
  event: PrivateEventRequest;
}

export function EventCard({ event }: EventCardProps) {
  return (
    <Link href={`/private-events/${event.id}`} className="block">
      <div
        className="glass-card-hover rounded-2xl p-4 cursor-pointer"
      >
      {/* Contact */}
      <div className="flex items-start gap-2 mb-2 pr-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--clr-text)' }}>
            {event.sender_name || event.sender_email}
          </p>
          {event.sender_name && (
            <p className="text-xs truncate" style={{ color: 'var(--clr-text-muted)' }}>
              {event.sender_email}
            </p>
          )}
        </div>
        <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--clr-text-subtle)' }}>
          {formatDate(event.created_at)}
        </span>
      </div>

      {/* Occasion badge */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {event.occasion_type && (
          <span className="badge text-xs bg-purple-50 text-purple-700 border border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40">
            {OCCASION_LABELS[event.occasion_type.toLowerCase()] || event.occasion_type}
          </span>
        )}
        <span className={`badge text-xs ${STATUS_COLORS[event.status]}`}>
          {STATUS_LABELS[event.status]}
        </span>
      </div>

      {/* Event details chip */}
      {event.event_date && (
        <div
          className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg text-xs"
          style={{ background: 'var(--clr-surface-low)', color: 'var(--clr-text-dim)' }}
        >
          <Calendar size={11} />
          <span>
            {new Date(event.event_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
            {event.start_time && ` om ${event.start_time}`}
          </span>
          {event.guest_count && (
            <>
              <span style={{ color: 'var(--clr-text-subtle)' }}>·</span>
              <Users size={11} />
              <span>{event.guest_count} p.</span>
            </>
          )}
        </div>
      )}

      {/* AI Summary preview */}
      {event.ai_summary && (
        <p
          className="text-xs mt-2 line-clamp-2"
          style={{ color: 'var(--clr-text-dim)' }}
        >
          {event.ai_summary}
        </p>
      )}
      </div>
    </Link>
  );
}
