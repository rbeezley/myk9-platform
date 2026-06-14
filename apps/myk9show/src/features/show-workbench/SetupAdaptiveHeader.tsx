import { CheckCircle2, ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SetupReadinessSignal } from './setupReadinessSignals';

interface SetupAdaptiveHeaderProps {
  signals: readonly SetupReadinessSignal[];
}

// INTENT: Setup-tab analogue of ShowDeskAdaptiveHeader. Replaces the
// always-visible AboutThisPhase banner + PhaseChecklist + AskQ help card
// with a single, signal-driven row. When the secretary has finished setup,
// the header collapses to a green "Ready" affordance — no permanent
// educational copy or static checklist.
//
// INTENT: Each chip is a deep link to the surface that fixes it, styled to
// match ShowDeskAdaptiveHeader's interactive pending-signal chips (44px
// minimum touch target per docs/INTENT.md). An inert badge that names a
// problem without a path is the "wondering what to do next" anti-reference.
export function SetupAdaptiveHeader({ signals }: SetupAdaptiveHeaderProps) {
  const ready = signals.length === 0;
  return (
    <section className="rounded-md border bg-muted/15 px-4 py-3" aria-label="Setup readiness">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {ready ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success " aria-hidden="true" />
          ) : (
            <ClipboardCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {ready ? 'Setup ready' : 'Finish setup'}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ready
                ? 'Show details, trials, classes, judges, and the premium list are in place.'
                : `${signals.length} ${signals.length === 1 ? 'item' : 'items'} left — tap one to fix it.`}
            </p>
          </div>
        </div>
        {!ready && (
          <div className="flex flex-wrap gap-2" data-testid="setup-signals">
            {signals.map(signal => (
              <SetupSignalChip key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const CHIP_CLASS =
  'inline-flex min-h-[44px] items-center rounded-full border bg-card px-4 py-2 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function SetupSignalChip({ signal }: { signal: SetupReadinessSignal }) {
  // Hash hrefs target an anchor rendered by the parent route
  // (ShowDetailsPage hosts this page via <Outlet>, so the target is in the
  // same document); a plain <a> keeps native jump-to-fragment behavior
  // without a router round-trip.
  if (signal.href.startsWith('#')) {
    return (
      <a href={signal.href} className={CHIP_CLASS} data-signal-id={signal.id}>
        {signal.label}
      </a>
    );
  }
  return (
    <Link to={signal.href} className={CHIP_CLASS} data-signal-id={signal.id}>
      {signal.label}
    </Link>
  );
}
