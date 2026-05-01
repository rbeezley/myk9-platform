import React, { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Briefcase, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { judgeAvailabilityQueries } from '@/services/database/judges';
import { mapDbAvailabilityToUI } from '@/services/mappers/userMappers';
import type { JudgeInfo } from '@/types/user-types';

interface JudgeAvailabilityCardProps {
  personId: string;
}

const statusColors: Record<string, string> = {
  available:
    'bg-gradient-to-r from-green-500/20 to-green-500/10 text-green-700 dark:text-green-300 border-green-500/30',
  busy: 'bg-gradient-to-r from-yellow-500/20 to-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
  unavailable:
    'bg-gradient-to-r from-red-500/20 to-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
};

const JudgeAvailabilityCard: React.FC<JudgeAvailabilityCardProps> = ({ personId }) => {
  const [availability, setAvailability] = useState<JudgeInfo['availability'] | null>(null);
  const [status, setStatus] = useState<'available' | 'busy' | 'unavailable'>('available');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await judgeAvailabilityQueries.getByPersonId(personId);
        if (!cancelled && data) {
          setAvailability(mapDbAvailabilityToUI(data));
          setStatus(
            (data.availability_status as 'available' | 'busy' | 'unavailable') || 'available'
          );
        }
      } catch {
        // No availability record — that's fine
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  if (isLoading) return null;
  if (!availability) return null;

  const hasDateRange = availability.startDate || availability.endDate;
  const hasBlackoutDates = availability.blackoutDates.length > 0;

  return (
    <Card
      className="group bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
                     rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                     hover:shadow-xl hover:-translate-y-1 hover:border-primary/20"
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl"
      />

      <div className="relative space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl">
              <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Judge Availability
            </h3>
          </div>
          <Badge className={`border font-medium ${statusColors[status] || statusColors.available}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div
            className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300"
          >
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Max Shows/Month
            </span>
            <div className="flex items-center gap-1.5">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-semibold text-foreground">
                {availability.maxShowsPerMonth}
              </span>
            </div>
          </div>

          <div
            className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300"
          >
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Travel Radius
            </span>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-semibold text-foreground">
                {availability.travelRadius} mi
              </span>
            </div>
          </div>

          <div
            className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300"
          >
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Available From
            </span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {hasDateRange && availability.startDate
                  ? format(availability.startDate, 'MMM d, yyyy')
                  : 'Always'}
              </span>
            </div>
          </div>

          <div
            className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300"
          >
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Available Until
            </span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {hasDateRange && availability.endDate
                  ? format(availability.endDate, 'MMM d, yyyy')
                  : 'No end date'}
              </span>
            </div>
          </div>
        </div>

        {hasBlackoutDates && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
              Blackout Dates
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[...availability.blackoutDates]
                .sort((a, b) => a.getTime() - b.getTime())
                .map(date => (
                  <Badge key={date.toISOString()} variant="secondary" className="text-xs">
                    {format(date, 'MMM d, yyyy')}
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default JudgeAvailabilityCard;
