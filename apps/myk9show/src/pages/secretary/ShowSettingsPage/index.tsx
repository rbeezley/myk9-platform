/**
 * Show Settings Page
 *
 * Secretary page for configuring results visibility and self check-in settings,
 * with per-trial override controls.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, UserCheck, Settings } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useShowSettings, useTrialOverrides } from '@/hooks/queries/useShowSettingsDatabase';
import { ResultsVisibilitySection } from './ResultsVisibilitySection';
import { SelfCheckinSection } from './SelfCheckinSection';

export default function ShowSettingsPage() {
  const { selectedShowId, shows } = useShowStore();
  const { trials } = useTrialStore();

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const showTrials = trials.filter(t => t.showId === selectedShowId);

  const { data: settings, isLoading: settingsLoading } = useShowSettings(selectedShowId || null);
  const { data: trialOverrides = [], isLoading: overridesLoading } = useTrialOverrides(
    selectedShowId || null
  );

  const isLoading = settingsLoading || overridesLoading;

  if (!selectedShowId) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Settings className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Select a show to configure its settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Show Settings</h1>
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
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <ResultsVisibilitySection
              showId={selectedShowId}
              settings={settings}
              trialOverrides={trialOverrides}
              trials={showTrials}
            />
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
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <SelfCheckinSection
              showId={selectedShowId}
              settings={settings}
              trialOverrides={trialOverrides}
              trials={showTrials}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
