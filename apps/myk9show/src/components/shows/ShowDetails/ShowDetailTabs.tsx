import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { Button } from '@/components/ui/button';
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
import type {
  SubmittedEntryDbRow,
  SubmittedEntryReadState,
} from '@/features/exhibitor-entry/submittedEntryProjection';

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
  entryDataState?: 'ready' | 'loading' | 'error';
  onRetryEntryData?: (() => void) | undefined;
  exhibitorEntryRows?: readonly SubmittedEntryDbRow[];
  exhibitorEntryDataState?: SubmittedEntryReadState;
}

function EntryDataUnavailablePanel({
  state,
  onRetry,
}: {
  state: 'loading' | 'error';
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-6 text-sm">
      <div className="font-medium text-foreground">
        {state === 'loading' ? 'Entry counts are loading.' : "Couldn't load entry counts."}
      </div>
      <p className="mt-1 text-muted-foreground">
        Entry-derived counts and Show Map are paused so this page does not show a false zero-entry
        state.
      </p>
      {state === 'error' && onRetry && (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
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
  entryDataState = 'ready',
  onRetryEntryData,
  exhibitorEntryRows,
  exhibitorEntryDataState = 'ready',
}: ShowDetailTabsProps) {
  const navigate = useNavigate();
  const managerEntryDataUnavailable = canManageShow && entryDataState !== 'ready';

  return (
    <PrimaryTabs tabs={tabs} value={activeTab} onValueChange={onTabChange}>
      <TabsContent value="overview">
        <ShowOverviewTab
          show={show}
          isAuthenticated={isAuthenticated}
          canManageShow={canManageShow}
          judges={judges}
          classes={classes}
          onViewClasses={() => onTabChange('classes')}
        />
      </TabsContent>

      <TabsContent value="trials">
        {managerEntryDataUnavailable ? (
          <EntryDataUnavailablePanel state={entryDataState} onRetry={onRetryEntryData} />
        ) : (
          <TrialsTab trials={trials} showId={show.id} trialStats={trialStats} />
        )}
      </TabsContent>

      <TabsContent value="classes">
        {managerEntryDataUnavailable ? (
          <EntryDataUnavailablePanel state={entryDataState} onRetry={onRetryEntryData} />
        ) : (
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
        )}
      </TabsContent>

      {isAuthenticated && (
        <TabsContent value="my-entries">
          {canManageShow ? (
            <EntriesTab
              showId={show.id}
              onManageEntries={() => navigate(`/shows/${show.id}/entry-management`)}
            />
          ) : (
            <MyEntriesTab
              showId={show.id}
              canonicalEntries={exhibitorEntryRows}
              entryDataState={exhibitorEntryDataState}
            />
          )}
        </TabsContent>
      )}

      <TabsContent value="results">
        <ShowResultsTab showId={show.id} />
      </TabsContent>

      {canShowMap && (
        <TabsContent value="map">
          {managerEntryDataUnavailable ? (
            <EntryDataUnavailablePanel state={entryDataState} onRetry={onRetryEntryData} />
          ) : (
            <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
              <ShowMapTab
                show={show}
                trials={mapTrials}
                classes={mapClasses}
                entries={mapEntries}
                // Forward the caller's permission instead of hardcoding false.
                // `ShowMapTab` gates its whole row-action layer on this
                // (`reorderMode={canManageShow ? ... : undefined}`, and
                // `ShowMapRowActionsMenu` carries Move up, Pull / no-show, Mark
                // checked in and Edit score). This is the ONLY mount of
                // `ShowMapTab` in the app, so hardcoding false made run order and
                // move-up unreachable for everyone -- contradicting the comment
                // above, which already says the management surface passes it true.
                // The exhibitor surface passes false and is unaffected.
                canManageShow={canManageShow}
              />
            </Suspense>
          )}
        </TabsContent>
      )}
    </PrimaryTabs>
  );
}
