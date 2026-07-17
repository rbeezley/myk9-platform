/**
 * ClassPipelineCard — Class card for the Mission Control pipeline.
 *
 * Renders a compact card inspired by the myK9Q ClassCard:
 * left accent border, status badge, judge name, progress bar, and scored count.
 * Clicking navigates to the secretary class dashboard.
 */

import { useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { notifications } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { Printer, GripVertical, ClipboardList } from 'lucide-react';
import { StatusBadge } from '@/components/status';
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
  /** Omit to hide the print dropdown (e.g. for the DragOverlay preview). */
  print?: UsePipelinePrintReturn;
}

function getPipelineStatus(item: ClassPipelineItem): { status: string; label: string } {
  if (item.stage === 'results') {
    return {
      status: 'completed',
      label: item.is_results_reviewed ? 'Reviewed' : 'Done',
    };
  }
  if (item.stage === 'closed') return { status: 'completed', label: 'Published' };
  if (item.stage === 'in-progress') return { status: 'in-progress', label: 'Active' };
  return { status: item.stage, label: item.stage === 'setup' ? 'Setup' : 'Not started' };
}

export const ClassPipelineCard: React.FC<ClassPipelineCardProps> = ({
  item,
  showId,
  trialId,
  print,
}) => {
  const navigate = useNavigate();
  const updateClass = useUpdateClassMutation();
  const isMutating = updateClass.isPending;
  const isPrinting = print?.isPrinting ?? false;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'class-card', item },
  });

  const pipelineStatus = getPipelineStatus(item);
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

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!isDragging) {
          navigate(`/shows/${showId}/trials/${trialId}/classes/${item.id}/secretary`);
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/shows/${showId}/trials/${trialId}/classes/${item.id}/secretary`);
        }
      }}
      className={cn(
        'relative w-full text-left rounded-lg border border-border/60 bg-card overflow-hidden',
        'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isClosed && 'opacity-60',
        isDragging && 'opacity-40'
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 p-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing z-10"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      {/* Left accent bar */}
      <div className="absolute bottom-0 left-0 top-0 w-1 bg-border" />

      {/* Status badge (top-right) */}
      <StatusBadge
        family="class"
        status={pipelineStatus.status}
        label={pipelineStatus.label}
        className="absolute right-0 top-0 rounded-bl-lg rounded-br-none rounded-tl-none text-sm"
      />

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
            className="h-full rounded-full bg-primary transition-all duration-500"
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
          {print && item.total_entries > 0 && (
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
                <DropdownMenuItem onClick={() => print.printRunOrder(item)}>
                  Run Order / Check-In
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => print.printScoreSheet(item)}>
                  Blank Score Sheet
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={item.stage !== 'results' && item.stage !== 'closed'}
                  onClick={() => print.printResults(item)}
                >
                  Results Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Enter Scores — visible when class is active or has results to review */}
          {(item.stage === 'in-progress' || item.stage === 'results') && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                navigate(`/scoring/classes/${item.id}/entries`);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-muted/60 text-foreground rounded-md hover:bg-muted font-medium"
              aria-label="Enter scores"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Enter Scores
            </button>
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
