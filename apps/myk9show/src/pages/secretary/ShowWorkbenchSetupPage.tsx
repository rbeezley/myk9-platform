import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { TrialsTab } from '@/components/shows/tabs/TrialsTab';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';
import { EntryDataUnavailablePanel } from '@/components/shows/ShowDetails/EntryDataUnavailablePanel';
import { useShowManagementOutlet } from '@/components/shows/ShowDetails/showManagementOutlet';

const ShowMapTab = React.lazy(() => import('@/features/show-map/ShowMapTab'));

export const SETUP_SECTIONS = [
  { id: 'trials', label: 'Trials' },
  { id: 'classes', label: 'Classes' },
  { id: 'map', label: 'Show Map' },
] as const;

export type SetupSectionId = (typeof SETUP_SECTIONS)[number]['id'];

export function resolveSetupSection(raw: string | null, canShowMap: boolean): SetupSectionId {
  if (raw === 'classes') return 'classes';
  if (raw === 'map') return canShowMap ? 'map' : 'trials';
  return 'trials';
}

/**
 * Setup — one of the six show tabs (MYK9-630 phase 2). It absorbs what used to
 * be the Trials, Classes and Show Map tabs on `/shows/:id`.
 *
 * The three views are a SEGMENTED CONTROL, not a second tab row, and
 * deliberately so: the six tabs above are the page-level row, and a second
 * underline strip immediately beneath it is exactly the "difficult to tell if
 * they are tabs or links or buttons" complaint this phase exists to answer.
 * Pressed pill buttons read as a filter within one page — the same shape Entry
 * Management's queue chips already use — and cannot be mistaken for the tabs.
 *
 * Every body renders from the data the show page already loaded and handed
 * down through the outlet context; nothing here re-reads trials, classes or
 * entries.
 */
export function ShowWorkbenchSetupPage() {
  const outlet = useShowManagementOutlet();
  const [searchParams, setSearchParams] = useSearchParams();
  const canShowMap = Boolean(outlet?.canShowMap);
  const section = resolveSetupSection(searchParams.get('section'), canShowMap);

  if (!outlet) return null;

  const {
    show,
    trials,
    trialStats,
    classes,
    hasUserEntries,
    mapTrials,
    mapClasses,
    mapEntries,
    entryDataState = 'ready',
    onRetryEntryData,
  } = outlet;
  const entryDataUnavailable = entryDataState !== 'ready';
  const sections = SETUP_SECTIONS.filter(item => item.id !== 'map' || canShowMap);

  const setSection = (next: SetupSectionId) => {
    setSearchParams(
      previous => {
        const params = new URLSearchParams(previous);
        if (next === 'trials') params.delete('section');
        else params.set('section', next);
        return params;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Setup section">
        {sections.map(item => {
          const isActive = item.id === section;
          return (
            <Button
              key={item.id}
              type="button"
              variant={isActive ? 'secondary' : 'ghost'}
              aria-pressed={isActive}
              className={cn(
                'min-h-11 shrink-0',
                isActive && 'border border-primary/30 bg-primary/10'
              )}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </div>

      {entryDataUnavailable ? (
        <EntryDataUnavailablePanel state={entryDataState} onRetry={onRetryEntryData} />
      ) : section === 'trials' ? (
        <TrialsTab trials={trials} showId={show.id} trialStats={trialStats} />
      ) : section === 'classes' ? (
        <ClassesTab
          classes={classes}
          showId={show.id}
          userHasEntries={hasUserEntries}
          hideRing={trials.some(
            trial =>
              trial.trialType === 'Scent Work' ||
              trial.trialType === 'Nosework' ||
              trial.trialType === 'Scent Detection'
          )}
        />
      ) : (
        <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
          <ShowMapTab
            show={show}
            trials={mapTrials}
            classes={mapClasses}
            entries={mapEntries}
            // INTENT: the show page's map is view-only for EVERYONE, managers
            // included (#291; docs/archive/plan-show-map-workbench-collapse.md).
            // The manager action layer lives on Show Day.
            canManageShow={false}
          />
        </Suspense>
      )}
    </div>
  );
}

export default ShowWorkbenchSetupPage;
