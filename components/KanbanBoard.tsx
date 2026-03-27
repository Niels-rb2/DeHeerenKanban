'use client';

import { useState, useRef } from 'react';
import { Thread, ThreadStatus } from '@/lib/types';
import { ThreadCard } from './ThreadCard';
import { STATUS_LABELS } from '@/lib/utils';

const COLUMNS: {
  status: ThreadStatus;
  borderColor: string;
  headerCls: string;
  badgeBg: string;
}[] = [
  {
    status: 'TODO_REPLY',
    borderColor: '#d97706',
    headerCls: 'kanban-header-orange',
    badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  {
    status: 'REPLIED_NO_APPOINTMENT',
    borderColor: '#3b82f6',
    headerCls: 'kanban-header-blue',
    badgeBg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  {
    status: 'APPOINTMENT_SET',
    borderColor: '#16a34a',
    headerCls: 'kanban-header-green',
    badgeBg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  {
    status: 'CANCELLED',
    borderColor: '#dc2626',
    headerCls: 'kanban-header-red',
    badgeBg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  {
    status: 'ARCHIVE',
    borderColor: '#9ca3af',
    headerCls: 'kanban-header-gray',
    badgeBg: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  },
];

interface KanbanBoardProps {
  threads: Thread[];
}

export function KanbanBoard({ threads: initialThreads }: KanbanBoardProps) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ThreadStatus | null>(null);
  const dragThread = useRef<Thread | null>(null);

  const byStatus = (status: ThreadStatus) => threads.filter(t => t.status === status);

  /* ── Drag handlers on card ── */
  function onDragStart(thread: Thread) {
    dragThread.current = thread;
    setDraggingId(thread.id);
  }

  function onDragEnd() {
    setDraggingId(null);
    setOverColumn(null);
    dragThread.current = null;
  }

  /* ── Drop handlers on column ── */
  function onDragOver(e: React.DragEvent, status: ThreadStatus) {
    e.preventDefault();
    setOverColumn(status);
  }

  function onDragLeave() {
    setOverColumn(null);
  }

  async function onDrop(e: React.DragEvent, targetStatus: ThreadStatus) {
    e.preventDefault();
    setOverColumn(null);

    const thread = dragThread.current;
    if (!thread || thread.status === targetStatus) return;

    // Optimistic update
    setThreads(prev =>
      prev.map(t => t.id === thread.id ? { ...t, status: targetStatus } : t)
    );

    // Persist to API
    try {
      await fetch(`/api/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
    } catch {
      // Rollback on failure
      setThreads(prev =>
        prev.map(t => t.id === thread.id ? { ...t, status: thread.status } : t)
      );
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollSnapType: 'x proximity' }}>
      {COLUMNS.map((col) => {
        const colThreads = byStatus(col.status);
        const isOver = overColumn === col.status;

        return (
          <div
            key={col.status}
            className="kanban-column rounded-2xl p-3 flex flex-col gap-3 shrink-0 transition-all duration-150"
            onDragOver={(e) => onDragOver(e, col.status)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, col.status)}
            style={{
              background: isOver ? 'var(--clr-surface-variant)' : 'var(--clr-surface-low)',
              borderLeft: `3px solid ${col.borderColor}`,
              outline: isOver ? `2px dashed ${col.borderColor}` : '2px solid transparent',
              width: 'calc(20% - 13px)',
              minWidth: '240px',
              scrollSnapAlign: 'start',
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-1">
              <h3 className={`text-sm font-semibold ${col.headerCls}`}>
                {STATUS_LABELS[col.status]}
              </h3>
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${col.badgeBg}`}>
                {colThreads.length}
              </span>
            </div>

            {/* Thread cards */}
            {colThreads.length === 0 ? (
              <div
                className="flex-1 flex items-center justify-center text-sm rounded-xl py-8 transition-colors"
                style={{
                  color: isOver ? col.borderColor : 'var(--clr-text-subtle)',
                  border: `1px dashed ${isOver ? col.borderColor : 'var(--clr-outline-dim)'}`,
                }}
              >
                {isOver ? 'Loslaten om te verplaatsen' : 'Geen gesprekken'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {colThreads.map((thread) => (
                  <div
                    key={thread.id}
                    draggable
                    onDragStart={() => onDragStart(thread)}
                    onDragEnd={onDragEnd}
                    className="transition-opacity duration-150"
                    style={{ opacity: draggingId === thread.id ? 0.4 : 1 }}
                  >
                    <ThreadCard thread={thread} />
                  </div>
                ))}

                {/* Drop hint at bottom when dragging over a non-empty column */}
                {isOver && draggingId && (
                  <div
                    className="rounded-xl py-3 text-center text-xs transition-colors"
                    style={{
                      border: `1px dashed ${col.borderColor}`,
                      color: col.borderColor,
                    }}
                  >
                    Loslaten om te verplaatsen
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
