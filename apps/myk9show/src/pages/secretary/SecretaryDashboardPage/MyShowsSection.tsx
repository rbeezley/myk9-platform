import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ShowPhaseCard } from './ShowPhaseCard';
import type { Show } from '@/types/show-types';
import type { ShowPhase } from '@/hooks/useMyShows';

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
    <section className="mb-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2.5 mb-3 text-left group"
        aria-expanded={open}
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
        <div className="flex flex-col gap-2">
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
