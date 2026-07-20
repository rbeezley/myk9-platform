import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  SecretaryCockpitPrototypeFocus,
  type PrototypePrintRecord,
} from './SecretaryCockpitPrototypeFocus';
import type {
  CockpitClassPrototype,
  CockpitPrototypeAction,
  CockpitPrototypeStatus,
  PaperworkPrototype,
} from './secretaryCockpitPrototypeData';
import {
  SecretaryCockpitPrototypeLifecycleTime,
  SecretaryCockpitPrototypeStatusControl,
} from './SecretaryCockpitPrototypeStatusControl';
import { SecretaryCockpitPrototypeExpectedStart } from './SecretaryCockpitPrototypeExpectedStart';

interface SecretaryCockpitPrototypeScheduleProps {
  classes: readonly CockpitClassPrototype[];
  focusedClass: CockpitClassPrototype;
  printedRecords: Readonly<Record<string, PrototypePrintRecord>>;
  onFocus: (classId: string) => void;
  onPrimaryAction: (classItem: CockpitClassPrototype) => void;
  onNavigate: (action: CockpitPrototypeAction, classId: string) => void;
  onPrint: (classItem: CockpitClassPrototype, paperwork: PaperworkPrototype) => void;
  onRecordPrinted: (classItem: CockpitClassPrototype, paperwork: PaperworkPrototype) => void;
  onStatusChange: (classItem: CockpitClassPrototype, status: CockpitPrototypeStatus) => void;
  onExpectedStartChange: (
    classItem: CockpitClassPrototype,
    revisedExpectedTime?: string
  ) => void;
  embedded?: boolean;
}

export function SecretaryCockpitPrototypeSchedule({
  classes,
  focusedClass,
  printedRecords,
  onFocus,
  onPrimaryAction,
  onNavigate,
  onPrint,
  onRecordPrinted,
  onStatusChange,
  onExpectedStartChange,
  embedded = false,
}: SecretaryCockpitPrototypeScheduleProps) {
  const [collapsedTrials, setCollapsedTrials] = useState<ReadonlySet<string>>(new Set());
  const trialGroups = useMemo(() => {
    const groups: Array<{
      id: string;
      number: string;
      date: string;
      classes: CockpitClassPrototype[];
    }> = [];

    for (const classItem of classes) {
      const group = groups.find(item => item.id === classItem.trialId);
      if (group) group.classes.push(classItem);
      else {
        groups.push({
          id: classItem.trialId,
          number: classItem.trialNumber,
          date: classItem.trialDate,
          classes: [classItem],
        });
      }
    }

    return groups;
  }, [classes]);

  function toggleTrial(trialId: string) {
    setCollapsedTrials(current => {
      const next = new Set(current);
      if (next.has(trialId)) next.delete(trialId);
      else next.add(trialId);
      return next;
    });
  }

  if (classes.length === 0) {
    return (
      <div
        className={cn(
          'bg-card p-8 text-center text-muted-foreground',
          !embedded && 'rounded-2xl border border-border'
        )}
      >
        No Classes match this filter.
      </div>
    );
  }

  return (
    <div className={cn(embedded ? 'divide-y divide-border' : 'space-y-3')}>
      {trialGroups.map(trialGroup => {
        const collapsed = collapsedTrials.has(trialGroup.id);
        const inProgressCount = trialGroup.classes.filter(
          classItem => classItem.status === 'in-progress'
        ).length;
        const attentionCount = trialGroup.classes.filter(classItem => classItem.issue).length;
        const containsFocus = trialGroup.classes.some(
          classItem => classItem.id === focusedClass.id
        );

        return (
          <section
            key={trialGroup.id}
            className={cn(
              'overflow-hidden bg-card',
              !embedded && 'rounded-2xl border border-border'
            )}
            aria-labelledby={`trial-${trialGroup.id}-heading`}
          >
            <button
              type="button"
              className={cn(
                'flex min-h-16 w-full items-center justify-between gap-4 bg-muted/35 px-4 py-3 text-left transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                !collapsed && 'border-b border-border'
              )}
              aria-expanded={!collapsed}
              aria-controls={`trial-${trialGroup.id}-classes`}
              onClick={() => toggleTrial(trialGroup.id)}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`trial-${trialGroup.id}-heading`} className="font-bold text-foreground">
                    Trial {trialGroup.number}
                  </h3>
                  <span className="text-sm text-muted-foreground">{trialGroup.date}</span>
                  {containsFocus && (
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      Focused
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {trialGroup.classes.length}{' '}
                  {trialGroup.classes.length === 1 ? 'Class' : 'Classes'} · {inProgressCount} in
                  progress ·{' '}
                  {attentionCount} {attentionCount === 1 ? 'attention item' : 'attention items'}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
                {collapsed ? 'Show Classes' : 'Hide Classes'}
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
            </button>

            {!collapsed && (
              <div id={`trial-${trialGroup.id}-classes`}>
                {trialGroup.classes.map(classItem => {
                  const selected = classItem.id === focusedClass.id;
                  return (
                    <div key={classItem.id} className="border-b border-border last:border-b-0">
                      <div
                        className={cn(
                          'grid min-h-[112px] grid-cols-[136px_minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[148px_minmax(0,1fr)_auto]',
                          selected && 'border-l-4 border-l-primary bg-accent/70 pl-3'
                        )}
                      >
                        <div className="pt-1 text-sm">
                          <SecretaryCockpitPrototypeExpectedStart
                            classItem={classItem}
                            onChange={onExpectedStartChange}
                          />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="min-h-11 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => onFocus(classItem.id)}
                            aria-pressed={selected}
                          >
                            <span className="block text-lg font-bold text-foreground">
                              {classItem.name}
                            </span>
                            <span className="mt-1 block text-sm text-muted-foreground">
                              {classItem.location ?? 'Operational area not assigned'} ·{' '}
                              {classItem.judge}
                            </span>
                          </button>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <SecretaryCockpitPrototypeStatusControl
                              classItem={classItem}
                              onStatusChange={onStatusChange}
                            />
                            <SecretaryCockpitPrototypeLifecycleTime
                              classItem={classItem}
                              compact
                            />
                            <span
                              className={cn(
                                'text-sm',
                                classItem.issue ? 'text-destructive' : 'text-muted-foreground'
                              )}
                            >
                              {classItem.issue ??
                                `${classItem.scored} of ${classItem.total} scored`}
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant={classItem.issue ? 'default' : 'secondary'}
                          className={cn(
                            'col-start-2 min-h-12 justify-self-start sm:col-start-3 sm:row-start-1 sm:self-center',
                            classItem.issue &&
                              'bg-primary text-primary-foreground hover:bg-primary/90'
                          )}
                          onClick={() => onPrimaryAction(classItem)}
                        >
                          {classItem.primaryAction.label}
                          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                      {selected && (
                        <div className="p-3 pt-0 lg:hidden">
                          <SecretaryCockpitPrototypeFocus
                            classItem={classItem}
                            printedRecords={printedRecords}
                            onNavigate={onNavigate}
                            onPrint={onPrint}
                            onRecordPrinted={onRecordPrinted}
                            onStatusChange={onStatusChange}
                            compact
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
