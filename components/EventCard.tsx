'use client';

import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    // Prevent drag-drop from intercepting the click
    e.stopPropagation();
    e.preventDefault();
    router.push(`/dashboard/${event.id}`);
  };

  return (
    <div
      className="glass-card-hover rounded-2xl p-4 cursor-pointer"
      onClick={handleClick}
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
        </div>
      )}

      {/* Guest count badge */}
      {event.guest_count != null && event.guest_count > 0 && (
        <div className="flex items-center mt-1.5">
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
            event.guest_count >= 75
              ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/40'
              : event.guest_count >= 50
                ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40'
                : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40'
          }`}>
            <Users size={10} />
            {event.guest_count} personen
          </span>
        </div>
      )}

      {/* AI Summary preview */}
      {event.ai_summary && (
        <div className="mt-2 space-y-0.5">
          {event.ai_summary
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .slice(0, 3)
            .map((line, i) => {
              const text = line.replace(/^[•\-\*]\s*/, '');
              return (
                <p key={i} className="text-xs flex items-start gap-1.5" style={{ color: 'var(--clr-text-dim)' }}>
                  <span className="shrink-0" style={{ color: 'var(--clr-text-subtle)' }}>•</span>
                  <span className="line-clamp-1">{text}</span>
                </p>
              );
            })}
        </div>
      )}
    </div>
  );
}
