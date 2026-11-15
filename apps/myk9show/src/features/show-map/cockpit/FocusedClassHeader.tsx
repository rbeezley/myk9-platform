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
 * The focused class's name and one-line facts, pinned under the show header while the class's
 * checklist and exhibitors scroll (MYK9-1266); its height is published so focused controls scroll
 * to just below it. Stacked, it pins to the page under the show header; split, the card lives in a
 * sticky panel with its own scroll (FOCUSED_CLASS_PANEL_CLASS) and the header pins to the panel's top.
 *
 * Only the name line pins (MYK9-1989): the inline settings (`children`) sit right under it and
 * scroll with the class, so a laptop keeps room for the entries. `settingsClassName` carries the
 * card's scroll margin, since a focused setting must stop below the pinned line too.
 */
export function FocusedClassHeader({
  eyebrow,
  title,
  facts,
  pinMode = 'none',
  menu,
  settingsClassName,
  children,
}: {
  eyebrow: string;
  title: string;
  facts: string;
  /** The split's own-scroll panel: pin to the panel's top, not the page offset. */
  pinMode?: FocusedClassPinMode;
  /** The ⋯ Actions menu, pinned top-right like the trial card's. */
  menu?: ReactNode;
  settingsClassName?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeightVar(ref, FOCUSED_CLASS_HEADER_HEIGHT_VAR);
  return (
    <>
      <div
        ref={ref}
        data-testid="focused-class-header"
        className={cn(
          'rounded-t-xl border-b px-5 py-2',
          pinMode === 'panel'
            ? FOCUSED_CLASS_HEADER_CLASS_IN_PANEL
            : pinMode === 'page'
              ? FOCUSED_CLASS_HEADER_CLASS
              : 'bg-card'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          {/* One line on a laptop: which class and trial this is, its name, its facts; wraps in that order. */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </span>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {facts && <p className="text-sm text-muted-foreground">{facts}</p>}
          </div>
          {menu && <div className="-mr-2 shrink-0">{menu}</div>}
        </div>
      </div>
      {children && (
        <div
          data-testid="focused-class-settings"
          className={cn('border-b px-5 py-2', settingsClassName)}
        >
          {children}
        </div>
      )}
    </>
  );
}
