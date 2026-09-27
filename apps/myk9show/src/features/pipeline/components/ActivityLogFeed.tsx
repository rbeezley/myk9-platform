import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRightLeft,
  CheckCircle2,
  Plus,
  Minus,
  UserPlus,
  FileText,
  Settings,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { formatRelativeTime } from '@/utils/format';
import { ListFilterBar } from '@/components/list-toolkit';
import type { ListFilterField } from '@/components/list-toolkit';
import { useActivityLog } from '../hooks/useActivityLog';
import type { ActivityActionType, ActivityLogFilters } from '../types';

const ACTION_TYPE_OPTIONS: { value: ActivityActionType; label: string }[] = [
  { value: 'stage_transition', label: 'Stage changes' },
  { value: 'checklist_completed', label: 'Checklist updates' },
  { value: 'entry_added', label: 'Entry events' },
  { value: 'score_submitted', label: 'Score events' },
  { value: 'config_changed', label: 'Config changes' },
];

const ACTION_ICONS: Record<ActivityActionType, React.ReactNode> = {
  stage_transition: <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />,
  checklist_completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  checklist_uncompleted: <Minus className="h-3.5 w-3.5 text-orange-500" />,
  custom_item_added: <Plus className="h-3.5 w-3.5 text-purple-500" />,
  custom_item_removed: <Minus className="h-3.5 w-3.5 text-red-500" />,
  entry_added: <UserPlus className="h-3.5 w-3.5 text-teal-500" />,
  entry_removed: <Minus className="h-3.5 w-3.5 text-red-500" />,
  score_submitted: <FileText className="h-3.5 w-3.5 text-amber-500" />,
  config_changed: <Settings className="h-3.5 w-3.5 text-gray-500" />,
  note: <MessageSquare className="h-3.5 w-3.5 text-blue-400" />,
};

interface ActivityLogFeedProps {
  trialId: string;
}

export const ActivityLogFeed: React.FC<ActivityLogFeedProps> = ({ trialId }) => {
  const [filters, setFilters] = useState<ActivityLogFilters>({});
  const [search, setSearch] = useState('');
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useActivityLog(
    trialId,
    filters
  );

  const entries = useMemo(() => data?.pages.flatMap(p => p.entries) ?? [], [data?.pages]);

  // Search scans only the entries already loaded on this page — a paginated
  // feed can't search rows it hasn't fetched yet, unlike the action-type
  // filter, which is applied server-side.
  const visibleEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      entry =>
        entry.description.toLowerCase().includes(q) ||
        (entry.actor_name ?? '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  const actionTypeField: ListFilterField = {
    kind: 'options',
    key: 'actionType',
    label: 'Type',
    value: filters.actionType ?? null,
    onChange: value =>
      setFilters(f => ({ ...f, actionType: (value as ActivityActionType | null) ?? undefined })),
    options: ACTION_TYPE_OPTIONS,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity</CardTitle>
        </div>
        <ListFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search activity..."
          fields={[actionTypeField]}
          onClearAll={() => {
            setSearch('');
            setFilters({});
          }}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {entries.length === 0 ? 'No activity yet' : 'No activity matches your search'}
          </p>
        ) : (
          <div className="space-y-3">
            {visibleEntries.map(entry => (
              <div key={entry.id} className="flex items-start gap-2.5">
                <div className="mt-0.5 flex-shrink-0">
                  {ACTION_ICONS[entry.action_type] ?? (
                    <div className="h-3.5 w-3.5 rounded-full bg-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">{entry.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {entry.actor_name && (
                      <span className="text-sm text-muted-foreground font-medium">
                        {entry.actor_name}
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {formatRelativeTime(new Date(entry.created_at))}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Load more
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
