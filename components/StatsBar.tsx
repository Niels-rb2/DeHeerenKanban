'use client';

import { KPIStats } from '@/lib/types';
import { MessageCircle, CalendarCheck, XCircle, TrendingUp } from 'lucide-react';

interface StatsBarProps {
  stats: KPIStats;
}

const cards = [
  {
    key: 'total' as const,
    label: 'Totaal gesprekken',
    icon: TrendingUp,
    cardCls:  'stat-green',
    numCls:   'stat-num-green',
    iconCls:  'stat-icon-green',
    labelCls: 'stat-label-green',
  },
  {
    key: 'todoReply' as const,
    label: 'Te beantwoorden',
    icon: MessageCircle,
    cardCls:  'stat-blue',
    numCls:   'stat-num-blue',
    iconCls:  'stat-icon-blue',
    labelCls: 'stat-label-blue',
  },
  {
    key: 'appointmentSet' as const,
    label: 'Afspraken gemaakt',
    icon: CalendarCheck,
    cardCls:  'stat-orange',
    numCls:   'stat-num-orange',
    iconCls:  'stat-icon-orange',
    labelCls: 'stat-label-orange',
  },
  {
    key: 'cancelled' as const,
    label: 'Gaat niet door',
    icon: XCircle,
    cardCls:  'stat-red',
    numCls:   'stat-num-red',
    iconCls:  'stat-icon-red',
    labelCls: 'stat-label-red',
  },
];

export function StatsBar({ stats }: StatsBarProps) {
  const values: Record<string, number | string> = {
    total:          stats.total,
    todoReply:      stats.todoReply,
    appointmentSet: stats.appointmentSet,
    cancelled:      stats.cancelled,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = values[card.key];
        return (
          <div key={card.key} className={`${card.cardCls} rounded-3xl p-5 flex flex-col`}>
            {/* Getal + icoon */}
            <div className="flex items-start justify-between mb-3">
              <span className={`${card.numCls} text-4xl font-bold leading-none tabular-nums`}>
                {value}
                {card.key === 'appointmentSet' && (
                  <span className={`${card.iconCls} ml-2 text-xs font-semibold align-middle px-2 py-0.5 rounded-full`}>
                    {stats.conversionRate}%
                  </span>
                )}
              </span>
              <div className={`${card.iconCls} w-10 h-10 rounded-full flex items-center justify-center shrink-0`}>
                <Icon size={18} />
              </div>
            </div>
            {/* Label */}
            <span className={`${card.labelCls} text-sm font-medium`}>{card.label}</span>
          </div>
        );
      })}
    </div>
  );
}
