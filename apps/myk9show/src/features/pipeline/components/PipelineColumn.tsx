import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STAGE_META } from '../constants';
import { TrialPipelineCard } from './TrialPipelineCard';
import type { PipelineStage, TrialPipelineData } from '../types';

interface PipelineColumnProps {
  stage: PipelineStage;
  trials: TrialPipelineData[];
  checklistProgressMap: Map<string, { completed: number; total: number }>;
  isCurrentStage?: boolean;
}

export const PipelineColumn: React.FC<PipelineColumnProps> = ({
  stage,
  trials,
  checklistProgressMap,
  isCurrentStage,
}) => {
  const meta = STAGE_META[stage];

  return (
    <div
      className={cn(
        'flex flex-col min-w-[280px] max-w-[320px] rounded-lg',
        'bg-muted/30 border border-border/40',
        isCurrentStage && 'ring-2 ring-primary/30',
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{meta.label}</h3>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {trials.length}
          </Badge>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {trials.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No trials</p>
        ) : (
          trials.map((trial) => (
            <TrialPipelineCard
              key={trial.id}
              trial={trial}
              checklistProgress={
                checklistProgressMap.get(trial.id) ?? { completed: 0, total: 0 }
              }
            />
          ))
        )}
      </div>
    </div>
  );
};
