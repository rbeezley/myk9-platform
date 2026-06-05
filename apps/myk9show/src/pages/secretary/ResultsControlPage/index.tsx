/**
 * Results Control Page
 *
 * Standalone secretary page for managing result visibility,
 * self check-in, and releasing results with bulk operations.
 */

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Eye, UserCheck, Settings, AlertCircle } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import {
  useShowSettings,
  useTrialOverrides,
  useClassOverrides,
} from '@/hooks/queries/useShowSettingsDatabase';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { PresetSelector } from './PresetSelector';
import { TrialOverrides } from './TrialOverrides';
import { ClassOverrides } from './ClassOverrides';
import { BulkOperationsBar } from './BulkOperationsBar';
import { SelfCheckinSection } from './SelfCheckinSection';

const getClassId = (c: { id: string }) => c.id;

export default function ResultsControlPage() {
  const { selectedShowId, shows, selectShow } = useShowStore();
  const { trials } = useTrialStore();
  const { classes } = useClassStore();
  const [searchParams] = useSearchParams();
  const [initialRouteShowId] = useState(() => searchParams.get('showId')?.trim() || undefined);
  const hasAppliedInitialShowRef = useRef(false);

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const showTrials = useMemo(
    () => trials.filter(t => t.showId === selectedShowId),
    [trials, selectedShowId]
  );
  const showTrialIds = useMemo(() => new Set(showTrials.map(t => t.id)), [showTrials]);
  const showClasses = useMemo(
    () => classes.filter(c => showTrialIds.has(c.trialId)),
    [classes, showTrialIds]
  );

  const bulkOps = useBulkSelection({ items: showClasses, getItemId: getClassId });

  // Honor show-scoped workbench links once, then let later show changes stand.
  useEffect(() => {
    if (!hasAppliedInitialShowRef.current) {
      const initialShowExists = Boolean(
        initialRouteShowId && shows.some(show => show.id === initialRouteShowId)
      );

      if (initialRouteShowId && initialShowExists) {
        hasAppliedInitialShowRef.current = true;
        if (initialRouteShowId !== selectedShowId) {
          selectShow(initialRouteShowId);
        }
        return;
      }

      if (!initialRouteShowId || shows.length > 0) {
        hasAppliedInitialShowRef.current = true;
        if (!selectedShowId && shows.length > 0) {
          selectShow(shows[0].id);
        }
        return;
      }
    }

    if (!selectedShowId && shows.length > 0) {
      selectShow(shows[0].id);
    }
  }, [initialRouteShowId, selectedShowId, shows, selectShow]);

  useEffect(() => {
    bulkOps.clearSelection();
  }, [selectedShowId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only on show change

  const allClassIds = useMemo(() => showClasses.map(c => c.id), [showClasses]);

  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch: refetchSettings,
  } = useShowSettings(selectedShowId ?? null);
  const {
    data: trialOverrides = [],
    isLoading: overridesLoading,
    isError: trialOverridesError,
    refetch: refetchTrialOverrides,
  } = useTrialOverrides(selectedShowId ?? null);
  const {
    data: classOverrides = [],
    isLoading: classOverridesLoading,
    isError: classOverridesError,
    refetch: refetchClassOverrides,
  } = useClassOverrides(selectedShowId ?? null);

  const isLoading = settingsLoading || overridesLoading || classOverridesLoading;
  const isError = settingsError || trialOverridesError || classOverridesError;

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

  // Check if any selected class uses manual_release timing on any field
  const hasManualReleaseClasses = useMemo(() => {
    if (!settings) return false;
    const classOverrideMap = new Map(classOverrides.map(o => [o.classId, o]));
    const trialOverrideMap = new Map(trialOverrides.map(o => [o.trialId, o]));
    const classTrialMap = new Map(showClasses.map(c => [c.id, c.trialId]));

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
  }, [bulkOps.selectedIds, classOverrides, trialOverrides, showClasses, settings]);

  if (!selectedShowId) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Settings className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Select a show to manage results.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-8 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Results Control</h1>
        {selectedShow && <p className="text-muted-foreground">{selectedShow.name}</p>}
      </div>

      {/* Query error state */}
      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load results settings</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              There was a problem fetching show data. Check your connection and try again.
            </span>
            <Button variant="outline" size="sm" onClick={retryAll}>
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
          {isLoading || !settings ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <PresetSelector showId={selectedShowId} settings={settings} />
              <TrialOverrides
                showId={selectedShowId}
                trials={showTrials}
                trialOverrides={trialOverrides}
              />
              <ClassOverrides
                showId={selectedShowId}
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
          {isLoading || !settings ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <SelfCheckinSection
              showId={selectedShowId}
              settings={settings}
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
        showId={selectedShowId}
        selectedClasses={bulkOps.selectedIds}
        allClassIds={allClassIds}
        onSelectAll={bulkOps.selectAll}
        onClearSelection={bulkOps.clearSelection}
        hasManualReleaseClasses={hasManualReleaseClasses}
      />
    </div>
  );
}
