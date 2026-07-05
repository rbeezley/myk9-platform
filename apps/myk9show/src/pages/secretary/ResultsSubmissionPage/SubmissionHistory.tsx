import { Badge } from '@/components/ui/badge';
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
}

export function SubmissionHistory({ history, isLoading }: SubmissionHistoryProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Submission History</h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading history...</p>
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
