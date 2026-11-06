import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { FOCUSED_CLASS_PANEL_CLASS } from '@/components/shows/ShowDetails/showStickyLayout';
import { useMoreBelow } from './useMoreBelow';

/**
 * The split cockpit's second column: the focused class, or a prompt to pick one.
 *
 * Kept while selecting: split, the panel has its own column beside the schedule rather than
 * sitting inside the tick list. It only ever shows a class the schedule shows (MYK9-1727): a class
 * the filter hides waits, still in the URL, until the filter clears; meanwhile the prompt shows.
 * Pinned, the panel scrolls itself; a fade at its foot says when more of the class is below.
 */
export function CockpitSplitFocusColumn({
  panel,
  pinned,
  focusedId,
}: {
  /** The focused class's panel, or null when there is none the schedule shows. */
  panel: ReactNode;
  pinned: boolean;
  focusedId: string | undefined;
}) {
  // The panel scrolls itself and is not remounted per class, so a newly focused class would open
  // at the previous class's scroll position, its controls under the pinned header.
  const panelRef = useRef<HTMLDivElement>(null);
  const showing = panel !== null && panel !== undefined;
  const moreBelow = useMoreBelow(panelRef, pinned && showing, focusedId);
  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [focusedId]);

  if (!showing) {
    return (
      <p
        className="col-start-2 row-start-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
        data-testid="cockpit-split-empty"
      >
        Pick a class from the schedule to see its checklist.
      </p>
    );
  }
  return (
    <div
      ref={panelRef}
      className={cn('col-start-2 row-start-2', pinned && FOCUSED_CLASS_PANEL_CLASS)}
      data-testid="cockpit-split-focus"
    >
      {panel}
      {moreBelow && (
        <div
          aria-hidden="true"
          data-testid="cockpit-panel-more-below"
          className="pointer-events-none sticky bottom-0 -mt-12 h-12 bg-gradient-to-t from-background to-transparent"
        />
      )}
    </div>
  );
}
