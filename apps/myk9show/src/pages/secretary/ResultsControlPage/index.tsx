/**
 * Results Control Page
 *
 * Standalone secretary page for managing result visibility,
 * self check-in, and releasing results with bulk operations.
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
import { ShowCheckinToggle } from './ShowCheckinToggle';
import { OverrideTree } from './OverrideTree';
import { BulkOperationsBar } from './BulkOperationsBar';
import { buildResultsReadinessSummary } from './readinessSummary';
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

export default function ResultsControlPage() {
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
  const {
    data: trialOverrides = [],
    isLoading: overridesLoading,
    isError: trialOverridesError,
    refetch: refetchTrialOverrides,
  } = useTrialOverrides(showId ?? null);
  const {
    data: classOverrides = [],
    isLoading: classOverridesLoading,
    isError: classOverridesError,
    refetch: refetchClassOverrides,
  } = useClassOverrides(showId ?? null);

  const isLoading = settingsLoading || overridesLoading || classOverridesLoading;
  const isError = settingsError || trialOverridesError || classOverridesError;

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

  // Adapter: drop specific class IDs from the selection (by id, not item)
  const deselectClassesByIds = useCallback(
    (classIds: string[]) => {
      const idSet = new Set(classIds);
      const toDeselect = showClasses.filter(c => idSet.has(c.id));
      bulkOps.deselectItems(toDeselect);
    },
    [showClasses, bulkOps]
  );

  // Entity lookup maps depend only on the override/class data, not the
  // selection — hoist them out of the selection-keyed memo below so a checkbox
  // toggle re-runs only the `.some()` scan, not three Map rebuilds.
  const classOverrideMap = useMemo(
    () => new Map(classOverrides.map(o => [o.classId, o])),
    [classOverrides]
  );
  const trialOverrideMap = useMemo(
    () => new Map(trialOverrides.map(o => [o.trialId, o])),
    [trialOverrides]
  );
  const classTrialMap = useMemo(
    () => new Map(showClasses.map(c => [c.id, c.trialId])),
    [showClasses]
  );

  // Does this class use manual_release timing on any field? Only those fields
  // actually respond to clearing results_released_at — 'immediate' fields are
  // always shown and 'class_complete' fields stay visible once the class is
  // complete, so Hide Results has no visible effect on them (see
  // shouldShowField in @myk9/secretary's visibility-cascade).
  const classHasManualReleaseTiming = useCallback(
    (classId: string): boolean => {
      if (!settings) return false;

      const classOverride = classOverrideMap.get(classId);
      const trialId = classTrialMap.get(classId);
      const trialOverride = trialId ? trialOverrideMap.get(trialId) : undefined;

      const timingFields = ['placement', 'qualification', 'time', 'faults'] as const;
      return timingFields.some(field => {
        const effective =
          classOverride?.override[field] ??
          trialOverride?.override[field] ??
          settings.visibility[field];
        return effective === 'manual_release';
      });
    },
    [classOverrideMap, trialOverrideMap, classTrialMap, settings]
  );

  // Check if any selected class uses manual_release timing on any field
  const hasManualReleaseClasses = useMemo(() => {
    return Array.from(bulkOps.selectedIds).some(classId => classHasManualReleaseTiming(classId));
  }, [bulkOps.selectedIds, classHasManualReleaseTiming]);

  // Check if any selected class currently has results released — gates "Hide Results".
  // Also require manual_release timing: clearing results_released_at is a no-op
  // for classes released solely via 'immediate'/'class_complete' timing, so
  // offering "Hide Results" for those would be misleading.
  const hasReleasedClasses = useMemo(() => {
    return showClasses.some(
      cls =>
        bulkOps.selectedIds.has(cls.id) &&
        Boolean(cls.results_released_at) &&
        classHasManualReleaseTiming(cls.id)
    );
  }, [showClasses, bulkOps.selectedIds, classHasManualReleaseTiming]);

  // pb-44/sm:pb-28: extra bottom clearance for the fixed BulkOperationsBar,
  // which wraps to several rows on narrow screens.
  return (
    <div className="container mx-auto py-6 space-y-8 pb-44 sm:pb-28">
      <ShowDeskReturnLink showId={showId} />
      <h1 className="text-3xl font-bold tracking-tight">Results &amp; Check-In</h1>

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
              ? "We couldn't read this show's entries, so we can't tell whether results are ready."
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
            Verify judge signatures on the paper reports before sending.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-11">
              {/* Named for what it does. It is a navigation, not a download --
                  the file lives on Submit Results, and labelling a Link as a
                  file action on the page whose job is telling the truth about
                  results was the wrong place to be loose. */}
              <Link to={`/shows/${showId}/submit-results`}>Go to Submit Results</Link>
            </Button>
            <p className="text-muted-foreground">
              To release results, select classes below and use the sticky{' '}
              <span className="font-medium">Release Results</span> bar.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Query error state */}
      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load results settings</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span>
              There was a problem fetching show data. Check your connection and try again.
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

      {/* Results visibility + self check-in — one hierarchy, two controls per row */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Results &amp; Self Check-In</CardTitle>
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
          ) : isError ? (
            <CardLoadError />
          ) : (
            <div className="space-y-6">
              {/* Show defaults — the cascade root for both facets */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Show defaults</h3>
                <PresetSelector showId={showId} settings={effectiveSettings} />
                <ShowCheckinToggle showId={showId} enabled={effectiveSettings.selfCheckinEnabled} />
              </div>
              {/* Per-trial / per-class overrides — one tree carrying both facets */}
              <OverrideTree
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

      {/* Bulk Operations Bar */}
      <BulkOperationsBar
        showId={showId}
        selectedClasses={bulkOps.selectedIds}
        allClassIds={allClassIds}
        onSelectAll={bulkOps.selectAll}
        onClearSelection={bulkOps.clearSelection}
        onDeselectClasses={deselectClassesByIds}
        hasManualReleaseClasses={hasManualReleaseClasses}
        hasReleasedClasses={hasReleasedClasses}
      />
    </div>
  );
}
