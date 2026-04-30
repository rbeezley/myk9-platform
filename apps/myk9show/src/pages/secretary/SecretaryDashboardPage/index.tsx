import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { useMessageStore } from '@/store/messageStore';
import { useSecretaryTasks } from '@/hooks/queries/useSecretaryTasks';
import { usePendingEntries } from '@/hooks/queries/usePendingEntries';
import { useMissionControlData } from '@/features/pipeline/hooks/useMissionControlData';
import { useMyShows } from '@/hooks/useMyShows';
import type { SecretaryTask } from './types';
import { ScopeType } from '@/types/auth-types';
import { AttentionNeededStrip } from './AttentionNeededStrip';
import { MyShowsSection } from './MyShowsSection';
import { TasksTab } from './TasksTab';
import { MessagesTab } from './MessagesTab';

type Tab = 'tasks' | 'messages';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function SecretaryDashboardPage() {
  const navigate = useNavigate();
  const { firstName, userWithRoles, isAdmin } = useAuthContext();
  const [activeTab, setActiveTab] = useState<Tab>('tasks');

  const { shows: rawShows } = useShowStore();

  // Filter shows to only those the secretary manages (same logic as useMissionControlData)
  const clubScopeKey = useMemo(
    () =>
      (userWithRoles?.scopes ?? [])
        .filter(s => s.scopeType === ScopeType.CLUB)
        .map(s => s.scopeId)
        .sort()
        .join(','),
    [userWithRoles?.scopes]
  );

  const shows = useMemo(() => {
    const clubIdSet = new Set(clubScopeKey ? clubScopeKey.split(',') : []);
    const skipFilter = isAdmin;
    const seen = new Set<string>();
    return rawShows.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return skipFilter || clubIdSet.has(s.clubId);
    });
  }, [rawShows, isAdmin, clubScopeKey]);

  const { today, upcoming, draft, past, attentionNeeded: showAttentionItems } = useMyShows(shows);

  const { data: allTasks = [] } = useSecretaryTasks();
  const openTaskCount = allTasks.filter((t: SecretaryTask) => t.status === 'todo').length;

  const unreadMessageCount = useMessageStore(s => s.unreadCount);

  const { data: pendingEntries = [] } = usePendingEntries();

  const pendingByShow = useMemo(() => {
    const map = new Map<string, { showName: string; count: number }>();
    for (const entry of pendingEntries) {
      const existing = map.get(entry.showId);
      if (existing) {
        existing.count++;
      } else {
        map.set(entry.showId, { showName: entry.showName, count: 1 });
      }
    }
    return map;
  }, [pendingEntries]);

  const attentionNeeded = [
    ...[...pendingByShow.entries()].map(([showId, { showName, count }]) => ({
      showId,
      showName,
      kind: 'info' as const,
      text: `${count} ${count === 1 ? 'entry' : 'entries'} pending review`,
      href: `/secretary/entries/${showId}`,
    })),
    ...showAttentionItems,
  ];

  const { classesByStage } = useMissionControlData();
  const liveClassCount = classesByStage.get('in-progress')?.length ?? 0;
  const notStartedCount = classesByStage.get('not-started')?.length ?? 0;
  const closedCount = classesByStage.get('closed')?.length ?? 0;

  // first show's clubId; used by TasksTab to scope new tasks
  const clubId = shows[0]?.clubId ?? '';

  const tabShows = shows.map(s => ({ id: s.id, name: s.name }));

  const tabs: Array<{ key: Tab; label: string; badge: number }> = [
    { key: 'tasks', label: 'Tasks', badge: openTaskCount },
    { key: 'messages', label: 'Messages', badge: unreadMessageCount },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pb-2 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName ?? 'there'}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Managing {shows.length} {shows.length === 1 ? 'show' : 'shows'}
          </p>
        </div>
        <Button
          size="sm"
          className="mt-1 shrink-0"
          onClick={() => navigate('/secretary/create-show')}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Show
        </Button>
      </div>

      {/* Attention strip */}
      <AttentionNeededStrip items={attentionNeeded} />

      {/* Phase-grouped show sections */}
      <div className="px-5 pb-2">
        {today.length === 0 && upcoming.length === 0 && draft.length === 0 && past.length === 0 && (
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

      {/* Tab Bar */}
      <div className="flex border-b px-5">
        {tabs.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {badge > 0 && (
              <Badge variant="secondary" className="h-4.5 min-w-4 px-1 text-xs">
                {badge}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 px-5 py-4">
        {activeTab === 'tasks' && <TasksTab shows={tabShows} clubId={clubId} />}
        {activeTab === 'messages' && <MessagesTab shows={tabShows} />}
      </div>
    </div>
  );
}
