import React, { useRef } from 'react';

interface LayoutDividerProps {
  axis: 'horizontal' | 'vertical';
  label: string;
  value: number;
  onChange: (value: number) => void;
}

export function LayoutDivider({ axis, label, value, onChange }: LayoutDividerProps) {
  const drag = useRef<{ pointerId: number; start: number; size: number; value: number } | null>(null);
  const horizontal = axis === 'horizontal';
  return <div
    className={`lp-layout-divider lp-layout-divider--${axis}`}
    role="separator" tabIndex={0} aria-label={label} title={label}
    aria-orientation={horizontal ? 'horizontal' : 'vertical'}
    aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(value)}
    onPointerDown={event => {
      if (event.button !== 0) return;
      const rect = event.currentTarget.parentElement!.getBoundingClientRect();
      drag.current = { pointerId: event.pointerId, start: horizontal ? event.clientY : event.clientX, size: (horizontal ? rect.height : rect.width) - 8, value };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId || current.size <= 0) return;
      const delta = (horizontal ? event.clientY : event.clientX) - current.start;
      onChange(current.value + (horizontal ? delta : -delta) / current.size * 100);
    }}
    onPointerUp={event => {
      if (drag.current?.pointerId !== event.pointerId) return;
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onLostPointerCapture={() => { drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}
    onKeyDown={event => {
      const direction = horizontal
        ? event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
        : event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      onChange(value + direction * 2);
    }}
  />;
}
