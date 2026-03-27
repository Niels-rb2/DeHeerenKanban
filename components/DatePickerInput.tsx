'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const DAYS_NL   = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
const MONTHS_NL = ['Januari','Februari','Maart','April','Mei','Juni',
                   'Juli','Augustus','September','Oktober','November','December'];

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseYMD(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

export function DatePickerInput({ value, onChange, placeholder = 'Kies een datum' }: Props) {
  const selected = parseYMD(value);
  const today    = new Date(); today.setHours(0,0,0,0);

  const [open,       setOpen]      = useState(false);
  const [rect,       setRect]      = useState<DOMRect | null>(null);
  const [viewYear,   setViewYear]  = useState(selected?.getFullYear()  ?? today.getFullYear());
  const [viewMonth,  setViewMonth] = useState(selected?.getMonth()     ?? today.getMonth());
  const triggerRef = useRef<HTMLButtonElement>(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const popup = document.getElementById('cdh-datepicker-popup');
      if (popup && popup.contains(e.target as Node)) return;
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  function openPicker() {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(o => !o);
  }

  function buildCells() {
    const first    = new Date(viewYear, viewMonth, 1);
    const startDow = (first.getDay() + 6) % 7;
    const inMonth  = new Date(viewYear, viewMonth+1, 0).getDate();
    const inPrev   = new Date(viewYear, viewMonth, 0).getDate();
    const cells: { date: Date; cur: boolean }[] = [];
    for (let i = startDow-1; i >= 0; i--)
      cells.push({ date: new Date(viewYear, viewMonth-1, inPrev-i), cur: false });
    for (let d = 1; d <= inMonth; d++)
      cells.push({ date: new Date(viewYear, viewMonth, d), cur: true });
    while (cells.length % 7 !== 0)
      cells.push({ date: new Date(viewYear, viewMonth+1, cells.length - inMonth - startDow + 1), cur: false });
    return cells;
  }

  function prevMonth() { viewMonth===0 ? (setViewMonth(11),setViewYear(y=>y-1)) : setViewMonth(m=>m-1); }
  function nextMonth() { viewMonth===11? (setViewMonth(0), setViewYear(y=>y+1)) : setViewMonth(m=>m+1); }

  const displayValue = selected
    ? selected.toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : '';

  /* Compute fixed position */
  const popupStyle: React.CSSProperties = rect ? (() => {
    const calH   = 330;
    const width  = Math.max(rect.width, 270);
    const left   = Math.min(rect.left, window.innerWidth - width - 8);
    const below  = window.innerHeight - rect.bottom;
    return below >= calH
      ? { top: rect.bottom + 6, left }
      : { bottom: window.innerHeight - rect.top + 6, left };
  })() : {};

  return (
    <div>
      {/* ── Trigger ── */}
      <button
        type="button"
        ref={triggerRef}
        onClick={openPicker}
        className="w-full flex items-center justify-between rounded-full px-4 py-2.5 text-sm transition-colors focus:outline-none border border-[#DDD5D0] dark:border-white/35"
        style={{
          background: 'var(--clr-input)',
          color: displayValue ? 'var(--clr-text)' : 'var(--clr-text-subtle)',
        }}
      >
        <span className="truncate">{displayValue || placeholder}</span>
        <CalendarDays size={14} className="ml-2 shrink-0" style={{ color: 'var(--clr-text-muted)' }} />
      </button>

      {/* ── Portal calendar ── */}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          id="cdh-datepicker-popup"
          className="rounded-2xl p-4 animate-fade-in"
          style={{
            position: 'fixed',
            zIndex: 9999,
            width: Math.max(rect?.width ?? 270, 270),
            background: 'var(--clr-input)',
            border: '1px solid var(--clr-outline)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            ...popupStyle,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--clr-text-dim)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--clr-surface-low)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-medium" style={{ color: 'var(--clr-text)' }}>
              {MONTHS_NL[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--clr-text-dim)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--clr-surface-low)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_NL.map(d => (
              <div key={d} className="text-center py-1 text-[10px] font-medium"
                style={{ color: 'var(--clr-text-muted)' }}>{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {buildCells().map(({ date, cur }, i) => {
              const ymd        = toYMD(date);
              const isSelected = value === ymd;
              const isToday    = toYMD(today) === ymd;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(ymd); setOpen(false); }}
                  className="flex items-center justify-center text-xs transition-colors"
                  style={{
                    height: '34px',
                    borderRadius: '50%',
                    fontWeight: isSelected ? '600' : undefined,
                    background: isSelected ? '#231917' : 'transparent',
                    color: isSelected ? 'white' : !cur ? 'var(--clr-text-subtle)' : 'var(--clr-text)',
                    border: isToday && !isSelected ? '1.5px solid var(--clr-text-dim)' : '1.5px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--clr-surface-low)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
