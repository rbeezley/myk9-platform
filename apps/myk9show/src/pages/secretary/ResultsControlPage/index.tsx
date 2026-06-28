/**
 * Results Control Page
 *
 * Standalone secretary page for managing result visibility,
 * self check-in, and releasing results with bulk operations.
 */

import { useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Eye, UserCheck, AlertCircle } from 'lucide-react';
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
import { TrialOverrides } from './TrialOverrides';
import { ClassOverrides } from './ClassOverrides';
import { BulkOperationsBar } from './BulkOperationsBar';
import { SelfCheckinSection } from './SelfCheckinSection';

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
  const { classes } = useClassStore();

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

  // Check if any selected class uses manual_release timing on any field
  const hasManualReleaseClasses = useMemo(() => {
    if (!settings) return false;

    return Array.from(bulkOps.selectedIds).some(classId => {
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
    });
  }, [bulkOps.selectedIds, classOverrideMap, trialOverrideMap, classTrialMap, settings]);

  // pb-44/sm:pb-28: extra bottom clearance for the fixed BulkOperationsBar,
  // which wraps to several rows on narrow screens.
  return (
    <div className="container mx-auto py-6 space-y-8 pb-44 sm:pb-28">
      <h1 className="text-3xl font-bold tracking-tight">Results Control</h1>

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
              className="self-start sm:self-auto shrink-0"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Results Visibility */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Results Visibility</CardTitle>
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
              <PresetSelector showId={showId} settings={effectiveSettings} />
              <TrialOverrides
                showId={showId}
                settings={effectiveSettings}
                trials={showTrials}
                trialOverrides={trialOverrides}
              />
              <ClassOverrides
                showId={showId}
                settings={effectiveSettings}
                trials={showTrials}
                classes={showClasses}
                classOverrides={classOverrides}
                trialOverrides={trialOverrides}
                selectedClasses={bulkOps.selectedIds}
                onToggleClass={toggleClassById}
                onToggleAllInTrial={toggleAllInTrial}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Self Check-In */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Self Check-In</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isError ? (
            <CardLoadError />
          ) : (
            <SelfCheckinSection
              showId={showId}
              settings={effectiveSettings}
              trialOverrides={trialOverrides}
              classOverrides={classOverrides}
              trials={showTrials}
              classes={showClasses}
            />
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
      />
    </div>
  );
}
