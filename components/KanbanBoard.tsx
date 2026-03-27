'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { PrivateEventRequest, ThreadStatus } from '@/lib/types';
import { EventCard } from './EventCard';
import { STATUS_LABELS } from '@/lib/utils';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const COLUMNS: {
  status: ThreadStatus;
  borderColor: string;
  headerCls: string;
  badgeBg: string;
}[] = [
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
  {
    status: 'NO_GO',
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
  events: Record<ThreadStatus, PrivateEventRequest[]>;
}

export function KanbanBoard({ events: initialEvents }: KanbanBoardProps) {
  const [events, setEvents] = useState(initialEvents);

  const byStatus = (status: ThreadStatus) => events[status] || [];

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;

    // Dropped outside a droppable area
    if (!destination) return;

    // Dropped in same position
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const sourceStatus = source.droppableId as ThreadStatus;
    const destStatus = destination.droppableId as ThreadStatus;
    const event = events[sourceStatus]?.[source.index];

    if (!event || event.id !== draggableId) return;

    // Skip if same status
    if (sourceStatus === destStatus) return;

    // Optimistic update
    setEvents(prev => {
      const newEvents = { ...prev };
      newEvents[sourceStatus] = prev[sourceStatus].filter(e => e.id !== event.id);
      newEvents[destStatus] = [
        ...prev[destStatus],
        { ...event, status: destStatus },
      ];
      return newEvents;
    });

    // Persist to API (skip in demo mode)
    if (!isDemo) {
      try {
        const response = await fetch(`/api/private-events/${event.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: destStatus }),
        });

        if (!response.ok) {
          // Rollback on failure
          setEvents(prev => {
            const newEvents = { ...prev };
            newEvents[destStatus] = prev[destStatus].filter(e => e.id !== event.id);
            newEvents[sourceStatus] = [
              ...prev[sourceStatus],
              { ...event, status: sourceStatus },
            ];
            return newEvents;
          });
        }
      } catch (error) {
        console.error('Failed to update event status:', error);
        // Rollback on failure
        setEvents(prev => {
          const newEvents = { ...prev };
          newEvents[destStatus] = prev[destStatus].filter(e => e.id !== event.id);
          newEvents[sourceStatus] = [
            ...prev[sourceStatus],
            { ...event, status: sourceStatus },
          ];
          return newEvents;
        });
      }
    }
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollSnapType: 'x proximity' }}>
        {COLUMNS.map((col) => {
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
                    width: 'calc(16.666% - 13px)',
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

                  {/* Event cards */}
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
      </div>
    </DragDropContext>
  );
}
