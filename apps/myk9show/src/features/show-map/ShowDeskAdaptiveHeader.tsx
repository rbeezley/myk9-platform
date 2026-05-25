import { useState } from 'react';
import { CheckCheck, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShowMapGuidanceCard } from './ShowMapGuidanceCard';
import { ShowMapRunningNowStrip } from './ShowMapRunningNowStrip';
import type { ShowMapAction } from './showMapActions';
import type { ShowMapActionGroup } from './showMapActionGroups';
import type { ShowMapRunningNowItem } from './showMapRunningNow';
import type { ShowDeskShowStatus } from './showDeskStatus';
import type {
  ShowDeskPendingSignal,
  ShowDeskPendingSignalId,
} from './showDeskPendingSignals';

const STATUS_LABEL: Record<ShowDeskShowStatus, string> = {
  setup: 'Setup',
  'show-in-progress': 'Show in progress',
  'wrap-up': 'Wrap-up',
  closed: 'Closed',
};

const STATUS_TONE: Record<ShowDeskShowStatus, string> = {
  setup: 'bg-muted text-muted-foreground',
  'show-in-progress': 'bg-emerald-100 text-emerald-900',
  'wrap-up': 'bg-amber-100 text-amber-900',
  closed: 'bg-slate-200 text-slate-900',
};

export interface ShowDeskAdaptiveHeaderProps {
  showStatus: ShowDeskShowStatus;
  statusSummary: string;
  guidanceAction: ShowMapAction | undefined;
  upNextGroups: readonly ShowMapActionGroup[];
  runningNow: readonly ShowMapRunningNowItem[];
  pendingSignals: readonly ShowDeskPendingSignal[];
  onStartAction: (action: ShowMapAction) => void;
  onDismissGuidance: () => void;
  onSelectRunning: (nodeId: string) => void;
  onSelectPendingSignal?: ((signalId: ShowDeskPendingSignalId) => void) | undefined;
  // When provided, the expanded view of multi-item review-entry groups
  // renders an "Approve all N" button that calls back with the group.
  // Single-entry inline approve and per-dog bulk are in-flow workbench
  // actions; show-wide bulk approve belongs to the Entries Management page
  // (see CLAUDE.md surface-boundary rule), which is why this header only
  // exposes a *link* to that page when there's a pending-review count.
  onBulkApproveGroup?: ((group: ShowMapActionGroup) => void) | undefined;
  // When provided AND reviewQueueCount > 0, a "Manage entries (N)" link
  // appears in the pending-signals row. Clicking navigates to the canonical
  // entries surface — workbench does not duplicate its table/bulk UI.
  onOpenEntryManagement?: (() => void) | undefined;
  reviewQueueCount?: number;
}

const MAX_UP_NEXT = 3;

export function ShowDeskAdaptiveHeader({
  showStatus,
  statusSummary,
  guidanceAction,
  upNextGroups,
  runningNow,
  pendingSignals,
  onStartAction,
  onDismissGuidance,
  onSelectRunning,
  onSelectPendingSignal,
  onBulkApproveGroup,
  onOpenEntryManagement,
  reviewQueueCount = 0,
}: ShowDeskAdaptiveHeaderProps) {
  const visibleGroups = upNextGroups.slice(0, MAX_UP_NEXT);
  const showManageEntriesLink = Boolean(onOpenEntryManagement) && reviewQueueCount > 0;

  return (
    <header className="mb-4 flex flex-col gap-3" aria-label="Show Desk header">
      <StatusPill status={showStatus} summary={statusSummary} />

      {(pendingSignals.length > 0 || showManageEntriesLink) && (
        <div className="flex flex-wrap items-center gap-2">
          {pendingSignals.length > 0 && (
            <PendingSignalsRow signals={pendingSignals} onSelect={onSelectPendingSignal} />
          )}
          {showManageEntriesLink && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenEntryManagement}
              data-testid="open-entry-management"
            >
              <ExternalLink className="h-4 w-4" />
              Manage entries ({reviewQueueCount})
            </Button>
          )}
        </div>
      )}

      <ShowMapGuidanceCard
        action={guidanceAction}
        canExecute={Boolean(guidanceAction)}
        onStart={() => {
          if (guidanceAction) onStartAction(guidanceAction);
        }}
        onDismiss={onDismissGuidance}
      />

      {visibleGroups.length > 0 && (
        <UpNextList
          groups={visibleGroups}
          onStart={onStartAction}
          onBulkApproveGroup={onBulkApproveGroup}
        />
      )}

      <ShowMapRunningNowStrip items={[...runningNow]} onSelect={onSelectRunning} />
    </header>
  );
}

function StatusPill({ status, summary }: { status: ShowDeskShowStatus; summary: string }) {
  return (
    <section className="flex flex-col gap-1" aria-label="Show status">
      <div className="flex items-center gap-2">
        <Badge
          data-testid="show-desk-status-pill"
          className={`px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status]}`}
        >
          {STATUS_LABEL[status]}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{summary}</p>
    </section>
  );
}

// Splits "#100 · Bravo · Handler — Entry is waiting…" into its context and
// issue halves so the group summary can show context once at the top while
// each expanded child only carries the issue text alongside its class label.
function splitWhy(why: string): { context: string; issue: string } {
  const sep = ' — ';
  const idx = why.indexOf(sep);
  if (idx === -1) return { context: why, issue: '' };
  return { context: why.slice(0, idx), issue: why.slice(idx + sep.length) };
}

function UpNextList({
  groups,
  onStart,
  onBulkApproveGroup,
}: {
  groups: readonly ShowMapActionGroup[];
  onStart: (action: ShowMapAction) => void;
  onBulkApproveGroup?: ((group: ShowMapActionGroup) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="rounded-md border bg-muted/15" aria-label="Up next">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Up next
      </div>
      <ul className="divide-y" data-testid="up-next-list">
        {groups.map(group =>
          group.count === 1 ? (
            <SingleItemRow key={group.key} group={group} onStart={onStart} />
          ) : (
            <MultiItemRow
              key={group.key}
              group={group}
              expanded={expanded.has(group.key)}
              onToggle={() => toggle(group.key)}
              onStart={onStart}
              onBulkApprove={onBulkApproveGroup}
            />
          )
        )}
      </ul>
    </section>
  );
}

function SingleItemRow({
  group,
  onStart,
}: {
  group: ShowMapActionGroup;
  onStart: (action: ShowMapAction) => void;
}) {
  const action = group.representative;
  return (
    <li
      className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
      data-group-key={group.key}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium">{action.label}</div>
        <div className="text-xs text-muted-foreground">{action.why}</div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onStart(action)}
      >
        <action.icon className="h-4 w-4" />
        Open
      </Button>
    </li>
  );
}

function MultiItemRow({
  group,
  expanded,
  onToggle,
  onStart,
  onBulkApprove,
}: {
  group: ShowMapActionGroup;
  expanded: boolean;
  onToggle: () => void;
  onStart: (action: ShowMapAction) => void;
  onBulkApprove?: ((group: ShowMapActionGroup) => void) | undefined;
}) {
  const representative = group.representative;
  const { context } = splitWhy(representative.why);
  const summaryId = `up-next-group-${group.key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const showBulkApprove =
    Boolean(onBulkApprove) && representative.id === 'review-entry' && group.count > 1;
  return (
    <li className="flex flex-col" data-group-key={group.key}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-controls={summaryId}
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{representative.label}</span>
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-[10px]"
              data-testid="up-next-group-count"
            >
              ×{group.count}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {context}
            {context && ' — '}across {group.count} classes
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </button>
      {expanded && showBulkApprove && (
        <div
          className="flex items-center justify-between gap-3 border-t bg-primary/5 px-3 py-2"
          data-testid="up-next-group-bulk-approve"
        >
          <span className="text-xs text-muted-foreground">
            Bulk approve every pending entry for this dog.
          </span>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onBulkApprove?.(group)}
          >
            <CheckCheck className="h-4 w-4" />
            Approve all {group.count}
          </Button>
        </div>
      )}
      {expanded && (
        <ul
          id={summaryId}
          className="divide-y border-t bg-background/40"
          data-testid="up-next-group-children"
        >
          {group.items.map(item => {
            const { issue } = splitWhy(item.action.why);
            return (
              <li
                key={`${item.action.id}:${item.action.nodeId}`}
                className="flex flex-col gap-2 px-3 py-2 pl-8 sm:flex-row sm:items-center sm:justify-between"
                data-group-child-key={item.action.nodeId}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {item.disambiguator ?? item.action.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{issue || item.action.why}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onStart(item.action)}
                >
                  <item.action.icon className="h-4 w-4" />
                  Open
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function PendingSignalsRow({
  signals,
  onSelect,
}: {
  signals: readonly ShowDeskPendingSignal[];
  onSelect: ((signalId: ShowDeskPendingSignalId) => void) | undefined;
}) {
  return (
    <section
      aria-label="Pending signals"
      className="flex flex-wrap items-center gap-2"
      data-testid="show-desk-pending-signals"
    >
      {signals.map(signal => {
        const isInteractive = Boolean(onSelect);
        // INTENT: Interactive chips are filter shortcuts (Pattern 1) — they must meet
        // the 44x44px minimum from docs/INTENT.md. min-h-[44px] plus generous padding
        // keeps the chip readable on desktop while remaining tappable on tablet.
        const className = `inline-flex min-h-[44px] items-center rounded-full border px-4 py-2 text-sm font-medium ${
          isInteractive
            ? 'cursor-pointer bg-card hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            : 'bg-card text-foreground'
        }`;
        if (!isInteractive) {
          return (
            <span key={signal.id} className={className} data-signal-id={signal.id}>
              {signal.label}
            </span>
          );
        }
        return (
          <button
            key={signal.id}
            type="button"
            className={className}
            data-signal-id={signal.id}
            onClick={() => onSelect?.(signal.id)}
          >
            {signal.label}
          </button>
        );
      })}
    </section>
  );
}
