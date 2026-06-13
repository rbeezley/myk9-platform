import React from 'react';
import { cn } from '@/lib/utils';
import { Check, Lock } from 'lucide-react';
import { STAGE_META } from '../constants';
import { PIPELINE_STAGES } from '../types';
import type { PipelineStage } from '../types';

interface StageNavigationProps {
  currentStage: PipelineStage;
  viewingStage: PipelineStage;
  onSelectStage: (stage: PipelineStage) => void;
}

export const StageNavigation: React.FC<StageNavigationProps> = ({
  currentStage,
  viewingStage,
  onSelectStage,
}) => {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {PIPELINE_STAGES.map(stage => {
        const meta = STAGE_META[stage];
        const isCompleted = stage < currentStage;
        const isCurrent = stage === currentStage;
        const isFuture = stage > currentStage;
        const isViewing = stage === viewingStage;

        return (
          <button
            key={stage}
            onClick={() => onSelectStage(stage)}
            disabled={isFuture}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
              isViewing && 'ring-2 ring-primary ring-offset-1',
              isCompleted && 'bg-success/10 text-success ',
              isCurrent && !isViewing && 'bg-primary/10 text-primary',
              isFuture && 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed',
              !isViewing &&
                !isCompleted &&
                !isCurrent &&
                !isFuture &&
                'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            {isCompleted && <Check className="h-3 w-3" />}
            {isFuture && <Lock className="h-3 w-3" />}
            {meta.shortLabel}
          </button>
        );
      })}
    </div>
  );
};
