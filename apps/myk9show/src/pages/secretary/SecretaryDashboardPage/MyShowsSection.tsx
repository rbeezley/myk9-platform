import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ShowPhaseCard } from './ShowPhaseCard';
import type { Show } from '@/types/show-types';
import type { ShowPhase } from '@/hooks/useMyShows';

// Reserve vertical space while the shows query is in flight so the rest of
// the dashboard (tabs, task list, message list) doesn't get pushed down once
// data arrives. The loaded state typically renders "Happening today" + an
// "Upcoming" section with 1–2 ShowPhaseCard rows (~72px each) plus the
// section headers (~56px each). 360px approximates that footprint and
// covers the worst mobile-stacked case without leaving excessive whitespace
// on a one-show account.
// INTENT: prevent CLS on /secretary/dashboard — see PR "perf(shows): reserve
// layout space for deferred panels (CLS)".
export const MY_SHOWS_SECTION_RESERVED_MIN_HEIGHT_PX = 360;

const PHASE_DOT_COLOR: Record<ShowPhase, string> = {
  today: 'bg-destructive',
  upcoming: 'bg-emerald-500',
  draft: 'bg-amber-500',
  past: 'bg-muted-foreground',
};

interface MyShowsSectionProps {
  phase: ShowPhase;
  title: string;
  subtitle?: string;
  shows: Show[];
  /** Whether the section starts collapsed (past shows) */
  defaultCollapsed?: boolean;
  /** Class stats forwarded to today cards */
  liveClassCount?: number | undefined;
  notStartedCount?: number | undefined;
  closedCount?: number | undefined;
}

export function MyShowsSection({
  phase,
  title,
  subtitle,
  shows,
  defaultCollapsed = false,
  liveClassCount,
  notStartedCount,
  closedCount,
}: MyShowsSectionProps) {
  const [open, setOpen] = useState(!defaultCollapsed);

  if (shows.length === 0) return null;

  const dotClass = PHASE_DOT_COLOR[phase];
  const pulse = phase === 'today';

  return (
    <section className="mb-6 border-b border-border pb-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2.5 mb-3 text-left group"
        aria-expanded={open}
        aria-controls={`section-${phase}`}
      >
        <span
          className={`h-3 w-3 rounded-full shrink-0 ${dotClass} ${pulse ? 'animate-pulse' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
          {shows.length} {shows.length === 1 ? 'show' : 'shows'}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div id={`section-${phase}`} className="flex flex-col gap-2">
          {shows.map(show => (
            <ShowPhaseCard
              key={show.id}
              show={show}
              phase={phase}
              liveClassCount={liveClassCount}
              notStartedCount={notStartedCount}
              closedCount={closedCount}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Loading-state placeholder for the stack of `MyShowsSection`s on the
 * secretary dashboard. Mirrors the loaded layout (two section headers + a
 * couple of card rows each) so the rest of the page doesn't shift when the
 * shows query resolves.
 */
export function MyShowsSectionSkeleton() {
  return (
    <div
      data-testid="my-shows-section-skeleton"
      style={{ minHeight: `${MY_SHOWS_SECTION_RESERVED_MIN_HEIGHT_PX}px` }}
      aria-busy="true"
      aria-label="Loading your shows"
    >
      <section className="mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-2.5 mb-3">
          <Skeleton className="h-3 w-3 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[72px] w-full" />
          <Skeleton className="h-[72px] w-full" />
        </div>
      </section>
      <section className="mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-2.5 mb-3">
          <Skeleton className="h-3 w-3 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[72px] w-full" />
        </div>
      </section>
    </div>
  );
}
