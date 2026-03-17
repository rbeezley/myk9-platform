import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Hash, Plus } from 'lucide-react';
import type { Trial } from '@/components/trials/types/trial.types';
import { useRBAC } from '@/hooks/useRBAC';
import { getClassStatusBadgeClasses, getClassStatusDisplay } from '@myk9/core';
import { parseLocalDateString } from '@/utils/dateLocal';

interface TrialsTabProps {
  trials: Trial[];
  showId: string;
}

function formatDate(dateStr: string): string {
  // Parse as local date to avoid UTC midnight → previous day timezone shift
  const date = parseLocalDateString(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TrialsTab({ trials, showId }: TrialsTabProps) {
  const navigate = useNavigate();
  const { hasPermission } = useRBAC();

  const canManage = hasPermission('admin:manage') || hasPermission('show:manage');

  const openWizard = () =>
    navigate(`/secretary/create-show/wizard?showId=${showId}&mode=add-trials`);

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => openWizard()} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Trial
          </Button>
        </div>
      )}

      {trials.length === 0 ? (
        <div className="py-16 text-center">
          <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">No Trials</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No trials have been created for this show yet.
          </p>
          {canManage && (
            <Button variant="outline" className="mt-4 gap-1.5" onClick={() => openWizard()}>
              <Plus className="h-4 w-4" />
              Add Trial
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trials.map(trial => (
            <Card
              key={trial.id}
              className="cursor-pointer overflow-hidden border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/30"
              onClick={() => navigate(`/shows/${showId}/trials/${trial.id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/shows/${showId}/trials/${trial.id}`)}
            >
              <div className="p-5">
                {/* Header: name + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-card-foreground">
                    {trial.name || `Trial ${trial.trialNumber}`}
                  </h3>
                  <Badge className={`shrink-0 text-xs ${getClassStatusBadgeClasses(trial.status)}`}>
                    {getClassStatusDisplay(trial.status).label}
                  </Badge>
                </div>

                {/* Details */}
                <div className="space-y-2">
                  {trial.trialDate && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatDate(trial.trialDate)}</span>
                    </div>
                  )}

                  {trial.trialNumber && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Hash className="h-3.5 w-3.5 shrink-0" />
                      <span>Trial {trial.trialNumber}</span>
                    </div>
                  )}

                  {trial.trialType && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs">
                        {trial.trialType}
                      </Badge>
                    </div>
                  )}

                  {trial.plannedStartTime && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>Starts {trial.plannedStartTime}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
