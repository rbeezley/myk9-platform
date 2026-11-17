import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';

import { RAIL_PX, RAIL_STEP_PX } from './cockpitSplit';

/** The schedule section the divider resizes; the separator names it with `aria-controls`. */
export const COCKPIT_SCHEDULE_ID = 'cockpit-trial-schedule';

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
  onPreview,
  onWidthChange,
}: {
  /** The rail's width now, in px. */
  width: number;
  /** The widest the rail may go at the cockpit's current width. */
  max: number;
  /** The focused class spans both grid rows (SecretaryCockpit's `panelLifted`). */
  lifted: boolean;
  /** Each move of a drag: the cockpit shows the width without re-rendering the whole desk. */
  onPreview: (next: number) => void;
  /** A settled width: where a drag ends, a key press, a double-click. Saved. */
  onWidthChange: (next: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number; moved: number | null } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Only the main button of the first pointer drags: a right-click or a second finger must not.
    if (event.button !== 0 || event.isPrimary === false) return;
    // Keeps the drag from selecting the text it passes over.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width, moved: null };
    setDragging(true);
  };
  const endDrag = () => {
    // A press that never moved changes nothing, so it saves nothing.
    if (drag.current && drag.current.moved !== null) onWidthChange(drag.current.moved);
    drag.current = null;
    setDragging(false);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // The button came up where no pointerup reached the page (a context menu, another window).
    if (event.buttons === 0) {
      endDrag();
      return;
    }
    drag.current.moved = drag.current.startWidth + event.clientX - drag.current.startX;
    onPreview(drag.current.moved);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Alt+Left is the browser's Back; leave every modified key to whoever owns it.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
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
      aria-controls={COCKPIT_SCHEDULE_ID}
      aria-valuenow={width}
      aria-valuemin={RAIL_PX}
      aria-valuemax={max}
      aria-valuetext={`Schedule ${width} pixels wide`}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      data-testid="cockpit-rail-divider"
      className={cn(
        // -ml-5 w-5 is the grid's gap-5 (SPLIT_GAP_PX): the divider fills the gap, nothing more.
        // touch-pan-y: a finger that starts in the gap still scrolls the page; only sideways drags.
        'group relative z-10 col-start-2 -ml-5 flex w-5 cursor-col-resize touch-pan-y select-none justify-center self-stretch justify-self-start outline-none',
        lifted ? 'row-span-2 row-start-1' : 'row-start-2'
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => onWidthChange(RAIL_PX)}
      onKeyDown={onKeyDown}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-primary',
          dragging && 'bg-primary group-hover:bg-primary'
        )}
      />
      {/* Sticky, so the grip stays in view beside a schedule longer than the screen. */}
      <span
        aria-hidden="true"
        className="sticky top-[45vh] z-10 flex h-6 w-3 items-center justify-center self-start rounded-sm border bg-border group-focus-visible:ring-2 group-focus-visible:ring-ring"
      >
        <GripVertical className="h-3 w-3" />
      </span>
    </div>
  );
}
