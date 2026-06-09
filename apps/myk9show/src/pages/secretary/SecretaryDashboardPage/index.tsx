import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { usePendingEntries } from '@/hooks/queries/usePendingEntries';
import { useMissionControlData } from '@/features/pipeline/hooks/useMissionControlData';
import { useMyShows } from '@/hooks/useMyShows';
import {
  emptyAttentionCounts,
  getEntryAttention,
  type AttentionCounts,
} from '@/features/show-map/attention';
import { AttentionNeededStrip } from './AttentionNeededStrip';
import { DashboardQuickLinks } from './DashboardQuickLinks';
import { MyShowsSection, MyShowsSectionSkeleton } from './MyShowsSection';
import { TasksTab } from './TasksTab';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function SecretaryDashboardPage() {
  const { firstName } = useAuthContext();

  const { shows, classesByStage, isLoading: showsLoading } = useMissionControlData();

  const { today, upcoming, draft, past, attentionNeeded: showAttentionItems } = useMyShows(shows);

  const { data: pendingEntries = [] } = usePendingEntries();

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
            counts.pending_review === 1 ? 'entry' : 'entries'
          } pending review`,
          href: `/secretary/shows/${showId}/entry-management?entryTab=pending`,
        });
      }
      return rows;
    }),
    ...showAttentionItems,
  ];

  const liveClassCount = classesByStage.get('in-progress')?.length ?? 0;
  const notStartedCount = classesByStage.get('not-started')?.length ?? 0;
  const closedCount = classesByStage.get('closed')?.length ?? 0;

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

      <DashboardQuickLinks />

      {/* Attention strip */}
      <AttentionNeededStrip items={attentionNeeded} />

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
                Create your first show to get started.
              </p>
            </div>
          )}
        <MyShowsSection
          phase="today"
          title="Happening today"
          subtitle="Check-in is open. Tap to manage rings and results."
          shows={today}
          liveClassCount={liveClassCount}
          notStartedCount={notStartedCount}
          closedCount={closedCount}
        />
        <MyShowsSection
          phase="upcoming"
          title="Upcoming"
          subtitle="Shows that haven't started yet."
          shows={upcoming}
          defaultCollapsed
        />
        <MyShowsSection
          phase="draft"
          title="Draft — not yet published"
          subtitle="Complete setup before exhibitors can enter."
          shows={draft}
          defaultCollapsed
        />
        <MyShowsSection phase="past" title="Past shows" shows={past} defaultCollapsed />
      </div>

      {/* Personal tasks — per-show tasks live in each show's Tools sheet. */}
      <div className="flex-1 border-t px-5 py-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Personal tasks
        </h2>
        <TasksTab clubId={clubId} />
      </div>
    </div>
  );
}
