import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';

import { RAIL_PX, RAIL_STEP_PX } from './cockpitSplit';

/**
 * The draggable divider between the schedule rail and the focused class (MYK9-2142).
 *
 * A grid item in the focused class's own cell, pulled left into the grid gap, so it runs the
 * height of the panel it borders whether the panel is lifted beside the heading or sits under it.
 * Drag, arrow keys (Home and End for the limits) or a double-click (back to the default) set the
 * width; the cockpit clamps and remembers it (useCockpitRailWidth).
 */
export function CockpitRailDivider({
  width,
  max,
  lifted,
  onWidthChange,
}: {
  /** The rail's width now, in px. */
  width: number;
  /** The widest the rail may go at the cockpit's current width. */
  max: number;
  /** The focused class spans both grid rows (SecretaryCockpit's `panelLifted`). */
  lifted: boolean;
  /** `remember: false` while a drag is still moving; the width is saved once, where it ends. */
  onWidthChange: (next: number, remember?: boolean) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number; moved: number | null } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Keeps the drag from selecting the text it passes over.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width, moved: null };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.moved = drag.current.startWidth + event.clientX - drag.current.startX;
    onWidthChange(drag.current.moved, false);
  };
  const endDrag = () => {
    // A press that never moved changes nothing, so it saves nothing.
    if (drag.current && drag.current.moved !== null) onWidthChange(drag.current.moved);
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === 'ArrowRight'
        ? width + RAIL_STEP_PX
        : event.key === 'ArrowLeft'
          ? width - RAIL_STEP_PX
          : event.key === 'Home'
            ? RAIL_PX
            : event.key === 'End'
              ? max
              : null;
    if (next === null) return;
    event.preventDefault();
    onWidthChange(next);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize schedule and class"
      aria-valuenow={width}
      aria-valuemin={RAIL_PX}
      aria-valuemax={max}
      aria-valuetext={`Schedule ${width} pixels wide`}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      data-testid="cockpit-rail-divider"
      className={cn(
        // -ml-5 w-5 is the grid's gap-5 (SPLIT_GAP_PX): the divider fills the gap, nothing more.
        'group relative z-10 col-start-2 -ml-5 flex w-5 cursor-col-resize touch-none select-none justify-center self-stretch justify-self-start outline-none',
        lifted ? 'row-span-2 row-start-1' : 'row-start-2'
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onWidthChange(RAIL_PX)}
      onKeyDown={onKeyDown}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary/60 group-focus-visible:bg-primary',
          dragging && 'bg-primary group-hover:bg-primary'
        )}
      />
      {/* Sticky, so the grip stays in view beside a schedule longer than the screen. */}
      <span
        aria-hidden="true"
        className="sticky top-[45vh] z-10 flex h-6 w-3 items-center justify-center self-start rounded-sm border bg-border"
      >
        <GripVertical className="h-3 w-3" />
      </span>
    </div>
  );
}
