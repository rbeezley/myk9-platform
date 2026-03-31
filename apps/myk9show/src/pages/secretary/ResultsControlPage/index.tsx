/**
 * Results Control Page
 *
 * Standalone secretary page for managing result visibility,
 * self check-in, and releasing results with bulk operations.
 */

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
import { useBulkClassOperations } from '@/hooks/useBulkClassOperations';
import { PresetSelector } from './PresetSelector';
import { TrialOverrides } from './TrialOverrides';
import { ClassOverrides } from './ClassOverrides';
import { BulkOperationsBar } from './BulkOperationsBar';
import { SelfCheckinSection } from './SelfCheckinSection';

export default function ResultsControlPage() {
  const { selectedShowId, shows } = useShowStore();
  const { trials } = useTrialStore();
  const { classes } = useClassStore();
  const bulkOps = useBulkClassOperations();

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const showTrials = trials.filter(t => t.showId === selectedShowId);
  const showClasses = classes.filter(c => showTrials.some(t => t.id === c.trialId));
  const allClassIds = showClasses.map(c => c.id);

  const { data: settings, isLoading: settingsLoading } = useShowSettings(selectedShowId ?? null);
  const { data: trialOverrides = [], isLoading: overridesLoading } = useTrialOverrides(
    selectedShowId ?? null
  );
  const { data: classOverrides = [], isLoading: classOverridesLoading } = useClassOverrides(
    selectedShowId ?? null
  );

  const isLoading = settingsLoading || overridesLoading || classOverridesLoading;

  // Check if any selected class has manual_release timing (for Release Results button)
  const hasManualReleaseClasses = Array.from(bulkOps.selectedClasses).some(classId => {
    const override = classOverrides.find(o => o.classId === classId);
    const trialId = showClasses.find(c => c.id === classId)?.trialId;
    const trialOverride = trialId ? trialOverrides.find(o => o.trialId === trialId) : undefined;

    // Check class override first, then trial, then show
    const preset =
      override?.override.preset ?? trialOverride?.override.preset ?? settings?.visibility.preset;

    return preset === 'review';
  });

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
                selectedClasses={bulkOps.selectedClasses}
                onToggleClass={bulkOps.toggleClass}
                onToggleAllInTrial={bulkOps.toggleAllInTrial}
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
        selectedClasses={bulkOps.selectedClasses}
        allClassIds={allClassIds}
        onSelectAll={() => bulkOps.selectAll(allClassIds)}
        onClearSelection={bulkOps.clearSelection}
        hasManualReleaseClasses={hasManualReleaseClasses}
      />
    </div>
  );
}
