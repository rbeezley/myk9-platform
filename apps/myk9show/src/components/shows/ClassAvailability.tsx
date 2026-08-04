/**
 * Class Availability Component
 * Shows spots available per class for a show
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, AlertTriangle, CheckCircle2, Clock, Ticket, Calendar } from 'lucide-react';
import {
  useClassAvailability,
  type ClassAvailability as ClassAvailabilityData,
} from '@/hooks/useClassAvailability';
import { format, parseISO } from 'date-fns';

interface ClassAvailabilityProps {
  showId: string;
  onEnterClass?: ((classId: string) => void) | undefined;
  compact?: boolean | undefined;
  /** Pre-fetched data — when provided, skips internal hook call to avoid duplicate queries */
  prefetchedData?:
    | {
        classes: ClassAvailabilityData[];
        isLoading: boolean;
        error: string | null;
        totalSpotsAvailable: number;
        fullClasses: number;
      }
    | undefined;
}

function getAvailabilityBadge(classData: ClassAvailabilityData) {
  if (classData.isFull) {
    if (classData.allowsWaitlist) {
      return (
        <Badge className="bg-warning/10 text-warning border-warning/20 border">
          <Clock className="h-3 w-3 mr-1" />
          Waitlist ({classData.waitlistCount})
        </Badge>
      );
    }
    return (
      <Badge className="bg-destructive/10 text-destructive border-destructive/20 border">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Full
      </Badge>
    );
  }

  if (classData.entryLimit === 0) {
    return <Badge className="bg-muted/50 text-muted-foreground border-muted">No limit</Badge>;
  }

  if (classData.spotsAvailable <= 5) {
    return (
      <Badge className="bg-warning/10 text-warning border-warning/20 border">
        <AlertTriangle className="h-3 w-3 mr-1" />
        {classData.spotsAvailable} spots left
      </Badge>
    );
  }

  return (
    <Badge className="bg-success/10 text-success border-success/20 border">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      {classData.spotsAvailable} spots available
    </Badge>
  );
}

function ClassAvailabilityCard({
  classData,
  onEnterClass,
  compact = false,
}: {
  classData: ClassAvailabilityData;
  onEnterClass?: ((classId: string) => void) | undefined;
  compact?: boolean | undefined;
}) {
  const canEnter = !classData.isFull;
  const canJoinWaitlist = classData.isFull && classData.allowsWaitlist;
  const canInteract = canEnter || canJoinWaitlist;

  if (compact) {
    return (
      <div className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-medium text-sm">{classData.className}</div>
            <div className="text-xs text-muted-foreground">{classData.level}</div>
          </div>
        </div>
        {getAvailabilityBadge(classData)}
      </div>
    );
  }

  return (
    <Card className="bg-card/95 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold">{classData.className}</h4>
              <Badge variant="outline" className="text-xs">
                {classData.level}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              {classData.trialName} - {format(parseISO(classData.trialDate), 'EEE, MMM d')}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>
                  {classData.currentEntries}
                  {classData.entryLimit > 0 && ` / ${classData.entryLimit}`}
                </span>
              </div>
              {getAvailabilityBadge(classData)}
            </div>
          </div>
          {onEnterClass && (
            <Button
              size="sm"
              variant={canInteract ? 'default' : 'outline'}
              onClick={() => onEnterClass(classData.classId)}
              disabled={!canInteract}
            >
              <Ticket className="h-4 w-4 mr-1" />
              {canEnter ? 'Enter' : canJoinWaitlist ? 'Join Waitlist' : 'Full'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ClassAvailabilitySkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="bg-card/95 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-9 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ClassAvailability({
  showId,
  onEnterClass,
  compact = false,
  prefetchedData,
}: ClassAvailabilityProps) {
  const hookResult = useClassAvailability(showId, { enabled: !prefetchedData });
  const { classes, isLoading, error, totalSpotsAvailable, fullClasses } =
    prefetchedData ?? hookResult;

  // Group classes by trial
  const classesGroupedByTrial = useMemo(() => {
    const groups: Record<string, ClassAvailabilityData[]> = {};
    classes.forEach(cls => {
      if (!groups[cls.trialId]) {
        groups[cls.trialId] = [];
      }
      groups[cls.trialId].push(cls);
    });
    return groups;
  }, [classes]);

  if (isLoading) {
    return <ClassAvailabilitySkeleton count={compact ? 5 : 3} />;
  }

  if (error) {
    return (
      <Card className="bg-destructive/5 border-destructive/20">
        <CardContent className="p-4 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (classes.length === 0) {
    return (
      <Card className="bg-muted/30 border-border/50">
        <CardContent className="p-6 text-center">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <h4 className="font-medium text-muted-foreground">No classes available yet</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Classes will appear here once they're added to the show.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {!compact && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{classes.length} classes</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>{totalSpotsAvailable} spots available</span>
          </div>
          {fullClasses > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span>{fullClasses} classes full</span>
            </div>
          )}
        </div>
      )}

      {/* Classes grouped by trial */}
      {Object.entries(classesGroupedByTrial).map(([trialId, trialClasses]) => {
        const trial = trialClasses[0];
        return (
          <div key={trialId} className="space-y-3">
            {!compact && (
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {trial.trialName} - {format(parseISO(trial.trialDate), 'EEEE, MMMM d, yyyy')}
              </div>
            )}
            <div className={compact ? 'space-y-2' : 'grid gap-3 md:grid-cols-2'}>
              {trialClasses.map(cls => (
                <ClassAvailabilityCard
                  key={cls.classId}
                  classData={cls}
                  onEnterClass={onEnterClass}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ClassAvailability;
