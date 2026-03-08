/**
 * ActivityTimeline — Chronological activity feed for any record (Phase 4.1).
 *
 * Renders a vertical timeline with colored dots, actor info, and timestamps.
 * Supports infinite scroll via "Load older activity" button.
 */

import React, { useMemo } from 'react';
import {
  Trophy,
  PlusCircle,
  Edit,
  Trash2,
  ArrowRightLeft,
  CheckCircle2,
  FileText,
  UserPlus,
  UserMinus,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActivityLogQuery } from '@/hooks/queries/useActivityLogDatabase';
import type { ActivityRecordType } from '@/services/database/queries/activityLogQueries';
import type { ActivityLogEntry } from '@/services/database/queries/activityLogQueries';
import DelightfulLoading from '@/components/ui/DelightfulLoading';

interface ActivityTimelineProps {
  recordType: ActivityRecordType;
  recordId: string;
}

// ── Event styling ──────────────────────────────────────────────────

type EventCategory = 'positive' | 'attention' | 'negative' | 'neutral';

interface EventStyle {
  icon: LucideIcon;
  category: EventCategory;
}

const DOT_COLORS: Record<EventCategory, string> = {
  positive: 'bg-primary',
  attention: 'bg-amber-500',
  negative: 'bg-destructive',
  neutral: 'bg-muted-foreground/30',
};

const ACTION_STYLES: Record<string, EventStyle> = {
  created: { icon: PlusCircle, category: 'positive' },
  updated: { icon: Edit, category: 'neutral' },
  deleted: { icon: Trash2, category: 'negative' },
  status_changed: { icon: ArrowRightLeft, category: 'attention' },
  title_earned: { icon: Trophy, category: 'positive' },
  registration_added: { icon: FileText, category: 'positive' },
  health_record_added: { icon: PlusCircle, category: 'positive' },
  training_session_added: { icon: Activity, category: 'positive' },
  owner_changed: { icon: ArrowRightLeft, category: 'attention' },
  published: { icon: CheckCircle2, category: 'positive' },
  entries_opened: { icon: PlusCircle, category: 'positive' },
  entries_closed: { icon: CheckCircle2, category: 'attention' },
  completed: { icon: CheckCircle2, category: 'positive' },
  role_assigned: { icon: UserPlus, category: 'positive' },
  role_removed: { icon: UserMinus, category: 'negative' },
  qualification_updated: { icon: FileText, category: 'attention' },
  results_finalized: { icon: CheckCircle2, category: 'positive' },
  results_reviewed: { icon: CheckCircle2, category: 'positive' },
  stage_transition: { icon: ArrowRightLeft, category: 'attention' },
  checklist_completed: { icon: CheckCircle2, category: 'positive' },
  checklist_uncompleted: { icon: Edit, category: 'attention' },
  entry_added: { icon: PlusCircle, category: 'positive' },
  entry_removed: { icon: Trash2, category: 'negative' },
  score_submitted: { icon: CheckCircle2, category: 'positive' },
  config_changed: { icon: Edit, category: 'neutral' },
  note: { icon: FileText, category: 'neutral' },
};

const DEFAULT_STYLE: EventStyle = { icon: Activity, category: 'neutral' };

function getEventStyle(actionType: string): EventStyle {
  return ACTION_STYLES[actionType] ?? DEFAULT_STYLE;
}

// ── Timestamp formatting ───────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Timeline Event ─────────────────────────────────────────────────

const TimelineEvent: React.FC<{ entry: ActivityLogEntry }> = ({ entry }) => {
  const { icon: Icon, category } = getEventStyle(entry.action_type);
  const dotColor = DOT_COLORS[category];

  return (
    <article className="flex gap-4 py-3 relative" aria-label={entry.description}>
      {/* Timeline dot */}
      <div
        className={`w-[10px] h-[10px] rounded-full mt-1.5 shrink-0 ring-4 ring-card ${dotColor}`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{entry.description}</span>
          {entry.actor_name && (
            <span className="text-sm text-muted-foreground">by {entry.actor_name}</span>
          )}
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatTimestamp(entry.created_at)}
          </span>
        </div>
      </div>
    </article>
  );
};

// ── Main Component ─────────────────────────────────────────────────

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ recordType, recordId }) => {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivityLogQuery(
    recordType,
    recordId
  );

  const entries = useMemo(() => data?.pages.flatMap(page => page.entries) ?? [], [data]);

  if (isLoading) {
    return <DelightfulLoading message="Loading activity..." />;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">No activity yet</p>
        <p className="text-xs mt-1">Changes to this record will appear here.</p>
      </div>
    );
  }

  return (
    <div role="feed" aria-label="Activity timeline" className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[4px] top-3 bottom-3 w-px bg-border/50" />

      {entries.map(entry => (
        <TimelineEvent key={entry.id} entry={entry} />
      ))}

      {hasNextPage && (
        <div className="pt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading...' : 'Load older activity'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;
