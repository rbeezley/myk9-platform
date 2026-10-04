import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';
import { TrialsTab, type TrialStats } from '@/components/shows/tabs/TrialsTab';
import { ClassesTab, type ClassInfo } from '@/components/shows/tabs/ClassesTab';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';
import { EntryDataUnavailablePanel } from '@/components/shows/ShowDetails/EntryDataUnavailablePanel';
import { ShowResultsTab } from '@/components/results/ShowResultsTab';
import type { Show } from '@/types/show-types';
import { isScentTrialType } from '@/types/template.types';

import type { Trial } from '@/components/trials/types/trial.types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type {
  SubmittedEntryDbRow,
  SubmittedEntryReadState,
} from '@/features/exhibitor-entry/submittedEntryProjection';

export interface ShowDetailTabsProps {
  show: Show;
  /** Tab definitions (computed by the router; encodes which tabs this audience sees). */
  tabs: PrimaryTabDef[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  canManageShow: boolean;
  isAuthenticated: boolean;
  hasUserEntries: boolean;
  judges: ShowJudgeAssignment[];
  /** Effective classes — store-derived when warm, anon public reshape when cold. */
  classes: ClassInfo[];
  /** Effective trials — store rows when warm, anon public rows when cold. */
  trials: Trial[];
  trialStats: Record<string, TrialStats>;
  entryDataState?: 'ready' | 'loading' | 'error';
  onRetryEntryData?: (() => void) | undefined;
  exhibitorEntryRows?: readonly SubmittedEntryDbRow[];
  exhibitorEntryDataState?: SubmittedEntryReadState;
}

/**
 * The `?tab=` body for the PUBLIC and EXHIBITOR surfaces.
 *
 * A MANAGER never renders this: since MYK9-630 phase 2 their show page is one
 * row of six tabs, each a real route, rendered by `ShowManagementShell`, and
 * phase 3 put club admins on that same surface. So the manager-only Entries and
 * Show Map panels that used to live here are gone — Entries IS Entry Management
 * now (AC3: the stub tab and its private `getEntriesByShow` read are deleted),
 * and the manager Show Map is gone from this strip (MYK9-957 deleted Setup).
 */
export function ShowDetailTabs({
  show,
  tabs,
  activeTab,
  onTabChange,
  canManageShow,
  isAuthenticated,
  hasUserEntries,
  judges,
  classes,
  trials,
  trialStats,
  entryDataState = 'ready',
  onRetryEntryData,
  exhibitorEntryRows,
  exhibitorEntryDataState = 'ready',
}: ShowDetailTabsProps) {
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
            hideRing={trials.some(t => isScentTrialType(t.trialType))}
          />
        )}
      </TabsContent>

      {isAuthenticated && (
        <TabsContent value="my-entries">
          <MyEntriesTab
            showId={show.id}
            canonicalEntries={exhibitorEntryRows}
            entryDataState={exhibitorEntryDataState}
          />
        </TabsContent>
      )}

      <TabsContent value="results">
        <ShowResultsTab showId={show.id} />
      </TabsContent>
    </PrimaryTabs>
  );
}
