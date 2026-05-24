import { CheckCircle2, ClipboardCheck, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SetupReadinessSignal } from './setupReadinessSignals';

interface SetupAdaptiveHeaderProps {
  signals: readonly SetupReadinessSignal[];
}

// INTENT: Setup-tab analogue of ShowDeskAdaptiveHeader. Replaces the
// always-visible AboutThisPhase banner + PhaseChecklist + AskQ help card
// with a single, signal-driven row. When the secretary has finished setup,
// the header collapses to a green "Ready" affordance — no permanent
// educational copy or static checklist.
export function SetupAdaptiveHeader({ signals }: SetupAdaptiveHeaderProps) {
  const ready = signals.length === 0;
  return (
    <section
      className="rounded-md border bg-muted/15 px-4 py-3"
      aria-label="Setup readiness"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {ready ? (
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
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
                ? "Show details, trials, classes, judges, and exhibitor materials are in place."
                : `${signals.length} ${signals.length === 1 ? 'item' : 'items'} left before the show is ready.`}
            </p>
          </div>
        </div>
        {!ready && (
          <div className="flex flex-wrap gap-1.5" data-testid="setup-signals">
            {signals.map(signal => (
              <Badge key={signal.id} variant="outline" className="gap-1">
                <ListChecks className="h-3 w-3" aria-hidden="true" />
                {signal.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
