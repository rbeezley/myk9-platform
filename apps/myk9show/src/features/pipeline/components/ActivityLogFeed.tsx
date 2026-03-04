import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useActivityLog } from '../hooks/useActivityLog';
import type { ActivityActionType, ActivityLogFilters } from '../types';

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
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useActivityLog(
    trialId,
    filters
  );

  const entries = useMemo(() => data?.pages.flatMap(p => p.entries) ?? [], [data?.pages]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity</CardTitle>
        </div>
        <Select
          value={filters.actionType ?? 'all'}
          onValueChange={v =>
            setFilters(f => ({
              ...f,
              actionType: v === 'all' ? undefined : (v as ActivityActionType),
            }))
          }
        >
          <SelectTrigger className="h-8 text-sm w-full">
            <SelectValue placeholder="All activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="stage_transition">Stage changes</SelectItem>
            <SelectItem value="checklist_completed">Checklist updates</SelectItem>
            <SelectItem value="entry_added">Entry events</SelectItem>
            <SelectItem value="score_submitted">Score events</SelectItem>
            <SelectItem value="config_changed">Config changes</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No activity yet</p>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
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
