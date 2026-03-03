import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Users, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrialPipelineData } from '../types';

interface TrialPipelineCardProps {
  trial: TrialPipelineData;
  checklistProgress: { completed: number; total: number };
}

export const TrialPipelineCard: React.FC<TrialPipelineCardProps> = ({
  trial,
  checklistProgress,
}) => {
  const navigate = useNavigate();
  const pct =
    checklistProgress.total > 0
      ? Math.round((checklistProgress.completed / checklistProgress.total) * 100)
      : 0;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-border/60"
      onClick={() => navigate(`/secretary/pipeline/${trial.id}`)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="font-semibold text-sm leading-tight truncate">{trial.name}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{new Date(trial.date).toLocaleDateString()}</span>
        </div>
        {trial.entry_count > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{trial.entry_count} entries</span>
          </div>
        )}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {checklistProgress.completed}/{checklistProgress.total}
            </span>
            <span
              className={cn(
                'font-medium',
                pct === 100 ? 'text-green-600' : 'text-muted-foreground',
              )}
            >
              {pct}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                pct === 100 ? 'bg-green-500' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
