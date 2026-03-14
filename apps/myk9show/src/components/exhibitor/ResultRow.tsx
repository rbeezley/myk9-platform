/**
 * ResultRow — compact result row for exhibitor dashboards.
 */

import { Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ResultBadge } from '@/components/common/ResultBadge';
import { ROW_BUTTON_CLASS } from './EntryRow';

export interface ResultRowData {
  id: string;
  resultStatus: string;
  showName: string;
  dogCallName: string;
  className: string;
  classElement: string | null;
  classLevel: string | null;
  showDate: string;
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  finalPlacement: number | null;
  showId?: string;
  classId?: string;
}

export function ResultRow({ result, onView }: { result: ResultRowData; onView: () => void }) {
  return (
    <button
      type="button"
      onClick={onView}
      className={ROW_BUTTON_CLASS}
      aria-label={`${result.showName}, ${result.dogCallName}, ${result.className}, ${result.resultStatus}`}
    >
      <ResultBadge resultStatus={result.resultStatus} variant="large" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-foreground truncate block">{result.showName}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{result.dogCallName}</span>
          <span>
            {result.className}
            {result.classElement ? ` — ${result.classElement}` : ''}
            {result.classLevel ? ` ${result.classLevel}` : ''}
          </span>
          {result.showDate && <span>{format(new Date(result.showDate), 'MMM d, yyyy')}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm">
          {result.searchTimeSeconds != null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {result.searchTimeSeconds.toFixed(1)}s
            </span>
          )}
          {result.totalFaults != null && result.totalFaults > 0 && (
            <span className="flex items-center gap-1 text-warning-orange">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.totalFaults} fault{result.totalFaults !== 1 ? 's' : ''}
            </span>
          )}
          {result.finalPlacement != null && result.finalPlacement > 0 && (
            <span className="text-muted-foreground">Placement: {result.finalPlacement}</span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}
