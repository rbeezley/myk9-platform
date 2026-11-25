import { useRef, type ReactNode } from 'react';

import { usePublishedHeightVar } from '@/hooks/usePublishedHeightVar';
import { cn } from '@/lib/utils';
import {
  FOCUSED_CLASS_HEADER_CLASS,
  FOCUSED_CLASS_HEADER_CLASS_IN_PANEL,
  FOCUSED_CLASS_HEADER_HEIGHT_VAR,
  type FocusedClassPinMode,
} from '@/components/shows/ShowDetails/showStickyLayout';

/**
 * The focused class's name, one-line facts and inline settings (`children`). Pinned under the
 * show header while the class's checklist and exhibitors scroll (MYK9-1266); its height is published so focused controls scroll
 * to just below it. Stacked, it pins to the page under the show header; split, the card lives in a
 * sticky panel with its own scroll (FOCUSED_CLASS_PANEL_CLASS) and the header pins to the panel's top.
 * Wherever it pins it is compact (MYK9-1989): pinned at full size it took most of a laptop's
 * window and left room for one entry.
 */
export function FocusedClassHeader({
  eyebrow,
  title,
  facts,
  pinMode = 'none',
  menu,
  compact = false,
  actions,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  facts: string;
  /** The split's own-scroll panel: pin to the panel's top, not the page offset. */
  pinMode?: FocusedClassPinMode;
  /** The ⋯ Actions menu, pinned top-right like the trial card's. */
  menu?: ReactNode;
  /**
   * Where the header pins (a laptop's height is scarce): the name, the eyebrow and the controls on
   * one line (MYK9-1989, MYK9-2379), so the class's entries start right under it.
   */
  compact?: boolean;
  /** Buttons on the name's line, before the menu. */
  actions?: ReactNode;
  /** The status and values under the name: in place of `facts` when compact, after them otherwise. */
  summary?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeightVar(ref, FOCUSED_CLASS_HEADER_HEIGHT_VAR);
  return (
    <div
      ref={ref}
      data-testid="focused-class-header"
      data-compact={compact ? 'true' : undefined}
      className={cn(
        'rounded-t-xl border-b',
        compact ? 'px-4 py-2' : 'p-5',
        pinMode === 'panel'
          ? FOCUSED_CLASS_HEADER_CLASS_IN_PANEL
          : pinMode === 'page'
            ? FOCUSED_CLASS_HEADER_CLASS
            : 'bg-card'
      )}
    >
      {compact ? (
        <>
          {/* The one row: the name, its status and the actions never wrap under; the name truncates (full name in its title). */}
          <div className="flex flex-nowrap items-center gap-x-2">
            <div className="flex min-w-0 flex-1 items-baseline gap-x-3">
              <h2
                className="max-w-[70%] shrink-0 truncate text-lg font-semibold tracking-tight"
                title={title}
              >
                {title}
              </h2>
              {/* The status badge (and, where no card says them, the values) beside the name: one line. */}
              {summary && (
                <div className="min-w-0 shrink-0 self-center whitespace-nowrap">{summary}</div>
              )}
              <span
                title={eyebrow}
                className="min-w-0 shrink-[3] truncate text-xs font-semibold uppercase tracking-[0.12em] text-primary"
              >
                {eyebrow}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              {menu}
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
            {facts && <p className="mt-1 text-sm text-muted-foreground">{facts}</p>}
            {summary && <div className="mt-2">{summary}</div>}
          </div>
          {(actions || menu) && (
            <div className="-mr-2 -mt-2 flex shrink-0 items-center gap-1">
              {actions}
              {menu}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
