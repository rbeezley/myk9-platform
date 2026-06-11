import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClassPipelineData } from '../types';

interface ScoringDaySummaryProps {
  classes: ClassPipelineData[];
  showId?: string | null;
}

export const ScoringDaySummary: React.FC<ScoringDaySummaryProps> = ({
  classes,
  showId,
}) => {
  const navigate = useNavigate();
  const completedCount = classes.filter((c) => c.status === 'completed').length;

  return (
    <Card className="border-amber-200 dark:border-amber-800 mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Scoring Day: {completedCount} of {classes.length} classes complete
          </CardTitle>
          {showId ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => navigate(`/shows/${showId}/show-desk`)}
            >
              Open Scoring View
              <ExternalLink className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {classes.map((cls) => {
            const isComplete = cls.status === 'completed';
            const isInProgress = cls.status === 'in-progress';
            return (
              <div key={cls.id} className="flex items-center gap-2 text-sm">
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : isInProgress ? (
                  <Loader2 className="h-4 w-4 text-amber-500 animate-spin flex-shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                )}
                <span className={cn(isComplete && 'text-muted-foreground')}>
                  Class {cls.id.slice(0, 6)}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {cls.scored_entries}/{cls.total_entries} scored
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
