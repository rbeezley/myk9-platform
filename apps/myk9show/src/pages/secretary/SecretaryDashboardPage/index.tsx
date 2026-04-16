import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isToday } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { useMessageStore } from '@/store/messageStore';
import { useSecretaryTasks } from '@/hooks/queries/useSecretaryTasks';
import { usePendingEntries } from '@/hooks/queries/usePendingEntries';
import { useMissionControlData } from '@/features/pipeline/hooks/useMissionControlData';
import type { SecretaryTask } from './types';
import { ScopeType } from '@/types/auth-types';
import { TodayHero } from './TodayHero';
import { UpcomingShowsStrip } from './UpcomingShowsStrip';
import { TasksTab } from './TasksTab';
import { MessagesTab } from './MessagesTab';
import { EntriesTab } from './EntriesTab';

type Tab = 'tasks' | 'messages' | 'entries';

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

  // Separate today's show from upcoming shows
  const todayShow = useMemo(() => shows.find(s => isToday(new Date(s.startDate))) ?? null, [shows]);

  const upcomingShows = useMemo(
    () => shows.filter(s => !isToday(new Date(s.startDate)) && new Date(s.startDate) > new Date()),
    [shows]
  );

  // Badge counts
  const { data: allTasks = [] } = useSecretaryTasks();
  const openTaskCount = allTasks.filter((t: SecretaryTask) => t.status === 'todo').length;

  const unreadMessageCount = useMessageStore(s => s.unreadCount);

  const { data: pendingEntries = [] } = usePendingEntries();
  const pendingEntryCount = pendingEntries.length;

  // Pipeline class counts for TodayHero
  const { classesByStage } = useMissionControlData();
  const liveClassCount = classesByStage.get('in-progress')?.length ?? 0;
  const notStartedCount = classesByStage.get('not-started')?.length ?? 0;
  const closedCount = classesByStage.get('closed')?.length ?? 0;

  // clubId for TasksTab — derive from first show's clubId
  const clubId = shows[0]?.clubId ?? '';

  const tabShows = shows.map(s => ({ id: s.id, name: s.name }));

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
          onClick={() => navigate('/secretary/shows/new')}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Show
        </Button>
      </div>

      {/* Today Hero */}
      <TodayHero
        todayShow={todayShow}
        nextShow={upcomingShows[0] ?? null}
        liveClassCount={liveClassCount}
        notStartedCount={notStartedCount}
        closedCount={closedCount}
      />

      {/* Upcoming Shows Strip */}
      <UpcomingShowsStrip shows={upcomingShows} />

      {/* Tab Bar */}
      <div className="flex border-b px-5">
        {(
          [
            { key: 'tasks', label: 'Tasks', badge: openTaskCount },
            { key: 'messages', label: 'Messages', badge: unreadMessageCount },
            { key: 'entries', label: 'Entries', badge: pendingEntryCount },
          ] as { key: Tab; label: string; badge: number }[]
        ).map(({ key, label, badge }) => (
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
        {activeTab === 'entries' && <EntriesTab shows={tabShows} />}
      </div>
    </div>
  );
}
