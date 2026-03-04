/**
 * ClassPipelineColumn — A single column in the class-level pipeline Kanban.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ClassPipelineCard } from './ClassPipelineCard';
import { usePipelinePrint } from '../print/usePipelinePrint';
import { CLASS_STAGE_META } from '../mission-control-types';
import type { ClassPipelineItem, ClassPipelineStage } from '../mission-control-types';

interface ClassPipelineColumnProps {
  stage: ClassPipelineStage;
  classes: ClassPipelineItem[];
  showId: string;
  trialId: string;
  isLive?: boolean;
}

export const ClassPipelineColumn: React.FC<ClassPipelineColumnProps> = ({
  stage,
  classes,
  showId,
  trialId,
  isLive,
}) => {
  const meta = CLASS_STAGE_META[stage];
  const isEmpty = classes.length === 0;
  const print = usePipelinePrint(showId, trialId);

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg',
        meta.columnBg,
        'border border-border/40',
        isEmpty ? 'min-w-[100px] max-w-[100px] flex-none' : 'flex-1 min-w-[220px] max-w-[350px]',
        isLive && 'ring-2 ring-green-500/20'
      )}
    >
      {/* Column header */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3',
          !isEmpty && 'border-b',
          meta.headerBorder
        )}
      >
        <div className={cn('flex items-center gap-2', isEmpty && 'flex-col gap-1 w-full')}>
          <h3 className={cn('font-semibold text-sm', isEmpty && 'text-muted-foreground')}>
            {isEmpty ? meta.shortLabel : meta.label}
          </h3>
          <Badge variant="secondary" className="text-sm px-1.5 py-0">
            {classes.length}
          </Badge>
          {isLive && (
            <div className="flex items-center gap-1 ml-1">
              <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-green-400 font-medium">Live</span>
            </div>
          )}
        </div>
      </div>

      {/* Cards — hidden when column is empty (header-only) */}
      {!isEmpty && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {classes.map(item => (
            <ClassPipelineCard
              key={item.id}
              item={item}
              showId={showId}
              trialId={trialId}
              print={print}
            />
          ))}
        </div>
      )}
    </div>
  );
};
