'use client';

import { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { PrivateEventRequest, ThreadStatus } from '@/lib/types';
import { EventCard } from './EventCard';
import { STATUS_LABELS } from '@/lib/utils';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/* ── Column definitions (first 4 are normal) ─────────────────── */

interface ColumnDef {
  status: ThreadStatus;
  borderColor: string;
  headerCls: string;
  badgeBg: string;
}

const MAIN_COLUMNS: ColumnDef[] = [
  {
    status: 'TO_ANSWER',
    borderColor: '#d97706',
    headerCls: 'kanban-header-orange',
    badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  {
    status: 'ANSWERED',
    borderColor: '#3b82f6',
    headerCls: 'kanban-header-blue',
    badgeBg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  {
    status: 'CONSULTATION_PLANNED',
    borderColor: '#9333ea',
    headerCls: 'kanban-header-purple',
    badgeBg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  },
  {
    status: 'GO',
    borderColor: '#16a34a',
    headerCls: 'kanban-header-green',
    badgeBg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
];

// The combined "Afgesloten" column
const CLOSED_BORDER = '#9ca3af';
const CLOSED_STATUSES: ThreadStatus[] = ['NO_GO', 'ARCHIVE'];

/* ── Types ───────────────────────────────────────────────────── */

interface KanbanBoardProps {
  events: Record<ThreadStatus, PrivateEventRequest[]>;
}

interface PendingDrop {
  event: PrivateEventRequest;
  sourceStatus: ThreadStatus;
}

const COLLAPSED_LIMIT = 3;
// The combined column is the only collapsible one
const DROPPABLE_CLOSED = 'CLOSED';

/* ── Component ───────────────────────────────────────────────── */

export function KanbanBoard({ events: initialEvents }: KanbanBoardProps) {
  const [events, setEvents] = useState(initialEvents);
  const [closedTab, setClosedTab] = useState<'NO_GO' | 'ARCHIVE'>('NO_GO');
  const [expanded, setExpanded] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);

  // Sync internal state when parent passes new (filtered) events
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  const byStatus = (status: ThreadStatus) => events[status] || [];

  /* ── Persist status change to API ─────────────────────────── */
  const persistStatus = useCallback(async (eventId: string, newStatus: ThreadStatus) => {
    if (isDemo) return true;
    try {
      const response = await fetch(`/api/private-events/${eventId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  /* ── Move event between statuses (optimistic) ─────────────── */
  const moveEvent = useCallback(
    async (event: PrivateEventRequest, sourceStatus: ThreadStatus, destStatus: ThreadStatus) => {
      if (sourceStatus === destStatus) return;

      // Optimistic update
      setEvents((prev) => {
        const next = { ...prev };
        next[sourceStatus] = prev[sourceStatus].filter((e) => e.id !== event.id);
        next[destStatus] = [...prev[destStatus], { ...event, status: destStatus }];
        return next;
      });

      const ok = await persistStatus(event.id, destStatus);
      if (!ok) {
        // Rollback
        setEvents((prev) => {
          const next = { ...prev };
          next[destStatus] = prev[destStatus].filter((e) => e.id !== event.id);
          next[sourceStatus] = [...prev[sourceStatus], { ...event, status: sourceStatus }];
          return next;
        });
      }
    },
    [persistStatus],
  );

  /* ── Drag end handler ─────────────────────────────────────── */
  function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceStatus = source.droppableId as ThreadStatus;
    const destDroppable = destination.droppableId;

    // Find the event in the source column
    const event = events[sourceStatus]?.[source.index];
    if (!event || event.id !== draggableId) return;
    if (sourceStatus === destDroppable) return;

    // Dropped on the combined "CLOSED" column → ask which status
    if (destDroppable === DROPPABLE_CLOSED) {
      // If it's already one of the closed statuses, just reorder (no-op)
      if (CLOSED_STATUSES.includes(sourceStatus)) return;
      setPendingDrop({ event, sourceStatus });
      return;
    }

    // Normal column → move directly
    const destStatus = destDroppable as ThreadStatus;
    moveEvent(event, sourceStatus, destStatus);
  }

  /* ── Modal: choose NO_GO or ARCHIVE ───────────────────────── */
  function handleModalChoice(status: 'NO_GO' | 'ARCHIVE') {
    if (!pendingDrop) return;
    moveEvent(pendingDrop.event, pendingDrop.sourceStatus, status);
    setClosedTab(status); // Switch tab to show where it went
    setPendingDrop(null);
  }

  /* ── Render helpers ───────────────────────────────────────── */
  const closedEvents = byStatus(closedTab);
  const noGoCount = byStatus('NO_GO').length;
  const archiveCount = byStatus('ARCHIVE').length;
  const totalClosed = noGoCount + archiveCount;

  const shouldCollapse = closedEvents.length > COLLAPSED_LIMIT && !expanded;
  const visibleClosed = shouldCollapse ? closedEvents.slice(0, COLLAPSED_LIMIT) : closedEvents;
  const hiddenCount = closedEvents.length - COLLAPSED_LIMIT;

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollSnapType: 'x proximity' }}>
          {/* ── Main columns (4) ────────────────────────── */}
          {MAIN_COLUMNS.map((col) => {
            const colEvents = byStatus(col.status);

            return (
              <Droppable droppableId={col.status} key={col.status} type="EVENT">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="kanban-column rounded-2xl p-3 flex flex-col gap-3 shrink-0 transition-all duration-150"
                    style={{
                      background: snapshot.isDraggingOver ? 'var(--clr-surface-variant)' : 'var(--clr-surface-low)',
                      borderLeft: `3px solid ${col.borderColor}`,
                      outline: snapshot.isDraggingOver ? `2px dashed ${col.borderColor}` : '2px solid transparent',
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
                        {colEvents.length}
                      </span>
                    </div>

                    {/* Cards */}
                    {colEvents.length === 0 ? (
                      <div
                        className="flex-1 flex items-center justify-center text-sm rounded-xl py-8 transition-colors"
                        style={{
                          color: snapshot.isDraggingOver ? col.borderColor : 'var(--clr-text-subtle)',
                          border: `1px dashed ${snapshot.isDraggingOver ? col.borderColor : 'var(--clr-outline-dim)'}`,
                        }}
                      >
                        {snapshot.isDraggingOver ? 'Loslaten om te verplaatsen' : 'Geen verzoeken'}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {colEvents.map((event, index) => (
                          <Draggable key={event.id} draggableId={event.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className="transition-all duration-150"
                                style={{
                                  opacity: snapshot.isDragging ? 0.5 : 1,
                                  transform: snapshot.isDragging ? 'rotate(2deg)' : 'rotate(0deg)',
                                  ...provided.draggableProps.style,
                                }}
                              >
                                <EventCard event={event} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            );
          })}

          {/* ── Combined "Afgesloten" column ─────────────── */}
          <Droppable droppableId={DROPPABLE_CLOSED} type="EVENT">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="kanban-column rounded-2xl p-3 flex flex-col gap-3 shrink-0 transition-all duration-150"
                style={{
                  background: snapshot.isDraggingOver ? 'var(--clr-surface-variant)' : 'var(--clr-surface-low)',
                  borderLeft: `3px solid ${CLOSED_BORDER}`,
                  outline: snapshot.isDraggingOver ? `2px dashed ${CLOSED_BORDER}` : '2px solid transparent',
                  width: 'calc(20% - 13px)',
                  minWidth: '240px',
                  scrollSnapAlign: 'start',
                }}
              >
                {/* Header with total badge */}
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold kanban-header-gray">Afgesloten</h3>
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
                    {totalClosed}
                  </span>
                </div>

                {/* Tab toggle */}
                <div
                  className="inline-flex rounded-full p-1 gap-1"
                  style={{ background: 'var(--clr-surface)' }}
                >
                  <button
                    onClick={() => { setClosedTab('NO_GO'); setExpanded(false); }}
                    className={`py-1.5 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer text-center whitespace-nowrap border ${
                      closedTab === 'NO_GO'
                        ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/40'
                        : 'border-transparent text-[var(--clr-text-muted)]'
                    }`}
                  >
                    Gaat niet door
                    <span
                      className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold ${
                        closedTab === 'NO_GO'
                          ? 'bg-red-800 text-white dark:bg-red-300 dark:text-red-950'
                          : 'bg-[var(--clr-surface-low)] text-[var(--clr-text-subtle)]'
                      }`}
                    >
                      {noGoCount}
                    </span>
                  </button>
                  <button
                    onClick={() => { setClosedTab('ARCHIVE'); setExpanded(false); }}
                    className={`py-1.5 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer text-center whitespace-nowrap border ${
                      closedTab === 'ARCHIVE'
                        ? 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/40'
                        : 'border-transparent text-[var(--clr-text-muted)]'
                    }`}
                  >
                    Archief
                    <span
                      className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold ${
                        closedTab === 'ARCHIVE'
                          ? 'bg-gray-600 text-white dark:bg-gray-400 dark:text-gray-950'
                          : 'bg-[var(--clr-surface-low)] text-[var(--clr-text-subtle)]'
                      }`}
                    >
                      {archiveCount}
                    </span>
                  </button>
                </div>

                {/* Cards for active tab */}
                {closedEvents.length === 0 ? (
                  <div
                    className="flex-1 flex items-center justify-center text-sm rounded-xl py-8 transition-colors"
                    style={{
                      color: snapshot.isDraggingOver ? CLOSED_BORDER : 'var(--clr-text-subtle)',
                      border: `1px dashed ${snapshot.isDraggingOver ? CLOSED_BORDER : 'var(--clr-outline-dim)'}`,
                    }}
                  >
                    {snapshot.isDraggingOver ? 'Loslaten om te verplaatsen' : 'Geen verzoeken'}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {visibleClosed.map((event, index) => (
                      <Draggable key={event.id} draggableId={event.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="transition-all duration-150"
                            style={{
                              opacity: snapshot.isDragging ? 0.5 : 1,
                              transform: snapshot.isDragging ? 'rotate(2deg)' : 'rotate(0deg)',
                              ...provided.draggableProps.style,
                            }}
                          >
                            <EventCard event={event} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {/* Show more / less */}
                    {closedEvents.length > COLLAPSED_LIMIT && (
                      <button
                        onClick={() => setExpanded((v) => !v)}
                        className="w-full py-2 px-3 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                        style={{
                          color: CLOSED_BORDER,
                          background: 'var(--clr-surface)',
                          border: `1px dashed ${CLOSED_BORDER}40`,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `${CLOSED_BORDER}10`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--clr-surface)';
                        }}
                      >
                        {expanded ? '↑ Lees minder' : `↓ Lees meer (${hiddenCount} meer)`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      {/* ── Modal: choose NO_GO or ARCHIVE ──────────────────── */}
      {pendingDrop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPendingDrop(null)}
        >
          <div
            className="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl"
            style={{ background: 'var(--clr-bg)', border: '1px solid var(--clr-outline)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--clr-text)' }}>
              Waarheen verplaatsen?
            </h3>
            <p className="text-sm mb-5" style={{ color: 'var(--clr-text-muted)' }}>
              <strong>{pendingDrop.event.sender_name}</strong> wordt afgesloten. Kies een categorie:
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => handleModalChoice('NO_GO')}
                className="flex items-center gap-3 w-full p-4 rounded-xl text-left transition-all cursor-pointer"
                style={{
                  background: 'var(--clr-surface-low)',
                  border: '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#dc2626';
                  e.currentTarget.style.background = '#dc26260a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.background = 'var(--clr-surface-low)';
                }}
              >
                <span className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-base">
                  ✕
                </span>
                <div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--clr-text)' }}>
                    Gaat niet door
                  </span>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--clr-text-muted)' }}>
                    Afgezegd of niet mogelijk
                  </p>
                </div>
              </button>

              <button
                onClick={() => handleModalChoice('ARCHIVE')}
                className="flex items-center gap-3 w-full p-4 rounded-xl text-left transition-all cursor-pointer"
                style={{
                  background: 'var(--clr-surface-low)',
                  border: '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#9ca3af';
                  e.currentTarget.style.background = '#9ca3af0a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.background = 'var(--clr-surface-low)';
                }}
              >
                <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center text-base">
                  📦
                </span>
                <div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--clr-text)' }}>
                    Archief
                  </span>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--clr-text-muted)' }}>
                    Afgerond of verlopen
                  </p>
                </div>
              </button>
            </div>

            <button
              onClick={() => setPendingDrop(null)}
              className="w-full mt-4 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              style={{ color: 'var(--clr-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--clr-surface-low)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Annuleren
            </button>
          </div>
        </div>
      )}
    </>
  );
}
