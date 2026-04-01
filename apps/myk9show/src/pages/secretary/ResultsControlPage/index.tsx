/**
 * Results Control Page
 *
 * Standalone secretary page for managing result visibility,
 * self check-in, and releasing results with bulk operations.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, UserCheck, Settings } from 'lucide-react';
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

export default function ResultsControlPage() {
  const { selectedShowId, shows } = useShowStore();
  const { trials } = useTrialStore();
  const { classes } = useClassStore();

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

  const getClassId = useCallback((c: (typeof showClasses)[number]) => c.id, []);
  const bulkOps = useBulkSelection({ items: showClasses, getItemId: getClassId });

  useEffect(() => {
    bulkOps.clearSelection();
  }, [selectedShowId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only on show change

  const allClassIds = useMemo(() => showClasses.map(c => c.id), [showClasses]);

  const { data: settings, isLoading: settingsLoading } = useShowSettings(selectedShowId ?? null);
  const { data: trialOverrides = [], isLoading: overridesLoading } = useTrialOverrides(
    selectedShowId ?? null
  );
  const { data: classOverrides = [], isLoading: classOverridesLoading } = useClassOverrides(
    selectedShowId ?? null
  );

  const isLoading = settingsLoading || overridesLoading || classOverridesLoading;

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
    (_trialId: string, classIds: string[]) => {
      const trialClasses = showClasses.filter(c => classIds.includes(c.id));
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
    return Array.from(bulkOps.selectedIds).some(classId => {
      const classOverride = classOverrides.find(o => o.classId === classId);
      const trialId = showClasses.find(c => c.id === classId)?.trialId;
      const trialOverride = trialId ? trialOverrides.find(o => o.trialId === trialId) : undefined;

      // Check effective timing for each field through the cascade
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
