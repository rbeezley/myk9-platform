import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, RotateCcw, WifiOff } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  COCKPIT_PROTOTYPE_SCENARIOS,
  COCKPIT_PROTOTYPE_FILTERS,
  COCKPIT_PROTOTYPE_VARIANTS,
  type CockpitClassPrototype,
  type CockpitPrototypeAction,
  type CockpitPrototypeFilter,
  type CockpitPrototypeStatus,
  type CockpitPrototypeVariant,
  type PaperworkPrototype,
} from '@/features/show-map/prototype/secretaryCockpitPrototypeData';
import { SecretaryCockpitPrototypeAttentionCard } from '@/features/show-map/prototype/SecretaryCockpitPrototypeAttention';
import {
  SecretaryCockpitPrototypeFocus,
  type PrototypePrintRecord,
} from '@/features/show-map/prototype/SecretaryCockpitPrototypeFocus';
import { SecretaryCockpitPrototypeSchedule } from '@/features/show-map/prototype/SecretaryCockpitPrototypeSchedule';
import {
  buildPrototypeLifecycleOverride,
  type PrototypeLifecycleOverride,
} from '@/features/show-map/prototype/secretaryCockpitPrototypeLifecycle';
import {
  PrototypeDestination,
  PrototypePrintDialog,
  ScenarioSwitcher,
  type PrototypePrintFlow,
} from '@/features/show-map/prototype/SecretaryCockpitPrototypeOverlays';

// PROTOTYPE: One approved cockpit layout with three operational scenarios,
// switchable through `?variant=`. Fixture data only; no query or mutation path.
function isVariant(value: string | null): value is CockpitPrototypeVariant {
  return COCKPIT_PROTOTYPE_VARIANTS.some(variant => variant === value);
}

function isFilter(value: string | null): value is CockpitPrototypeFilter {
  return COCKPIT_PROTOTYPE_FILTERS.some(filter => filter.key === value);
}

function printKey(classId: string, paperworkId: string) {
  return `${classId}:${paperworkId}`;
}

export default function SecretaryCockpitPrototypePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variantValue = searchParams.get('variant');
  const filterValue = searchParams.get('filter');
  // Preserve old prototype links while standardizing the visible lifecycle
  // language on the canonical "In progress" term.
  const normalizedFilterValue = filterValue === 'running' ? 'in-progress' : filterValue;
  const variant: CockpitPrototypeVariant = isVariant(variantValue) ? variantValue : 'scent';
  const filter: CockpitPrototypeFilter = isFilter(normalizedFilterValue)
    ? normalizedFilterValue
    : 'all';
  const scenario = COCKPIT_PROTOTYPE_SCENARIOS[variant];
  const [lifecycleOverrides, setLifecycleOverrides] = useState<
    Record<string, PrototypeLifecycleOverride>
  >({});
  const [expectedStartOverrides, setExpectedStartOverrides] = useState<
    Record<string, string | null>
  >({});
  const classes = useMemo(
    () =>
      scenario.classes.map(classItem => {
        const key = `${variant}:${classItem.id}`;
        const lifecycleOverride = lifecycleOverrides[key];
        const hasExpectedStartOverride = Object.prototype.hasOwnProperty.call(
          expectedStartOverrides,
          key
        );
        return {
          ...classItem,
          ...lifecycleOverride,
          ...(hasExpectedStartOverride
            ? { revisedExpectedTime: expectedStartOverrides[key] ?? undefined }
            : {}),
        };
      }),
    [expectedStartOverrides, lifecycleOverrides, scenario.classes, variant]
  );
  const attention = useMemo(
    () =>
      scenario.attention.map(item => {
        const classItem = classes.find(candidate => candidate.id === item.classId);
        if (classItem?.revisedExpectedTime && item.id === 'move-up') {
          return {
            ...item,
            detail: `${classItem.name} · expected ${classItem.revisedExpectedTime}`,
          };
        }
        if (classItem?.status === 'complete' && classItem.issue?.includes('scores')) {
          return {
            ...item,
            detail: `${classItem.name} · class complete · score entry still needed`,
          };
        }
        return item;
      }),
    [classes, scenario.attention]
  );
  const requestedFocus = searchParams.get('focus');
  const defaultFocus =
    classes.find(item => item.status === 'in-progress')?.id ?? classes[0]?.id;
  const focusedId = classes.some(item => item.id === requestedFocus)
    ? requestedFocus
    : defaultFocus;
  const focusedClass = classes.find(item => item.id === focusedId) ?? classes[0]!;
  const owner = searchParams.get('owner');
  const destination = searchParams.get('destination');
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [printFlow, setPrintFlow] = useState<PrototypePrintFlow | null>(null);
  const [printedRecords, setPrintedRecords] = useState<Record<string, PrototypePrintRecord>>({});
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    classItem: CockpitClassPrototype;
    status: CockpitPrototypeStatus;
  } | null>(null);

  const updateSearch = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) next.delete(key);
        else next.set(key, value);
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const filteredClasses = useMemo(
    () =>
      classes.filter(item => {
        if (filter === 'in-progress') return item.status === 'in-progress';
        if (filter === 'attention') return Boolean(item.issue);
        if (filter === 'closeout') return Boolean(item.needsCloseout);
        return true;
      }),
    [classes, filter]
  );

  const commitStatusChange = useCallback(
    (classItem: CockpitClassPrototype, status: CockpitPrototypeStatus) => {
      setLifecycleOverrides(current => ({
        ...current,
        [`${variant}:${classItem.id}`]: buildPrototypeLifecycleOverride(classItem, status),
      }));
      setPendingStatusChange(null);
    },
    [variant]
  );

  const requestStatusChange = useCallback(
    (classItem: CockpitClassPrototype, status: CockpitPrototypeStatus) => {
      const hasUnenteredScores = status === 'complete' && classItem.scored < classItem.total;
      if (hasUnenteredScores || status === 'cancelled') {
        setPendingStatusChange({ classItem, status });
        return;
      }
      commitStatusChange(classItem, status);
    },
    [commitStatusChange]
  );

  const changeExpectedStart = useCallback(
    (classItem: CockpitClassPrototype, revisedExpectedTime?: string) => {
      setExpectedStartOverrides(current => ({
        ...current,
        [`${variant}:${classItem.id}`]: revisedExpectedTime ?? null,
      }));
    },
    [variant]
  );

  const navigateToOwner = useCallback(
    (action: CockpitPrototypeAction, classId: string) => {
      updateSearch({ focus: classId, owner: action.owner, destination: action.destination });
    },
    [updateSearch]
  );

  const openPrint = useCallback(
    (classItem: CockpitClassPrototype, paperwork: PaperworkPrototype) => {
      setPrintFlow({ classItem, paperwork, stage: 'report' });
    },
    []
  );

  const markPrinted = useCallback(() => {
    if (!printFlow) return;
    const time = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date());
    setPrintedRecords(current => ({
      ...current,
      [printKey(printFlow.classItem.id, printFlow.paperwork.id)]: {
        actor: 'You',
        time,
        pendingSync: scenario.syncMode === 'offline',
      },
    }));
    setPrintFlow(null);
    updateSearch({ focus: printFlow.classItem.id });
  }, [printFlow, scenario.syncMode, updateSearch]);

  if (owner && destination) {
    return (
      <>
        <PrototypeDestination
          owner={owner}
          destination={destination}
          onBack={() => updateSearch({ owner: null, destination: null })}
        />
        <ScenarioSwitcher
          current={variant}
          onChange={next =>
            updateSearch({ variant: next, focus: null, owner: null, destination: null })
          }
        />
      </>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 bg-background p-4 pb-24 text-foreground sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {scenario.showName}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              {scenario.day}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">{scenario.context}</span>
            <Badge
              variant="outline"
              className={cn(
                'px-3 py-1.5',
                scenario.syncMode === 'offline'
                  ? 'border-info/30 bg-info/10 text-info-strong'
                  : 'border-success/30 bg-success/10 text-success'
              )}
            >
              {scenario.syncMode === 'offline' ? (
                <WifiOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              {scenario.syncLabel}
            </Badge>
            <Button type="button" variant="outline" className="min-h-11">
              Change day
              <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="attention-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="attention-heading"
            className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Needs attention · {attention.length}
          </h2>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 text-primary"
            onClick={() => setShowAllAttention(current => !current)}
          >
            {showAllAttention ? 'Show top 3' : 'View all'}
          </Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {(showAllAttention ? attention : attention.slice(0, 3)).map(item => (
            <SecretaryCockpitPrototypeAttentionCard
              key={item.id}
              item={item}
              onActivate={attention => navigateToOwner(attention.action, attention.classId)}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="schedule-heading">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.95fr)]">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <h2
                id="schedule-heading"
                className="text-2xl font-bold tracking-tight text-foreground"
              >
                Today’s schedule
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select a Class to focus it. Filters apply to this schedule only.
              </p>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Schedule filters">
                {COCKPIT_PROTOTYPE_FILTERS.map(item => (
                  <Button
                    key={item.key}
                    type="button"
                    variant={filter === item.key ? 'default' : 'secondary'}
                    className="min-h-11 rounded-full"
                    onClick={() => updateSearch({ filter: item.key })}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <SecretaryCockpitPrototypeSchedule
                key={variant}
                classes={filteredClasses}
                focusedClass={focusedClass}
                printedRecords={printedRecords}
                onFocus={classId => updateSearch({ focus: classId })}
                onPrimaryAction={classItem =>
                  classItem.primaryAction.kind === 'print'
                    ? openPrint(
                        classItem,
                        classItem.paperwork.find(
                          paperwork => paperwork.id === classItem.primaryAction.documentId
                        ) ?? classItem.paperwork[0]!
                      )
                    : navigateToOwner(classItem.primaryAction, classItem.id)
                }
                onNavigate={navigateToOwner}
                onPrint={openPrint}
                onRecordPrinted={(selectedClass, paperwork) =>
                  setPrintFlow({ classItem: selectedClass, paperwork, stage: 'confirm' })
                }
                onStatusChange={requestStatusChange}
                onExpectedStartChange={changeExpectedStart}
                embedded
              />
            </div>
          </div>

          <div className="hidden lg:block">
            <SecretaryCockpitPrototypeFocus
              classItem={focusedClass}
              printedRecords={printedRecords}
              onNavigate={navigateToOwner}
              onPrint={openPrint}
              onRecordPrinted={(selectedClass, paperwork) =>
                setPrintFlow({ classItem: selectedClass, paperwork, stage: 'confirm' })
              }
              onStatusChange={requestStatusChange}
            />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <span>{scenario.syncLabel} · fixture data only</span>
        <button
          type="button"
          className="min-h-11 font-medium text-primary"
          onClick={() => {
            setPrintedRecords({});
            setLifecycleOverrides({});
            setExpectedStartOverrides({});
          }}
        >
          <RotateCcw className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Reset prototype
        </button>
      </div>

      <PrototypePrintDialog
        flow={printFlow}
        syncMode={scenario.syncMode}
        onChange={setPrintFlow}
        onMarkPrinted={markPrinted}
      />

      <AlertDialog
        open={pendingStatusChange !== null}
        onOpenChange={open => {
          if (!open) setPendingStatusChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatusChange?.status === 'cancelled'
                ? `Cancel ${pendingStatusChange.classItem.name}?`
                : `Mark ${pendingStatusChange?.classItem.name ?? 'Class'} complete?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatusChange?.status === 'cancelled'
                ? 'This removes the Class from active show-day work. You can restore it later from the status badge.'
                : `${Math.max(0, (pendingStatusChange?.classItem.total ?? 0) - (pendingStatusChange?.classItem.scored ?? 0))} paper scores still need entry. The Class will be recorded as physically finished, and score entry will remain visible as attention work.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current status</AlertDialogCancel>
            <AlertDialogAction
              className={
                pendingStatusChange?.status === 'cancelled'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
              onClick={() => {
                if (pendingStatusChange) {
                  commitStatusChange(pendingStatusChange.classItem, pendingStatusChange.status);
                }
              }}
            >
              {pendingStatusChange?.status === 'cancelled' ? 'Cancel class' : 'Mark complete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScenarioSwitcher
        current={variant}
        onChange={next =>
          updateSearch({
            variant: next,
            focus: null,
            filter: 'all',
            owner: null,
            destination: null,
          })
        }
      />
    </main>
  );
}
