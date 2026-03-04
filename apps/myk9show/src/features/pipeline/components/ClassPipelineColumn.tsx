/**
 * ClassPipelineColumn — A single column in the class-level pipeline Kanban.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ClassPipelineCard } from './ClassPipelineCard';
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

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-w-[220px] max-w-[350px] rounded-lg',
        meta.columnBg,
        'border border-border/40',
        isLive && 'ring-2 ring-green-500/20'
      )}
    >
      {/* Column header */}
      <div
        className={cn('flex items-center justify-between px-4 py-3 border-b', meta.headerBorder)}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{meta.label}</h3>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
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

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {classes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No classes</p>
        ) : (
          classes.map(item => (
            <ClassPipelineCard key={item.id} item={item} showId={showId} trialId={trialId} />
          ))
        )}
      </div>
    </div>
  );
};
