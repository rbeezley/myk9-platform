import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ResultSubmissionRow } from '@/hooks/mutations/useResultSubmission';
import { formatEntryDateTime } from '@/lib/format/dates';
import { statusLabel, statusVariant } from './helpers';

interface SubmissionHistoryProps {
  history: ResultSubmissionRow[];
  isLoading: boolean;
  /**
   * The history read did not succeed, so an empty `history` means NOTHING.
   *
   * `useResultSubmissions` declares no `networkMode`, so it inherits React
   * Query's `'online'` default and PAUSES offline: `fetchStatus` becomes
   * 'paused', which makes `isFetching` false, which makes `isLoading` false --
   * and pending is not error, so the caller's `data = []` default turned a
   * failed read into the flat claim "No submissions recorded for this show."
   */
  isUnavailable?: boolean;
  onRetry?: (() => void) | undefined;
}

export function SubmissionHistory({
  history,
  isLoading,
  isUnavailable = false,
  onRetry,
}: SubmissionHistoryProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Submission History</h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading history...</p>
      ) : isUnavailable ? (
        /*
          This ledger is the only thing on the page that answers "have I already
          submitted?", and the cost of getting that wrong is a duplicate
          submission to a sanctioning organisation. An unread query must never
          render as "nothing was ever submitted".
        */
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <p className="font-medium">Couldn&rsquo;t load submission history.</p>
          <p className="mt-1 text-muted-foreground">
            We can&rsquo;t tell whether these results have already been submitted. Check with
            whoever ran the show, or retry, before sending again.
          </p>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submissions recorded for this show.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table data-testid="history-table">
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Sport</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map(row => (
                <TableRow key={row.id}>
                  <TableCell>{row.organization}</TableCell>
                  <TableCell className="capitalize">{row.sport_type.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatEntryDateTime(row.submitted_at) || row.submitted_at}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
