import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { TrialsTab } from '@/components/shows/tabs/TrialsTab';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';
import { EntryDataUnavailablePanel } from '@/components/shows/ShowDetails/EntryDataUnavailablePanel';
import { useShowManagementOutlet } from '@/components/shows/ShowDetails/showManagementOutlet';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import {
  SETUP_CLASSES_PARAMS,
  SETUP_SECTIONS,
  resolveSetupClassesView,
  resolveSetupSection,
  type SetupSectionId,
} from '@/pages/secretary/showSetupSections';

const ShowMapTab = React.lazy(() => import('@/features/show-map/ShowMapTab'));

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
        // The Classes section's own params (view, trial, focus) do not follow you out of it.
        // `returnTo` (the Show Desk way back) is not one of them, on purpose: it follows the
        // secretary across Trials, Classes and Show Map until they leave Setup.
        for (const key of SETUP_CLASSES_PARAMS) params.delete(key);
        return params;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  // The Classes section keeps its view and trial in the URL, so the address bar, back / forward
  // and a shared link always agree with what is on screen.
  const setClassesParam = (key: 'view' | 'trialId', value: string | null) => {
    setSearchParams(
      previous => {
        const params = new URLSearchParams(previous);
        if (value === null || (key === 'view' && value === 'all')) params.delete(key);
        else params.set(key, value);
        // Landing on a deep-linked class is one-shot: moving on drops the focus.
        params.delete('focus');
        return params;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  return (
    <div className="mt-4 space-y-4">
      <ShowDeskReturnLink showId={show.id} />
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
          viewId={resolveSetupClassesView(searchParams.get('view'))}
          onViewChange={view => setClassesParam('view', view)}
          trials={trials}
          trialId={searchParams.get('trialId')}
          onTrialChange={trial => setClassesParam('trialId', trial)}
          focusClassId={searchParams.get('focus')}
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
