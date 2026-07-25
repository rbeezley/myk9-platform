import { useState } from 'react';
import { ArrowRight, CheckCheck, ChevronDown, ChevronRight, ListFilter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { chipClasses } from '@/components/base/chipClasses';
import { ShowMapGuidanceCard } from './ShowMapGuidanceCard';
import { ShowMapRunningNowStrip } from './ShowMapRunningNowStrip';
import type { ShowMapAction } from './showMapActions';
import type { ShowMapActionGroup } from './showMapActionGroups';
import type { ShowMapRunningNowItem } from './showMapRunningNow';
import type { ShowDeskShowStatus } from './showDeskStatus';
import {
  SHOW_DESK_SIGNAL_INTERACTION,
  type ShowDeskPendingSignal,
  type ShowDeskPendingSignalId,
} from './showDeskPendingSignals';

const STATUS_LABEL: Record<ShowDeskShowStatus, string> = {
  setup: 'Setup',
  'show-in-progress': 'Show in progress',
  'wrap-up': 'Wrap-up',
  closed: 'Closed',
};

const STATUS_TONE: Record<ShowDeskShowStatus, string> = {
  setup: 'bg-muted text-muted-foreground',
  'show-in-progress': 'bg-success/10 text-success',
  'wrap-up': 'bg-warning/10 text-warning',
  // "Closed" is an inactive state: warm stone chip token (DESIGN.md
  // "stone=inactive"), not a cool slate. The token carries both light and
  // dark values, so no dark: variant is needed.
  closed: chipClasses('stone'),
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
  // Primary Running Now click — navigate straight to the class page.
  onOpenRunning: (href: string) => void;
  // Secondary Running Now action — expand + scroll the Show Map tree.
  onSelectRunning: (nodeId: string) => void;
  onSelectPendingSignal?: ((signalId: ShowDeskPendingSignalId) => void) | undefined;
  // When provided, the expanded view of multi-item review-entry groups
  // renders an "Approve all N" button that calls back with the group.
  // Single-entry inline approve and per-dog bulk are in-flow workbench
  // actions; show-wide bulk approve belongs to the Entries Management page
  // (see CLAUDE.md surface-boundary rule) — the "Review N entries" pending
  // chip is the single route there (MYK9-64 F1).
  onBulkApproveGroup?: ((group: ShowMapActionGroup) => void) | undefined;
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
  onOpenRunning,
  onSelectRunning,
  onSelectPendingSignal,
  onBulkApproveGroup,
}: ShowDeskAdaptiveHeaderProps) {
  const visibleGroups = upNextGroups.slice(0, MAX_UP_NEXT);

  // INTENT: This is the page's one elevated zone — the "now" cluster
  // (status, signals, next action, up next, running now) sits on a card
  // surface so the eye lands here first; everything below stays flat.
  return (
    <header
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]"
      aria-label="Show Desk header"
    >
      <StatusPill status={showStatus} summary={statusSummary} />

      {pendingSignals.length > 0 && (
        <PendingSignalsRow signals={pendingSignals} onSelect={onSelectPendingSignal} />
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

      <ShowMapRunningNowStrip
        items={[...runningNow]}
        onOpen={onOpenRunning}
        onLocate={onSelectRunning}
      />
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
  // Identical actions on different classes must say which class they
  // belong to — three bare "Print Check-In Sheet" rows are unanswerable
  // for a secretary scanning the queue.
  const disambiguator = group.items[0]?.disambiguator;
  return (
    <li
      className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
      data-group-key={group.key}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={action.label}>
          {action.label}
          {disambiguator && (
            <span className="font-normal text-muted-foreground"> · {disambiguator}</span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={action.why}>
          {action.why}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-[44px] w-full sm:w-auto"
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
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium" title={representative.label}>
              {representative.label}
            </span>
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-[10px]"
              data-testid="up-next-group-count"
            >
              ×{group.count}
            </Badge>
          </div>
          <div
            className="truncate text-xs text-muted-foreground"
            title={`${context}${context && ', '}across ${group.count} classes`}
          >
            {context}
            {context && ', '}across {group.count} classes
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
          className="flex flex-col gap-3 border-t bg-primary/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          data-testid="up-next-group-bulk-approve"
        >
          <span className="text-xs text-muted-foreground">
            Bulk approve every pending entry for this dog.
          </span>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="min-h-[44px] w-full sm:w-auto"
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
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium"
                    title={item.disambiguator ?? item.action.label}
                  >
                    {item.disambiguator ?? item.action.label}
                  </div>
                  <div
                    className="truncate text-xs text-muted-foreground"
                    title={issue || item.action.why}
                  >
                    {issue || item.action.why}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] w-full sm:w-auto"
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
        const interaction = SHOW_DESK_SIGNAL_INTERACTION[signal.id];
        const hasResolvingAction = interaction === 'filter' || Boolean(signal.href);
        const isInteractive = Boolean(onSelect && hasResolvingAction);
        // INTENT: Interactive chips are filter shortcuts (Pattern 1) — they must meet
        // the 44x44px minimum from docs/INTENT.md. min-h-[44px] plus generous padding
        // keeps the chip readable on desktop while remaining tappable on tablet.
        const className = `inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium ${
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
        // Distinct affordance per behavior: chips that leave Show Desk carry an
        // arrow; chips that apply a local Show Map lens carry a filter glyph.
        return (
          <button
            key={signal.id}
            type="button"
            className={className}
            data-signal-id={signal.id}
            data-signal-interaction={interaction}
            onClick={() => onSelect?.(signal.id)}
          >
            {signal.label}
            {interaction === 'navigate' ? (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ListFilter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </section>
  );
}
