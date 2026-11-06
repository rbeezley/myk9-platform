import React, { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatDateRange } from '@/utils/date-format';
import type { HeroParent } from '@/components/common/DetailHero';
import { cn } from '@/lib/utils';
import { usePublishedHeightVar } from '@/hooks/usePublishedHeightVar';
import { SHOW_HEADER_CLASS, SHOW_HEADER_HEIGHT_VAR } from './showStickyLayout';

interface ShowHeaderProps {
  name: string;
  organization?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  parent?: HeroParent | undefined;
  /** `null` while entry counts are unavailable, so no false zero shows. */
  entryCount: number | null;
  /** The device line (offline copy), live status and presence. */
  controls: React.ReactNode;
  /** The show's one status line (status, plus a publishing nudge), under the name. */
  status?: React.ReactNode;
}

/**
 * The show's header on every management tab: name, dates and the status controls in one line,
 * pinned under the app header from `lg` up. The show's facts live on the About tab, not behind a
 * control here (MYK9-1683). Its height is measured and published as `--show-header-h` (see
 * `showStickyLayout`), since the controls wrap on a narrow window.
 * The host club is plain text, not a link: a link here would need a 44px target (docs/INTENT.md),
 * which does not fit one line.
 */
export const ShowHeader: React.FC<ShowHeaderProps> = ({
  name,
  organization,
  startDate,
  endDate,
  parent,
  entryCount,
  controls,
  status,
}) => {
  const headerRef = useRef<HTMLDivElement>(null);
  usePublishedHeightVar(headerRef, SHOW_HEADER_HEIGHT_VAR);
  const dates = startDate ? formatDateRange(startDate, endDate ?? startDate) : '';
  const facts = [
    dates,
    entryCount === null ? '' : `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`,
  ].filter(Boolean);

  return (
    <div
      ref={headerRef}
      className={cn(
        // Phones: the name (one line, truncated) and facts on top, the device line and presence on one
        // row under them, so Show Desk starts in the top half of a 375x812 screen (MYK9-1729). From lg
        // it is one line (name, controls).
        'flex flex-wrap items-center gap-x-3 gap-y-0 border-b border-border bg-background py-1 lg:flex-nowrap lg:gap-y-2 lg:py-2',
        SHOW_HEADER_CLASS
      )}
    >
      {/* The name keeps a floor; the controls wrap onto a second line before it truncates. */}
      <div className="min-w-0 flex-1 basis-48 lg:min-w-[14rem]">
        <div className="flex min-w-0 items-center gap-2">
          <h1
            title={name}
            className="min-w-0 truncate text-lg font-semibold leading-tight sm:overflow-visible sm:whitespace-normal lg:overflow-hidden lg:whitespace-nowrap"
          >
            {name}
          </h1>
          {organization && <Badge variant="default">{organization}</Badge>}
        </div>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {parent && <span>{parent.label}</span>}
          {facts.map(fact => (
            <span key={fact}>{fact}</span>
          ))}
          {status}
        </p>
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-1 gap-y-0 lg:w-auto lg:gap-x-2 lg:flex-initial lg:justify-end lg:gap-y-2">
        {controls}
      </div>
    </div>
  );
};
