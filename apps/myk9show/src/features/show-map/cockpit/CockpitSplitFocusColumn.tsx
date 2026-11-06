import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { FOCUSED_CLASS_PANEL_CLASS } from '@/components/shows/ShowDetails/showStickyLayout';
import { useMoreBelow } from './useMoreBelow';

/**
 * The split cockpit's second column: the focused class, or a prompt to pick one.
 *
 * Kept while selecting: split, the panel has its own column beside the schedule rather than
 * sitting inside the tick list. Which class it shows is `focusedPanelShows` (MYK9-1727): a picked
 * class stays even when the secretary's own work moves it out of the filter.
 * Pinned, the panel scrolls itself; a fade at its foot says when more of the class is below.
 */
export function CockpitSplitFocusColumn({
  panel,
  pinned,
  focusedId,
  showPrompt,
}: {
  /** The focused class's panel, or null when there is none the schedule shows. */
  panel: ReactNode;
  pinned: boolean;
  focusedId: string | undefined;
  /** False beside an empty schedule or while selecting, where "pick a class" is wrong. */
  showPrompt: boolean;
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
    if (!showPrompt) return null;
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

/**
 * Stacked, a picked class the list no longer shows (the secretary's own work moved it out of the
 * filter) stays open below the schedule, saying why it is not in the list (MYK9-1727).
 */
export function UnlistedFocusedClass({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <div className="space-y-2" data-testid="cockpit-inline-focus">
      <p className="text-sm text-muted-foreground">
        This class no longer matches your filter. It stays open until you pick another.
      </p>
      {children}
    </div>
  );
}

/**
 * Where the selected class's panel goes outside the schedule rows: the split's second column, or
 * (stacked) below the schedule when the list no longer shows a class the secretary clicked.
 * Stacked and listed, the schedule shows the panel inline under its row instead.
 */
export function CockpitFocusOutlet({
  split,
  focus,
  pinned,
  scheduleEmpty,
  selecting,
  children,
}: {
  split: boolean;
  focus: { shows: boolean; listed: boolean; id: string | undefined };
  pinned: boolean;
  scheduleEmpty: boolean;
  selecting: boolean;
  children: ReactNode;
}) {
  if (split) {
    return (
      <CockpitSplitFocusColumn
        panel={focus.shows ? children : null}
        pinned={pinned}
        focusedId={focus.id}
        // Nothing to pick beside an empty schedule, and a click ticks while selecting.
        showPrompt={!scheduleEmpty && !selecting}
      />
    );
  }
  return (
    <UnlistedFocusedClass show={focus.shows && !focus.listed && !selecting}>
      {children}
    </UnlistedFocusedClass>
  );
}
