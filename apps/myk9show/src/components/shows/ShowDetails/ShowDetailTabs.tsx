import React, { Suspense } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';
import { TrialsTab, type TrialStats } from '@/components/shows/tabs/TrialsTab';
import { ClassesTab, type ClassInfo } from '@/components/shows/tabs/ClassesTab';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';
import { EntriesTab } from '@/components/shows/ShowDetails/EntriesTab';
import { ShowResultsTab } from '@/components/results/ShowResultsTab';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type {
  ShowMapTrialInput,
  ShowMapClassInput,
  ShowMapEntryInput,
} from '@/features/show-map/showMapTypes';

const ShowMapTab = React.lazy(() => import('@/features/show-map/ShowMapTab'));

export interface ShowDetailTabsProps {
  show: Show;
  /** Tab definitions (computed by the router; encodes which tabs this audience sees). */
  tabs: PrimaryTabDef[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  canManageShow: boolean;
  canShowMap: boolean;
  isAuthenticated: boolean;
  hasUserEntries: boolean;
  judges: ShowJudgeAssignment[];
  /** Effective classes — store-derived when warm, anon public reshape when cold. */
  classes: ClassInfo[];
  /** Effective trials — store rows when warm, anon public rows when cold. */
  trials: Trial[];
  trialStats: Record<string, TrialStats>;
  // Show Map renders from the raw store-derived data (managers only), distinct
  // from the effective/cold-fallback data the other tabs use.
  mapTrials: ShowMapTrialInput[];
  mapClasses: ShowMapClassInput[];
  mapEntries: ShowMapEntryInput[];
}

/**
 * The tabbed body shared by the exhibitor and management surfaces. Which tabs
 * appear is governed entirely by `tabs` + the role flags, exactly as before —
 * the management surface passes `canShowMap`/`canManageShow` true to light up the
 * Show Map and manager Entries tab; the exhibitor surface does not.
 */
export function ShowDetailTabs({
  show,
  tabs,
  activeTab,
  onTabChange,
  canManageShow,
  canShowMap,
  isAuthenticated,
  hasUserEntries,
  judges,
  classes,
  trials,
  trialStats,
  mapTrials,
  mapClasses,
  mapEntries,
}: ShowDetailTabsProps) {
  return (
    <PrimaryTabs tabs={tabs} value={activeTab} onValueChange={onTabChange}>
      <TabsContent value="overview">
        <ShowOverviewTab
          show={show}
          canManageShow={canManageShow}
          judges={judges}
          classes={classes}
          onViewClasses={() => onTabChange('classes')}
        />
      </TabsContent>

      <TabsContent value="trials">
        <TrialsTab trials={trials} showId={show.id} trialStats={trialStats} />
      </TabsContent>

      <TabsContent value="classes">
        <ClassesTab
          classes={classes}
          showId={show.id}
          userHasEntries={hasUserEntries}
          hideRing={trials.some(
            t =>
              t.trialType === 'Scent Work' ||
              t.trialType === 'Nosework' ||
              t.trialType === 'Scent Detection'
          )}
        />
      </TabsContent>

      {isAuthenticated && (
        <TabsContent value="my-entries">
          {canManageShow ? (
            <EntriesTab showId={show.id} />
          ) : (
            <MyEntriesTab showId={show.id} />
          )}
        </TabsContent>
      )}

      <TabsContent value="results">
        <ShowResultsTab showId={show.id} />
      </TabsContent>

      {canShowMap && (
        <TabsContent value="map">
          <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
            <ShowMapTab
              show={show}
              trials={mapTrials}
              classes={mapClasses}
              entries={mapEntries}
              canManageShow={false}
            />
          </Suspense>
        </TabsContent>
      )}
    </PrimaryTabs>
  );
}
