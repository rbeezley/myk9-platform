import { cn } from '@/lib/utils';

import type { ClassChecklistState, ClassChecklistSummary } from './classChecklist';

// Done and reprint differ in lightness as well as hue; unknown is an outline,
// never a fill, so it cannot read as either done or not done.
const SEGMENT_CLASS: Record<ClassChecklistState, string> = {
  done: 'bg-success',
  todo: 'bg-border',
  reprint: 'bg-warning',
  unknown: 'border border-dashed border-muted-foreground/60',
};

/**
 * One square per checklist item on a schedule row (layout A, owner,
 * 2026-10-02), in the focused panel's order, over the "N of 7 done" count.
 */
export function ClassChecklistStrip({ summary }: { summary: ClassChecklistSummary }) {
  return (
    <div
      className="flex flex-col items-start gap-1.5 sm:items-end"
      data-testid="class-checklist-strip"
    >
      <div className="flex gap-[3px]" aria-hidden="true">
        {summary.states.map((state, index) => (
          <span
            key={index}
            data-state={state}
            className={cn('h-2 w-4 rounded-[2px]', SEGMENT_CLASS[state])}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {/* "steps", so it never reads as an entry count (owner, 2026-10-03). */}
        {summary.done} of {summary.total} steps done
        {summary.unknown > 0 ? ` · ${summary.unknown} unknown` : ''}
      </span>
    </div>
  );
}
