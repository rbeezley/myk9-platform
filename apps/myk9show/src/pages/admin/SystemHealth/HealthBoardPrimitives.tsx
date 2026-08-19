/**
 * Shared primitives for the System Health board.
 *
 * These are the reusable half of the admin redesign — the five later admin pages
 * are meant to pick them up, so they take data and render, and hold no state and
 * no queries of their own.
 *
 * INTENT: every colour here is an EXISTING semantic token (`--success`,
 * `--warning`, `--destructive`, `--card`, `--border`, `--muted-foreground`). The
 * design handoff ships a hex palette, but it was derived from this codebase's
 * light theme and matches it exactly; re-declaring those hexes would create the
 * parallel token set the handoff itself warns against, and would lose the
 * project's WCAG-AA work — notably `--muted-foreground`, which is deliberately
 * #6b6358 in light mode because the handoff's #8c8376 was measured as failing.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CheckStatus } from '@/features/admin-system-health/systemHealthTypes';
import type { CheckRun, CheckSummary } from '@/features/admin-system-health/checkHistorySelectors';

/** Semantic colour per state. Amber covers both "unprovable" and "degraded". */
const STATUS_DOT: Record<CheckStatus, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  fail: 'bg-destructive',
  unknown: 'bg-warning',
};

const STATUS_TEXT: Record<CheckStatus, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  fail: 'text-destructive',
  unknown: 'text-warning',
};

const STATUS_TINT: Record<CheckStatus, string> = {
  ok: 'bg-success/10',
  warn: 'bg-warning/10',
  fail: 'bg-destructive/10',
  unknown: 'bg-warning/10',
};

/** 7px status dot. `aria-hidden` — the adjacent badge carries the meaning. */
export function StatusDot({ status }: { status: CheckStatus }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-[7px] shrink-0 rounded-full', STATUS_DOT[status])}
    />
  );
}

/** 12px uppercase section label. Pass `as="h2"` when it titles a section, so
 * screen-reader heading navigation can find the board's parts. */
export function Eyebrow({ children, as }: { children: ReactNode; as?: 'p' | 'h2' | 'h3' }) {
  const Tag = as ?? 'p';
  return (
    <Tag className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </Tag>
  );
}

/**
 * One count chip in the verdict band. The numeral is tabular so the three chips
 * stay aligned as counts change.
 */
export function CountChip({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status: CheckStatus;
}) {
  return (
    <div className={cn('min-w-[78px] rounded-md px-3 py-2 text-center', STATUS_TINT[status])}>
      <div className={cn('font-mono text-2xl font-semibold tabular-nums', STATUS_TEXT[status])}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * 12-run history strip. Oldest left, newest right, newest at full opacity.
 *
 * INTENT: bars are a UNIFORM height. They encode status by colour only — height
 * would imply a magnitude that a pass/fail run does not have, and a taller red
 * bar would read as "worse", which is not information this data carries.
 */
export function HistoryStrip({ runs, label }: { runs: CheckRun[]; label: string }) {
  if (runs.length === 0) {
    return <span className="text-xs text-muted-foreground">no history yet</span>;
  }
  const newest = runs.length - 1;
  return (
    <div
      className="flex items-center gap-[2px]"
      role="img"
      aria-label={`${label}: last ${runs.length} runs, oldest first: ${runs
        .map(r => r.status)
        .join(', ')}`}
    >
      {runs.map((run, i) => (
        <span
          key={`${run.at}-${i}`}
          className={cn('h-[14px] w-[6px] rounded-[2px]', STATUS_DOT[run.status])}
          // Older runs ramp 0.32 -> ~0.87; the newest is always fully opaque so
          // the strip's right edge and the row's badge read as the same fact.
          style={{ opacity: i === newest ? 1 : 0.32 + (i / Math.max(newest, 1)) * 0.55 }}
        />
      ))}
    </div>
  );
}

export interface FilterTab<T extends string> {
  value: T;
  label: string;
  count: number;
}

/** Filter tabs whose counts are always passed in, never recomputed locally. */
export function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: FilterTab<T>[];
  active: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {tabs.map(tab => {
        const selected = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {tab.label} <span className="font-mono tabular-nums">{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Card shell — one radius, one padding, one border for the whole board. */
export function BoardCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn('rounded-[15px] border border-border bg-card px-5 py-[18px]', className)}
    >
      {children}
    </section>
  );
}

/**
 * Loading shell. Skeletons at the real row height, never a centred spinner that
 * replaces the layout — the page should not jump when the data lands.
 */
export function BoardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-[18px]" role="status" aria-label="Loading system health">
      <div className="h-[112px] animate-pulse rounded-[15px] bg-muted" />
      <div className="h-[64px] animate-pulse rounded-[15px] bg-muted" />
      <div className="space-y-px overflow-hidden rounded-[15px] border border-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-[58px] animate-pulse bg-muted" />
        ))}
      </div>
    </div>
  );
}

/**
 * Error shell. Says what failed and offers a retry — and deliberately renders
 * no counts, because an errored block that shows zeroes reads as "all clear".
 */
export function BoardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <BoardCard className="border-l-[3px] border-l-destructive">
      <Eyebrow>Couldn&apos;t load</Eyebrow>
      <h2 className="mt-2 text-lg font-medium text-foreground">System health didn&apos;t load</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {message} Nothing below is showing platform state. This is a failure to read the board, not
        a report that everything is fine.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-[9px] bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Try again
      </button>
    </BoardCard>
  );
}

/** The three verdict chips, all derived from one summary. */
export function VerdictChips({ summary }: { summary: CheckSummary }) {
  return (
    <div className="flex shrink-0 gap-2">
      <CountChip label="failing" value={summary.failing} status="fail" />
      <CountChip label="unverified" value={summary.unverified} status="warn" />
      <CountChip label="passing" value={summary.passing} status="ok" />
    </div>
  );
}
