/**
 * "Needs a look" — the triage queue, read-only.
 *
 * INTENT: every count here comes from one array via summarizeTriage. The badge,
 * the filter tabs and the footer must never be able to disagree; production
 * showed 12, 10 and 3 for the same queue, which is the failure this section is
 * shaped to prevent.
 *
 * There is no owner column and no assignment control, on purpose — see
 * triageSelectors. Do not add one without a backend concept behind it.
 */
import { cn } from '@/lib/utils';
import { formatCheckedAgo } from '@/features/admin-system-health/systemHealthSelectors';
import {
  filterTriage,
  summarizeTriage,
  type TriageCategory,
  type TriageItem,
  type TriageSeverity,
} from '@/features/admin-overview/triageSelectors';
import { BoardCard, Eyebrow, FilterTabs } from '../SystemHealth/HealthBoardPrimitives';

// Critical is the only solid fill so it outranks High at a glance; both modes
// pass AA (light: white on rgb(185,28,28); dark: #450a0a on rgb(248,113,113)).
const SEVERITY_CHIP: Record<TriageSeverity, string> = {
  Critical: 'bg-destructive text-destructive-foreground',
  High: 'bg-destructive/10 text-destructive',
  Medium: 'bg-warning/10 text-warning',
  Low: 'bg-muted text-muted-foreground',
};

export function NeedsALookSection({
  items,
  filter,
  onFilterChange,
  now,
}: {
  items: TriageItem[];
  filter: TriageCategory | 'all';
  onFilterChange: (value: TriageCategory | 'all') => void;
  now: number;
}) {
  const summary = summarizeTriage(items);
  const visible = filterTriage(items, filter);

  if (summary.total === 0) {
    return (
      <BoardCard>
        <Eyebrow as="h2">Needs a look</Eyebrow>
        <p className="mt-2 text-[13px] text-foreground">Nothing is waiting on you.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No checks are failing and no alerts are unresolved. This list fills itself from those two
          places. It is not a to-do list you can add to.
        </p>
      </BoardCard>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eyebrow as="h2">Needs a look</Eyebrow>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-destructive">
            {summary.total}
          </span>
        </div>
        <FilterTabs
          ariaLabel="Filter what needs a look"
          active={filter}
          onChange={onFilterChange}
          tabs={[
            { value: 'all' as const, label: 'All', count: summary.total },
            { value: 'money' as const, label: 'Money', count: summary.money },
            { value: 'service' as const, label: 'Service', count: summary.service },
            { value: 'deadline' as const, label: 'Deadlines', count: summary.deadline },
          ]}
        />
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-[15px] border border-border">
        {visible.map(item => (
          <div
            key={item.id}
            className="flex min-w-0 flex-col gap-2 bg-card px-5 py-[13px] sm:flex-row sm:items-center sm:gap-3"
          >
            <span
              className={cn(
                'shrink-0 self-start rounded-[5px] px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-[0.05em]',
                SEVERITY_CHIP[item.severity]
              )}
            >
              {item.severity}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-foreground line-clamp-2 sm:line-clamp-1">
                {item.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {item.detail}
              </span>
            </span>

            <span className="shrink-0 font-mono text-xs text-muted-foreground sm:w-[92px]">
              {formatCheckedAgo(item.openedAt, now)}
            </span>

            <a
              href={item.action.href}
              className="inline-flex min-h-10 shrink-0 items-center self-start rounded-[9px] border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
            >
              {item.action.label}
            </a>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {visible.length} of {summary.total} open item{summary.total === 1 ? '' : 's'} from
        health checks and alerts.
      </p>
    </section>
  );
}
