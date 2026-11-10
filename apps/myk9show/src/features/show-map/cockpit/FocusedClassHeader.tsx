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
 * The focused class's name, one-line facts and inline settings (`children`). Pinned under the show header while the class's
 * checklist and exhibitors scroll (MYK9-1266); its height is published so focused controls scroll
 * to just below it. Stacked, it pins to the page under the show header; split, the card lives in a
 * sticky panel with its own scroll (FOCUSED_CLASS_PANEL_CLASS) and the header pins to the panel's top.
 */
export function FocusedClassHeader({
  eyebrow,
  title,
  facts,
  pinMode = 'none',
  menu,
  children,
}: {
  eyebrow: string;
  title: string;
  facts: string;
  /** The split's own-scroll panel: pin to the panel's top, not the page offset. */
  pinMode?: FocusedClassPinMode;
  /** The ⋯ Actions menu, pinned top-right like the trial card's. */
  menu?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeightVar(ref, FOCUSED_CLASS_HEADER_HEIGHT_VAR);
  return (
    <div
      ref={ref}
      data-testid="focused-class-header"
      className={cn(
        'rounded-t-xl border-b p-5',
        pinMode === 'panel'
          ? FOCUSED_CLASS_HEADER_CLASS_IN_PANEL
          : pinMode === 'page'
            ? FOCUSED_CLASS_HEADER_CLASS
            : 'bg-card'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
          {facts && <p className="mt-1 text-sm text-muted-foreground">{facts}</p>}
        </div>
        {menu && <div className="-mr-2 -mt-2 shrink-0">{menu}</div>}
      </div>
      {children}
    </div>
  );
}
