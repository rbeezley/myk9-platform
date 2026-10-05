import React from 'react';
import { Badge } from '@/components/ui/badge';
import { formatDateRange } from '@/utils/date-format';
import type { HeroParent } from '@/components/common/DetailHero';
import { cn } from '@/lib/utils';
import { SHOW_HEADER_CLASS } from './showStickyLayout';

interface ShowCompactHeaderProps {
  name: string;
  organization?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  parent?: HeroParent | undefined;
  /** `null` while entry counts are unavailable, so no false zero shows. */
  entryCount: number | null;
  /** Offline readiness, live status, presence and the status pill: the same controls as the full hero. */
  controls: React.ReactNode;
}

/**
 * The show's header on every management tab except Overview: name, dates and the status controls
 * in one line, pinned under the app header from `lg` up (heights and offsets: `showStickyLayout`).
 * The full hero (date block, quick-info cards) stays on Overview, where the show's details are the
 * point; elsewhere it pushed the work (the entry queue, results, reports) a screen down the page.
 * The host club is plain text, not a link: a link here would need a 44px target (docs/INTENT.md),
 * which does not fit one line, and the club is one click away on Overview.
 */
export const ShowCompactHeader: React.FC<ShowCompactHeaderProps> = ({
  name,
  organization,
  startDate,
  endDate,
  parent,
  entryCount,
  controls,
}) => {
  const dates = startDate ? formatDateRange(startDate, endDate ?? startDate) : '';
  const facts = [
    dates,
    entryCount === null ? '' : `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border bg-background py-2',
        SHOW_HEADER_CLASS
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold leading-tight">{name}</h1>
          {organization && <Badge variant="default">{organization}</Badge>}
        </div>
        <p className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 truncate text-xs text-muted-foreground">
          {parent && <span>{parent.label}</span>}
          {facts.map(fact => (
            <span key={fact}>{fact}</span>
          ))}
        </p>
      </div>
      <div className="flex flex-none flex-wrap items-center justify-end gap-2">{controls}</div>
    </div>
  );
};
