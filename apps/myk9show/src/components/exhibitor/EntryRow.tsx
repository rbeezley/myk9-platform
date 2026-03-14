/**
 * EntryRow — compact entry row for upcoming entries on exhibitor dashboards.
 */

import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

export interface DashboardEntry {
  id: string;
  showId: string;
  showName: string;
  dogId: string;
  dogName: string;
  className: string;
  entryFee: number;
  status: string;
  showDate: Date | null;
  location: string;
  classId: string;
}

export const ROW_BUTTON_CLASS =
  'w-full text-left flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-card hover:bg-card/90 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[48px]';

const STATUS_BADGE_STYLES: Record<string, string> = {
  confirmed: 'bg-success-green/10 text-success-green border-success-green/20',
  pending: 'bg-warning-orange/10 text-warning-orange border-warning-orange/20',
  cancelled: 'bg-error-red/10 text-error-red border-error-red/20',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  cancelled: 'Cancelled',
};

export function EntryRow({ entry, onView }: { entry: DashboardEntry; onView: () => void }) {
  const badgeStyle =
    STATUS_BADGE_STYLES[entry.status] ?? 'bg-muted text-muted-foreground border-border';
  const badgeLabel = STATUS_LABELS[entry.status] ?? 'Unknown';

  return (
    <button
      type="button"
      onClick={onView}
      className={ROW_BUTTON_CLASS}
      aria-label={`${entry.showName}, ${entry.dogName}, ${entry.className}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <span className="font-semibold text-foreground truncate">{entry.showName}</span>
          <Badge className={badgeStyle}>{badgeLabel}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm text-muted-foreground">
          <span>{entry.dogName}</span>
          <span>&bull; {entry.className}</span>
          {entry.showDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(entry.showDate, 'MMM d')}
            </span>
          )}
          {entry.location !== 'TBD' && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {entry.location}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}
