import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { usePendingEntries } from '@/hooks/queries/usePendingEntries';
import { useMissionControlData } from '@/features/pipeline/hooks/useMissionControlData';
import { useMyShows } from '@/hooks/useMyShows';
import { useShowEntryCounts } from '@/hooks/queries/useShowEntryCounts';
import { useTrialStore } from '@/store/trialStore';
import {
  emptyAttentionCounts,
  getEntryAttention,
  type AttentionCounts,
} from '@/features/show-map/attention';
import { AttentionNeededStrip } from './AttentionNeededStrip';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { MyShowsSection, MyShowsSectionSkeleton } from './MyShowsSection';
import { TasksTab } from './TasksTab';
import { getTodayClassCounts } from './todayClassCounts';
import type { ShowPin } from './ShowPinButton';
import { useCurrentShow } from '@/components/layout/sidebar/useCurrentShow';
import { useCurrentShowPinStore } from '@/components/layout/sidebar/currentShowPinStore';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function SecretaryDashboardPage() {
  const { firstName } = useAuthContext();
  // The rail's current show, overridden only by a pin here (MYK9-1490). Only shows still in
  // Managing can be pinned: an ended show's pin is ignored anyway.
  const { managingShows, pinnedShowId } = useCurrentShow();
  const pin = useCurrentShowPinStore(state => state.pin);
  const unpin = useCurrentShowPinStore(state => state.unpin);
  const pinFor = useMemo(() => {
    const pinnable = new Set(managingShows.map(show => show.id));
    return (showId: string): ShowPin | undefined =>
      pinnable.has(showId)
        ? {
            pinned: pinnedShowId === showId,
            onToggle: () => (pinnedShowId === showId ? unpin() : pin(showId)),
          }
        : undefined;
  }, [managingShows, pinnedShowId, pin, unpin]);

  const { shows, isLoading: showsLoading } = useMissionControlData();

  const { today, upcoming, draft, past, attentionNeeded: showAttentionItems } = useMyShows(shows);

  const { data: pendingEntries = [], isError: pendingEntriesError } = usePendingEntries();

  const attentionByShow = useMemo(() => {
    const map = new Map<string, { showName: string; counts: AttentionCounts }>();
    const managedShowIds = new Set(shows.map(show => show.id));
    for (const entry of pendingEntries) {
      if (!managedShowIds.has(entry.showId)) continue;
      let bucket = map.get(entry.showId);
      if (!bucket) {
        bucket = { showName: entry.showName, counts: emptyAttentionCounts() };
        map.set(entry.showId, bucket);
      }
      const reason = getEntryAttention(entry);
      if (reason) {
        bucket.counts[reason]++;
        bucket.counts.total++;
      }
    }
    return map;
  }, [pendingEntries, shows]);

  const attentionNeeded = [
    ...[...attentionByShow.entries()].flatMap(([showId, { showName, counts }]) => {
      const rows: Array<{
        showId: string;
        showName: string;
        kind: 'info' | 'urgent';
        text: string;
        href: string;
      }> = [];
      if (counts.pending_review > 0) {
        rows.push({
          showId,
          showName,
          kind: 'info',
          text: `${counts.pending_review} ${
            counts.pending_review === 1 ? 'pending entry' : 'pending entries'
          }`,
          href: getEntryManagementHref({ showId, attention: 'pending', mode: 'review' }),
        });
      }
      return rows;
    }),
    ...showAttentionItems,
  ];

  const allTrials = useTrialStore(s => s.trials);
  const allTrialClasses = useTrialStore(s => s.trialClasses);
  const classCountsByShow = useMemo(
    () => new Map(today.map(s => [s.id, getTodayClassCounts(s.id, allTrials, allTrialClasses)])),
    [today, allTrials, allTrialClasses]
  );

  // Online-only live entry counts (MYK9-1311); a show with no answer shows no count.
  const allShowIds = useMemo(
    () => [...today, ...upcoming, ...draft, ...past].map(s => s.id),
    [today, upcoming, draft, past]
  );
  const entryCountsByShow = useShowEntryCounts(allShowIds);

  // first show's clubId; used by TasksTab to scope new tasks
  const clubId = shows[0]?.clubId ?? '';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="px-5 pb-2 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName ?? 'there'}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {showsLoading && shows.length === 0
              ? 'Loading shows...'
              : `Managing ${shows.length} ${shows.length === 1 ? 'show' : 'shows'}`}
          </p>
        </div>
      </div>

      {/* Attention strip */}
      <AttentionNeededStrip items={attentionNeeded} countFailed={pendingEntriesError} />

      {/* Phase-grouped show sections */}
      <div className="px-5 pb-2">
        {showsLoading && shows.length === 0 && <MyShowsSectionSkeleton />}
        {!showsLoading &&
          today.length === 0 &&
          upcoming.length === 0 &&
          draft.length === 0 &&
          past.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No shows yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add your first show to get started.
              </p>
              <Button asChild className="mt-4 min-h-11">
                <Link to="/secretary/create-show/wizard">Add your first show</Link>
              </Button>
            </div>
          )}
        <MyShowsSection
          phase="today"
          title="Happening today"
          subtitle="Check-in is open. Tap to manage rings and results."
          shows={today}
          classCountsByShow={classCountsByShow}
          entryCountsByShow={entryCountsByShow}
          pinFor={pinFor}
        />
        <MyShowsSection
          phase="upcoming"
          title="Upcoming"
          subtitle="Shows that haven't started yet."
          shows={upcoming}
          defaultCollapsed
          entryCountsByShow={entryCountsByShow}
          pinFor={pinFor}
        />
        <MyShowsSection
          phase="draft"
          title="Draft — not yet published"
          subtitle="Complete setup before exhibitors can enter."
          shows={draft}
          defaultCollapsed
          entryCountsByShow={entryCountsByShow}
          pinFor={pinFor}
        />
        <MyShowsSection
          phase="past"
          title="Past shows"
          shows={past}
          defaultCollapsed
          entryCountsByShow={entryCountsByShow}
        />
      </div>

      {/* Personal tasks; per-show tasks live in each show's Tasks and notes tool. */}
      <div className="flex-1 border-t px-5 py-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Personal tasks
        </h2>
        <TasksTab clubId={clubId} />
      </div>
    </div>
  );
}
