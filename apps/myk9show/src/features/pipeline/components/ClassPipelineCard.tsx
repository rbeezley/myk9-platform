/**
 * ClassPipelineCard — Class card for the Mission Control pipeline.
 *
 * Renders a compact card inspired by the myK9Q ClassCard:
 * left accent border, status badge, judge name, progress bar, and scored count.
 * Clicking navigates to the secretary class dashboard.
 */

import { useNavigate } from 'react-router-dom';
import { notifications } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { Circle, Settings, Play, CheckCircle, Lock, Printer } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useUpdateClassMutation } from '@/hooks/queries/useClassesDatabase';
import type { UsePipelinePrintReturn } from '../print/usePipelinePrint';
import type { ClassPipelineItem } from '../mission-control-types';

interface ClassPipelineCardProps {
  item: ClassPipelineItem;
  showId: string;
  trialId: string;
  print: UsePipelinePrintReturn;
}

// Two result sub-states: 'results' (done, needs review) and
// 'results-reviewed' (reviewed, ready to publish). The stage is still
// 'results' — the card checks is_results_reviewed for visual distinction.
const STAGE_STYLE: Record<
  string,
  { accent: string; badgeBg: string; badgeText: string; icon: React.ElementType; label: string }
> = {
  'not-started': {
    accent: 'bg-muted-foreground/40',
    badgeBg: 'bg-muted',
    badgeText: 'text-muted-foreground',
    icon: Circle,
    label: 'No Status',
  },
  setup: {
    accent: 'bg-yellow-500',
    badgeBg: 'bg-yellow-500/15',
    badgeText: 'text-yellow-500',
    icon: Settings,
    label: 'Setup',
  },
  'in-progress': {
    accent: 'bg-green-500',
    badgeBg: 'bg-green-500/15',
    badgeText: 'text-green-500',
    icon: Play,
    label: 'Active',
  },
  results: {
    accent: 'bg-primary',
    badgeBg: 'bg-primary/15',
    badgeText: 'text-primary',
    icon: CheckCircle,
    label: 'Done',
  },
  'results-reviewed': {
    accent: 'bg-green-500',
    badgeBg: 'bg-green-500/15',
    badgeText: 'text-green-500',
    icon: CheckCircle,
    label: 'Reviewed',
  },
  closed: {
    accent: 'bg-muted-foreground/50',
    badgeBg: 'bg-muted',
    badgeText: 'text-muted-foreground',
    icon: Lock,
    label: 'Published',
  },
};

export const ClassPipelineCard: React.FC<ClassPipelineCardProps> = ({
  item,
  showId,
  trialId,
  print,
}) => {
  const navigate = useNavigate();
  const updateClass = useUpdateClassMutation();
  const isMutating = updateClass.isPending;
  const { isPrinting, printRunOrder, printScoreSheet, printResults } = print;

  // Resolve style key: results cards distinguish Done vs Reviewed
  const styleKey =
    item.stage === 'results' && item.is_results_reviewed ? 'results-reviewed' : item.stage;
  const style = STAGE_STYLE[styleKey] ?? STAGE_STYLE['not-started'];
  const Icon = style.icon;
  const progress =
    item.total_entries > 0 ? Math.round((item.scored_count / item.total_entries) * 100) : 0;
  const isClosed = item.stage === 'closed';
  const isResults = item.stage === 'results';

  const handleReview = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateClass.mutate(
      { id: item.id, updates: { is_results_reviewed: true } },
      {
        onSuccess: () => notifications.success(`${item.name} marked as reviewed`),
        onError: () => notifications.error(`Failed to mark ${item.name} as reviewed`),
      }
    );
  };

  const handlePublish = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateClass.mutate(
      { id: item.id, updates: { is_scoring_finalized: true } },
      {
        onSuccess: () => notifications.success(`${item.name} results published`),
        onError: () => notifications.error(`Failed to publish ${item.name} results`),
      }
    );
  };

  const handleReopen = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateClass.mutate(
      { id: item.id, updates: { is_scoring_finalized: false, is_results_reviewed: false } },
      {
        onSuccess: () => notifications.success(`${item.name} reopened for review`),
        onError: () => notifications.error(`Failed to reopen ${item.name}`),
      }
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/shows/${showId}/trials/${trialId}/classes/${item.id}/secretary`)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/shows/${showId}/trials/${trialId}/classes/${item.id}/secretary`);
        }
      }}
      className={cn(
        'relative w-full text-left rounded-lg border border-border/60 bg-card overflow-hidden',
        'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        isClosed && 'opacity-60'
      )}
    >
      {/* Left accent bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', style.accent)} />

      {/* Status badge (top-right) */}
      <div
        className={cn(
          'absolute top-0 right-0 flex items-center gap-1 px-2.5 py-1 text-sm font-semibold rounded-bl-lg',
          style.badgeBg,
          style.badgeText
        )}
      >
        <Icon className="h-3 w-3" />
        {style.label}
      </div>

      {/* Card body */}
      <div className="p-4 pl-5 pt-5 space-y-2">
        {/* Class name */}
        <div className="font-semibold text-sm pr-20 leading-tight">{item.name}</div>

        {/* Judge */}
        {item.judge_name && (
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <svg
              className="h-3 w-3 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            Judge: {item.judge_name}
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', style.accent)}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Scored summary */}
        <div className="text-sm text-muted-foreground">
          {item.scored_count}/{item.total_entries} scored
          {isClosed && ' \u2022 Results published'}
        </div>

        {/* Action row: print dropdown + stage-specific buttons */}
        <div className="flex items-center gap-2 pt-0.5">
          {/* Print dropdown — visible on all stages when entries exist */}
          {item.total_entries > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isPrinting}
                  onClick={e => e.stopPropagation()}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors disabled:opacity-50"
                  aria-label="Print reports"
                >
                  <Printer className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => printRunOrder(item)}>
                  Run Order / Check-In
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => printScoreSheet(item)}>
                  Blank Score Sheet
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={item.stage !== 'results' && item.stage !== 'closed'}
                  onClick={() => printResults(item)}
                >
                  Results Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Action buttons for Results stage cards */}
          {isResults &&
            (item.is_results_reviewed ? (
              <button
                type="button"
                disabled={isMutating}
                onClick={handlePublish}
                className="px-4 py-2.5 text-sm bg-green-500/15 text-green-400 rounded-md hover:bg-green-500/25 font-medium disabled:opacity-50"
              >
                {isMutating ? 'Publishing...' : 'Publish'}
              </button>
            ) : (
              <button
                type="button"
                disabled={isMutating}
                onClick={handleReview}
                className="px-4 py-2.5 text-sm bg-primary/15 text-primary rounded-md hover:bg-primary/25 font-medium disabled:opacity-50"
              >
                {isMutating ? 'Reviewing...' : 'Review'}
              </button>
            ))}

          {/* Reopen button for Closed stage cards */}
          {isClosed && (
            <button
              type="button"
              disabled={isMutating}
              onClick={handleReopen}
              className="px-4 py-2.5 text-sm border border-border rounded-md hover:bg-muted/50 font-medium disabled:opacity-50"
            >
              {isMutating ? 'Reopening...' : 'Reopen'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
