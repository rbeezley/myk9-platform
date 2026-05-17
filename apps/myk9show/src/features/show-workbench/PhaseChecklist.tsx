import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, MinusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  getPhaseChecklistDefinitions,
  type PhaseChecklistContext,
  type PhaseChecklistDefinition,
} from './phaseChecklistDefinitions';
import type { ShowWorkbenchPhase } from '@/hooks/useActivePhase';

type ManualChecklistValue = 'checked' | 'skipped';
type ManualChecklistState = Record<string, ManualChecklistValue>;
type ResolvedChecklistStatus = 'auto' | 'checked' | 'skipped' | 'open';

interface PhaseChecklistProps {
  phase: ShowWorkbenchPhase;
  showId: string;
  context: PhaseChecklistContext;
}

interface PhaseChecklistBodyProps {
  phase: ShowWorkbenchPhase;
  showId: string;
  autoCompleteIds: string[];
  definitions: PhaseChecklistDefinition[];
}

function storageKey(showId: string, phase: ShowWorkbenchPhase): string {
  return `myk9show:workbench-checklist:${showId}:${phase}`;
}

function readStoredState(
  showId: string,
  phase: ShowWorkbenchPhase,
  ignoredIds: Set<string>
): ManualChecklistState {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(storageKey(showId, phase));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, ManualChecklistValue] =>
          (entry[1] === 'checked' || entry[1] === 'skipped') && !ignoredIds.has(entry[0])
      )
    );
  } catch {
    return {};
  }
}

function writeStoredState(
  showId: string,
  phase: ShowWorkbenchPhase,
  state: ManualChecklistState
) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(showId, phase), JSON.stringify(state));
}

function statusForItem(
  itemId: string,
  isAutoComplete: boolean,
  manualState: ManualChecklistState
): ResolvedChecklistStatus {
  if (isAutoComplete) return 'auto';
  return manualState[itemId] ?? 'open';
}

function statusLabel(status: ResolvedChecklistStatus): string {
  if (status === 'auto') return 'Auto';
  if (status === 'checked') return 'Done';
  if (status === 'skipped') return 'Skipped';
  return 'Open';
}

function StatusIcon({ status }: { status: ResolvedChecklistStatus }) {
  if (status === 'skipped') return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  if (status === 'open') return <Circle className="h-4 w-4 text-muted-foreground" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
}

function PhaseChecklistBody({
  phase,
  showId,
  autoCompleteIds,
  definitions,
}: PhaseChecklistBodyProps) {
  const autoCompleteIdSet = useMemo(() => new Set(autoCompleteIds), [autoCompleteIds]);
  const [manualState, setManualState] = useState<ManualChecklistState>(() =>
    readStoredState(showId, phase, autoCompleteIdSet)
  );

  const items = definitions.map(definition => {
    const autoComplete = autoCompleteIdSet.has(definition.id);
    return {
      ...definition,
      autoComplete,
      status: statusForItem(definition.id, autoComplete, manualState),
    };
  });
  const handledCount = items.filter(item => item.status !== 'open').length;
  const progress = items.length > 0 ? Math.round((handledCount / items.length) * 100) : 0;

  useEffect(() => {
    writeStoredState(showId, phase, manualState);
  }, [manualState, phase, showId]);

  function setManualItem(itemId: string, value: ManualChecklistValue | null) {
    setManualState(current => {
      const next = { ...current };
      if (value === null) delete next[itemId];
      else next[itemId] = value;
      writeStoredState(showId, phase, next);
      return next;
    });
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby={`${phase}-checklist-title`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Phase checklist</p>
          <h3 id={`${phase}-checklist-title`} className="text-base font-semibold text-foreground">
            {handledCount} of {items.length} handled
          </h3>
        </div>
        <Badge variant={handledCount === items.length ? 'default' : 'secondary'}>
          {handledCount === items.length ? 'Ready' : 'In progress'}
        </Badge>
      </div>
      <Progress
        value={progress}
        className="mt-3 h-2"
        aria-label={`${handledCount} of ${items.length} checklist items handled`}
      />
      <div className="mt-4 divide-y">
        {items.map(item => {
          const isHandled = item.status !== 'open';
          const isAutoComplete = item.status === 'auto';
          const titleId = `${item.id}-title`;
          const statusId = `${item.id}-status`;
          return (
            <div
              key={item.id}
              className="flex gap-3 py-3 first:pt-0 last:pb-0"
              data-checklist-item-id={item.id}
            >
              <Checkbox
                checked={isHandled}
                disabled={isAutoComplete}
                aria-labelledby={titleId}
                aria-describedby={statusId}
                className={cn('mt-0.5', isAutoComplete && 'opacity-100')}
                onCheckedChange={checked =>
                  setManualItem(item.id, checked ? 'checked' : null)
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusIcon status={item.status} />
                    <p id={titleId} className="font-medium text-foreground">
                      {item.title}
                    </p>
                  </div>
                  <Badge
                    id={statusId}
                    variant={item.status === 'open' ? 'outline' : 'secondary'}
                    className={cn(
                      'w-fit',
                      item.status === 'auto' &&
                        'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                    )}
                  >
                    {statusLabel(item.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                {!isAutoComplete && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status !== 'checked' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setManualItem(item.id, 'checked')}
                      >
                        Mark done
                      </Button>
                    )}
                    {item.status !== 'skipped' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setManualItem(item.id, 'skipped')}
                      >
                        Skip
                      </Button>
                    )}
                    {item.status !== 'open' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setManualItem(item.id, null)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PhaseChecklist({ phase, showId, context }: PhaseChecklistProps) {
  const definitions = useMemo(() => getPhaseChecklistDefinitions(phase), [phase]);
  const autoCompleteIds = useMemo(
    () => definitions.filter(definition => definition.autoComplete(context)).map(item => item.id),
    [context, definitions]
  );
  const autoCompleteKey = autoCompleteIds.join('|');

  return (
    <PhaseChecklistBody
      key={`${showId}:${phase}:${autoCompleteKey}`}
      phase={phase}
      showId={showId}
      autoCompleteIds={autoCompleteIds}
      definitions={definitions}
    />
  );
}
