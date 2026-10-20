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
 * The focused class's name and one-line facts. Pinned under the show header while the class's
 * checklist and exhibitors scroll (MYK9-1266); its height is published so focused controls scroll
 * to just below it. Stacked, it pins to the page under the show header; split, the card lives in a
 * sticky panel with its own scroll (FOCUSED_CLASS_PANEL_CLASS) and the header pins to the panel's top.
 */
export function FocusedClassHeader({
  eyebrow,
  title,
  facts,
  pinMode = 'none',
  children,
}: {
  eyebrow: string;
  title: string;
  facts: string;
  /** The split's own-scroll panel: pin to the panel's top, not the page offset. */
  pinMode?: FocusedClassPinMode;
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
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      {facts && <p className="mt-1 text-sm text-muted-foreground">{facts}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
