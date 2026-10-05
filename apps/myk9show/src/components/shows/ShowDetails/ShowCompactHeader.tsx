import React, { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateRange } from '@/utils/date-format';
import type { HeroParent } from '@/components/common/DetailHero';
import { cn } from '@/lib/utils';
import { usePublishedHeightVar } from '@/hooks/usePublishedHeightVar';
import { SHOW_DETAILS_PANEL_ID } from './ShowDetailsPanel';
import { SHOW_HEADER_CLASS, SHOW_HEADER_HEIGHT_VAR } from './showStickyLayout';

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
  /** Something that needs attention (an unpublished premium list), in the line under the name. */
  attention?: React.ReactNode;
  /** Whether the details panel is open, and the chevron that toggles it. */
  detailsOpen: boolean;
  onToggleDetails: () => void;
}

/**
 * The show's header on every management tab: name, dates and the status controls in one line,
 * pinned under the app header from `lg` up, with a chevron that opens the details panel under it
 * (`ShowDetailsPanel`). Its height is measured and published as `--show-header-h` (see
 * `showStickyLayout`), since the controls wrap on a narrow window.
 * The host club is plain text, not a link: a link here would need a 44px target (docs/INTENT.md),
 * which does not fit one line.
 */
export const ShowCompactHeader: React.FC<ShowCompactHeaderProps> = ({
  name,
  organization,
  startDate,
  endDate,
  parent,
  entryCount,
  controls,
  attention,
  detailsOpen,
  onToggleDetails,
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
        'flex items-center gap-3 border-b border-border bg-background py-2',
        SHOW_HEADER_CLASS
      )}
    >
      {/* The name keeps a floor; the controls wrap onto a second line before it truncates. */}
      <div className="min-w-[14rem] flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold leading-tight">{name}</h1>
          {organization && <Badge variant="default">{organization}</Badge>}
        </div>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {parent && <span>{parent.label}</span>}
          {facts.map(fact => (
            <span key={fact}>{fact}</span>
          ))}
          {attention}
        </p>
      </div>
      <div className="flex min-w-0 flex-initial flex-wrap items-center justify-end gap-2">
        {controls}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11 flex-none"
        aria-expanded={detailsOpen}
        aria-controls={SHOW_DETAILS_PANEL_ID}
        aria-label={detailsOpen ? 'Hide show details' : 'Show details'}
        onClick={onToggleDetails}
      >
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </Button>
    </div>
  );
};
