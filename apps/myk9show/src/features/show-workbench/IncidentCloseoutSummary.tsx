import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText } from 'lucide-react';
import {
  listShowIncidentCloseout,
  showIncidentCloseoutQueryKey,
} from '@/services/database/show-incidents';
import { cn } from '@/lib/utils';
import { formatIncidentType, summarizeShowIncidents } from './showIncidents';

interface IncidentCloseoutSummaryProps {
  showId: string;
}

export function IncidentCloseoutSummary({ showId }: IncidentCloseoutSummaryProps) {
  const incidentsQuery = useQuery({
    queryKey: showIncidentCloseoutQueryKey(showId),
    queryFn: () => listShowIncidentCloseout(showId),
  });
  const incidents = incidentsQuery.data ?? [];
  const summary = summarizeShowIncidents(incidents);
  const needsReview = summary.reportableCount > 0;
  const statusLabel = incidentsQuery.isLoading
    ? 'Checking incidents'
    : incidentsQuery.isError
      ? 'Could not check incidents'
      : needsReview
        ? `${summary.reportableCount} reportable`
        : 'No reportable incidents';

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="incident-closeout-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="incident-closeout-title" className="text-base font-semibold">
            Incident closeout
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Reportable bites, complaints, disqualifications, and injury notes before final filing.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-medium',
            needsReview ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
          )}
        >
          {statusLabel}
        </span>
      </div>

      {incidentsQuery.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking the incident log...</p>
      ) : incidentsQuery.isError ? (
        <p className="mt-3 text-sm text-destructive">
          Could not load the incident closeout. Try the Today incident log before filing reports.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div role="group" aria-label="All incidents">
              <p className="text-xs font-medium uppercase text-muted-foreground">All incidents</p>
              <p className="text-xl font-semibold">{summary.totalCount}</p>
            </div>
            <div role="group" aria-label="Reportable incidents">
              <p className="text-xs font-medium uppercase text-muted-foreground">Reportable</p>
              <p className="text-xl font-semibold">{summary.reportableCount}</p>
            </div>
            <div role="group" aria-label="Urgent incidents">
              <p className="text-xs font-medium uppercase text-muted-foreground">Urgent</p>
              <p className="text-xl font-semibold">{summary.urgentCount}</p>
            </div>
          </div>

          {summary.latestReportable ? (
            <p className="mt-3 inline-flex items-start gap-2 text-sm text-muted-foreground">
              {summary.urgentCount > 0 ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
              ) : (
                <FileText className="mt-0.5 h-4 w-4" aria-hidden="true" />
              )}
              <span>
                Latest reportable: {formatIncidentType(summary.latestReportable.incident_type)} -{' '}
                {summary.latestReportable.summary}
              </span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No reportable incident follow-up is waiting in this show.
            </p>
          )}
        </>
      )}
    </section>
  );
}
