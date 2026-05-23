import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShowMapGuidanceCard } from './ShowMapGuidanceCard';
import { ShowMapRunningNowStrip } from './ShowMapRunningNowStrip';
import type { ShowMapAction } from './showMapActions';
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
  upNextActions: readonly ShowMapAction[];
  runningNow: readonly ShowMapRunningNowItem[];
  pendingSignals: readonly ShowDeskPendingSignal[];
  onStartAction: (action: ShowMapAction) => void;
  onDismissGuidance: () => void;
  onSelectRunning: (nodeId: string) => void;
  onSelectPendingSignal?: ((signalId: ShowDeskPendingSignalId) => void) | undefined;
}

const MAX_UP_NEXT = 3;

export function ShowDeskAdaptiveHeader({
  showStatus,
  statusSummary,
  guidanceAction,
  upNextActions,
  runningNow,
  pendingSignals,
  onStartAction,
  onDismissGuidance,
  onSelectRunning,
  onSelectPendingSignal,
}: ShowDeskAdaptiveHeaderProps) {
  const visibleUpNext = upNextActions.slice(0, MAX_UP_NEXT);

  return (
    <header className="mb-4 flex flex-col gap-3" aria-label="Show Desk header">
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

      {visibleUpNext.length > 0 && (
        <UpNextList actions={visibleUpNext} onStart={onStartAction} />
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

function UpNextList({
  actions,
  onStart,
}: {
  actions: readonly ShowMapAction[];
  onStart: (action: ShowMapAction) => void;
}) {
  return (
    <section className="rounded-md border bg-muted/15" aria-label="Up next">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Up next
      </div>
      <ul className="divide-y">
        {actions.map(action => (
          <li
            key={`${action.id}:${action.nodeId}`}
            className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
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
        ))}
      </ul>
    </section>
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
        const className = `rounded-full border px-3 py-1 text-xs font-medium ${
          isInteractive
            ? 'cursor-pointer bg-card hover:bg-muted/40'
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
