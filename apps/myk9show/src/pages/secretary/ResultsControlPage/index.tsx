/**
 * Results Control Page
 *
 * Result visibility for a show (presets, trial and class overrides, bulk Apply Preset). Mounted
 * only as the Results tab's Visibility settings sheet; releasing and hiding happen on the class
 * detail (MYK9-1318).
 */

import { useEffect, useMemo, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import {
  useShowSettings,
  useTrialOverrides,
  useClassOverrides,
  getDefaultShowSettings,
} from '@/hooks/queries/useShowSettingsDatabase';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { PresetSelector } from './PresetSelector';
import { ShowResultsPrivacyToggle } from './ShowResultsPrivacyToggle';
import { OverrideTree } from './OverrideTree';
import { ResultsBulkBar } from './ResultsBulkBar';
import { buildResultsReadinessSummary } from './readinessSummary';
import { judgeSignOffWording } from '@/features/show-map/judgeSignOff';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';

const getClassId = (c: { id: string }) => c.id;

/**
 * Inline body shown inside a card when the visibility queries error.
 * Deliberately compact: the page-level banner above carries the Retry action,
 * so this only needs to explain why the panel is empty rather than re-offer it.
 * Critically, this is NOT a skeleton — an errored query must visibly settle.
 */
function CardLoadError() {
  return (
    <p className="text-sm text-muted-foreground">
      Couldn&apos;t load these settings. Use <span className="font-medium">Retry</span> above to try
      again.
    </p>
  );
}

/**
 * `embedded` is the Results tab's "Visibility settings" sheet (MYK9-1031): the sheet supplies the
 * title and the tab owns navigation, so the page's own heading and return link stay out. Nothing
 * else changes, so the visibility cascade and the bulk visibility bar are the ones the page always had.
 */
export default function ResultsControlPage({ embedded = false }: { embedded?: boolean } = {}) {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id ?? '';
  const { trials } = useTrialStore();
  const { classes, entries } = useClassStore();

  const showTrials = useMemo(() => trials.filter(t => t.showId === showId), [trials, showId]);
  const showTrialIds = useMemo(() => new Set(showTrials.map(t => t.id)), [showTrials]);
  const showClasses = useMemo(
    () => classes.filter(c => showTrialIds.has(c.trialId)),
    [classes, showTrialIds]
  );

  const bulkOps = useBulkSelection({ items: showClasses, getItemId: getClassId });

  useEffect(() => {
    bulkOps.clearSelection();
  }, [showId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only on show change

  const allClassIds = useMemo(() => showClasses.map(c => c.id), [showClasses]);
  const readiness = useMemo(
    () => buildResultsReadinessSummary(showClasses, entries),
    [showClasses, entries]
  );

  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch: refetchSettings,
  } = useShowSettings(showId ?? null);
  const trialOverridesQuery = useTrialOverrides(showId ?? null);
  const {
    data: trialOverrides = [],
    isLoading: overridesLoading,
    isError: trialOverridesError,
    refetch: refetchTrialOverrides,
  } = trialOverridesQuery;
  const classOverridesQuery = useClassOverrides(showId ?? null);
  const {
    data: classOverrides = [],
    isLoading: classOverridesLoading,
    isError: classOverridesError,
    refetch: refetchClassOverrides,
  } = classOverridesQuery;

  const isLoading = settingsLoading || overridesLoading || classOverridesLoading;
  const isError = settingsError || trialOverridesError || classOverridesError;
  // MYK9-865: a failed background refetch (e.g. over a dead venue uplink after a
  // write or a release) keeps the last good settings on screen, as SelfCheckinTool
  // does. Only a query that errored with nothing cached replaces the card.
  const hasUnloadedData =
    (settingsError && settings === undefined) ||
    (trialOverridesError && trialOverridesQuery.data === undefined) ||
    (classOverridesError && classOverridesQuery.data === undefined);

  // `settings` is undefined whenever the query hasn't produced data: on a
  // resolved fetch it's always defined, but the queries are `enabled: !!showId`,
  // so an empty showId leaves them idle (isLoading=false, isError=false,
  // data=undefined) and we still land in the content branch. Falling back to
  // defaults keeps the panel usable there, and lets the content branch gate on
  // isError alone rather than `!settings` (which previously collapsed the
  // errored state back into the loading skeleton).
  const effectiveSettings = settings ?? getDefaultShowSettings();

  const retryAll = useCallback(() => {
    void refetchSettings();
    void refetchTrialOverrides();
    void refetchClassOverrides();
  }, [refetchSettings, refetchTrialOverrides, refetchClassOverrides]);

  // Adapter: toggle a class by its ID (for ClassOverrides component)
  const toggleClassById = useCallback(
    (classId: string) => {
      const cls = showClasses.find(c => c.id === classId);
      if (cls) bulkOps.toggleItem(cls);
    },
    [showClasses, bulkOps]
  );

  // Adapter: toggle all classes in a trial (select all if not all selected, deselect all otherwise)
  const toggleAllInTrial = useCallback(
    // trialId is provided by the caller but unused here — all logic is driven by classIds
    (_trialId: string, classIds: string[]) => {
      const idSet = new Set(classIds);
      const trialClasses = showClasses.filter(c => idSet.has(c.id));
      const allSelected = trialClasses.every(c => bulkOps.selectedIds.has(c.id));
      if (allSelected) {
        bulkOps.deselectItems(trialClasses);
      } else {
        bulkOps.selectItems(trialClasses);
      }
    },
    [showClasses, bulkOps]
  );

  return (
    <div className={embedded ? 'space-y-8' : 'container mx-auto py-6 space-y-8'}>
      {!embedded && <ShowDeskReturnLink showId={showId} />}
      {!embedded && <h1 className="text-3xl font-bold tracking-tight">Results</h1>}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {readiness.safeToSend ? (
              <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-5 w-5 text-warning" aria-hidden="true" />
            )}
            <CardTitle>Results readiness</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Three verdicts, not two. "Blocking closeout" is a claim that the
              counts below are real; when entries have not corroborated the
              classes, they are not, and the numbers are zeros by absence. */}
          <p className="font-medium" data-testid="results-readiness-verdict">
            {readiness.entriesUncorroborated
              ? "No entries are loaded for this show's classes, so scoring completeness can't be confirmed."
              : readiness.safeToSend
                ? 'Results are released and ready to submit.'
                : "Here's what is still blocking closeout."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="font-semibold">
                {readiness.entriesUncorroborated ? '—' : readiness.unscoredEntries}
              </span>{' '}
              unscored {readiness.unscoredEntries === 1 ? 'entry' : 'entries'}
            </div>
            <div>
              <span className="font-semibold">{readiness.unreleasedClasses}</span> unreleased{' '}
              {readiness.unreleasedClasses === 1 ? 'class' : 'classes'}
            </div>
            <div>
              {readiness.entriesUncorroborated ? '—' : readiness.totalEntries} entries in{' '}
              {readiness.totalClasses} classes
            </div>
          </div>
          {/* C18: a constant instruction sat in a grid cell beside three live
              counts and read as a fourth metric that never changed. */}
          <p className="text-muted-foreground">
            {judgeSignOffWording(showTrials[0]?.registryId).resultsControlInstruction}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-11">
              {/* Named for what it does. It is a navigation, not a download --
                  the file lives on Submit Results, and labelling a Link as a
                  file action on the page whose job is telling the truth about
                  results was the wrong place to be loose. */}
              <Link to={`/shows/${showId}/results?step=submit`}>Go to Submit Results</Link>
            </Button>
            <p className="text-muted-foreground">
              To release a class, open it on Results and press{' '}
              <span className="font-medium">Release results</span>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Query error state */}
      {isError && (
        <Alert variant={hasUnloadedData ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {hasUnloadedData
              ? 'Failed to load results settings'
              : "Couldn't refresh results settings"}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span>
              {hasUnloadedData
                ? 'There was a problem fetching show data. Check your connection and try again.'
                : 'The settings below may be out of date. Check your connection and try again.'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={retryAll}
              className="min-h-11 shrink-0 self-start sm:self-auto"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Result visibility and release controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Result visibility</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            // Mirror the settled layout (3 preset cards + override rows) so the
            // panel doesn't jump shape when data arrives.
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : hasUnloadedData ? (
            <CardLoadError />
          ) : (
            <div className="space-y-6">
              {/* Show default — the visibility cascade root */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Show defaults</h3>
                <PresetSelector showId={showId} settings={effectiveSettings} />
                <ShowResultsPrivacyToggle
                  showId={showId}
                  resultsPrivate={effectiveSettings.resultsPrivate ?? false}
                />
              </div>
              {/* Per-trial / per-class visibility overrides */}
              <OverrideTree
                facet="visibility"
                showId={showId}
                settings={effectiveSettings}
                trials={showTrials}
                classes={showClasses}
                trialOverrides={trialOverrides}
                classOverrides={classOverrides}
                selectedClasses={bulkOps.selectedIds}
                onToggleClass={toggleClassById}
                onToggleAllInTrial={toggleAllInTrial}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk actions */}
      <ResultsBulkBar
        showId={showId}
        selectedClasses={bulkOps.selectedIds}
        allClassIds={allClassIds}
        onSelectAll={bulkOps.selectAll}
        onClearSelection={bulkOps.clearSelection}
      />
    </div>
  );
}
