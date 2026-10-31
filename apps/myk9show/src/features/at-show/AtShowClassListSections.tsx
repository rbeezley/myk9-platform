/**
 * The picker's card lists: the Pending tab's "Your ring" section and the
 * per-trial collapsible lists (MYK9-1506 split this out of AtShowClassListPage).
 */
import { ChevronRight } from 'lucide-react';
import type { ClassEntry } from '@myk9/ringside';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { getTrialTimezone } from '@/features/registries';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { AtShowClassRow, type AtShowClassCardProps } from './AtShowClassRow';
import { CLASS_LIST_PANEL_ID } from './AtShowClassListToolbar';
import { CLASS_LIST_TABS, type ClassListTab } from './atShowClassListFilter';
import { formatAtShowTrialHeading } from './atShowTrialHeading';
import type { DatedRingClass } from './orderRingClassesByDay';

interface AtShowClassListSectionsProps {
  tab: ClassListTab;
  yourRing: DatedRingClass[];
  byTrial: { trial: ReplicatedTrial; classes: ClassEntry[] }[];
  scopeToAssignedClasses: boolean;
  collapsedTrialIds: ReadonlySet<string>;
  onToggleTrial: (trialId: string, open: boolean) => void;
  cardProps: (entry: ClassEntry) => AtShowClassCardProps;
}

const COUNT_CHIP =
  'shrink-0 rounded-full bg-[color:var(--chip-stone-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--chip-stone-fg)]';

export function AtShowClassListSections({
  tab,
  yourRing,
  byTrial,
  scopeToAssignedClasses,
  collapsedTrialIds,
  onToggleTrial,
  cardProps,
}: AtShowClassListSectionsProps) {
  const hasCards =
    yourRing.length > 0 ||
    (!scopeToAssignedClasses && byTrial.some(({ classes }) => classes.length > 0));
  const tabLabel = CLASS_LIST_TABS.find(({ id }) => id === tab)?.label ?? '';

  return (
    <div role="tabpanel" id={CLASS_LIST_PANEL_ID} aria-labelledby={`at-show-class-tab-${tab}`}>
      {!hasCards && (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No classes match. Try another tab, or clear the search ({tabLabel}).
        </p>
      )}
      {yourRing.length > 0 && (
        <section
          aria-labelledby="your-ring-heading"
          className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-3"
        >
          <div className="mb-2 flex min-h-11 items-center gap-2 px-1">
            <h2 id="your-ring-heading" className="min-w-0 flex-1 text-sm font-semibold">
              Your ring
            </h2>
            <span className={COUNT_CHIP}>{yourRing.length}</span>
          </div>
          <ul className="space-y-2">
            {yourRing.map(({ entry, trialTimeZone, trialHeading, dayBucket, isToday }) => (
              <AtShowClassRow
                key={entry.id}
                entry={entry}
                trialTimeZone={trialTimeZone}
                trialHeading={trialHeading}
                dayBucket={dayBucket}
                isToday={isToday}
                {...cardProps(entry)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* INTENT: For a judge-only account with known assignments, Your ring
          IS the picker. Rendering the same rows again by trial doubles the
          scroll without adding a navigation option. Broader staff and the
          assignment-unknown fail-open retain the show-wide trial list. */}
      {!scopeToAssignedClasses &&
        byTrial.map(({ trial, classes }) => {
          if (classes.length === 0) return null;
          const isOpen = !collapsedTrialIds.has(trial.id);
          const trialTimeZone = getTrialTimezone(trial);
          const trialLabel = formatAtShowTrialHeading(trial);
          return (
            <Collapsible
              key={trial.id}
              open={isOpen}
              onOpenChange={open => onToggleTrial(trial.id, open)}
              className="mb-6"
              data-testid={`at-show-trial-${trial.id}`}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 px-1 text-left text-sm font-medium text-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${trialLabel}`}
                >
                  <ChevronRight
                    size={16}
                    className={cn('shrink-0 transition-transform', { 'rotate-90': isOpen })}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{trialLabel}</span>
                  <span className={COUNT_CHIP}>{classes.length}</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-2">
                  {classes.map(entry => (
                    <AtShowClassRow
                      key={entry.id}
                      entry={entry}
                      trialTimeZone={trialTimeZone}
                      {...cardProps(entry)}
                    />
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
    </div>
  );
}
