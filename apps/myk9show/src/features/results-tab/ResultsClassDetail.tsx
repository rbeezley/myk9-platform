import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { useEmbeddedDetail } from '@/components/layout/embeddedDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CockpitPaperworkRow } from '@/features/show-map/cockpit/CockpitPaperworkRow';
import { formatTime } from '@/lib/format/dates';
import type { ResultsClassRow, ResultsEntryRow } from './buildResultsClassRows';
import { ResultsStatusChip } from './ResultsClassList';
import { getFixScoreHref, getOverviewFocusHref } from './resultsTabRoutes';

const THEN_LABEL: Record<string, string> = {
  'results-sheet': 'Results sheet',
  'result-labels': 'Ribbon labels',
};

interface ResultsClassDetailProps {
  showId: string;
  row: ResultsClassRow;
  timeZone: string;
  releasing: boolean;
  onRelease: () => void;
  /**
   * Part 2 seam: the per-row "matches paper" tick. When given, the table gains that column and
   * renders this for each dog; absent today, so no empty column ships.
   */
  renderRowVerifyCell?: ((entry: ResultsEntryRow) => ReactNode) | undefined;
  /** Part 2 seam: the Judge sign-off section, rendered between the results table and "Then". */
  judgeSignOffSlot?: ReactNode | undefined;
}

function PrimaryWork({
  showId,
  row,
  releasing,
  onRelease,
}: Pick<ResultsClassDetailProps, 'showId' | 'row' | 'releasing' | 'onRelease'>) {
  const { phase } = row;
  let title: string;
  let body: string;
  let action: ReactNode = null;
  if (phase === 'not-started' || phase === 'in-ring') {
    title = phase === 'in-ring' ? 'Still in the ring' : 'Not started yet';
    body = `${row.scoredCount} of ${row.expectedCount} scored. Results are checked and released here once scoring is complete.`;
    action = (
      <Button asChild variant="outline" className="min-h-11 gap-2">
        <Link to={getOverviewFocusHref(showId, row.id)}>
          Open on Overview
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    );
  } else if (phase === 'needs-checking' || phase === 'ready-to-release') {
    title = 'Check the scores, then release';
    body = 'Compare the table below with the paper score sheets. Fix anything that is off first.';
    action = (
      <Button type="button" className="min-h-11" disabled={releasing} onClick={onRelease}>
        {releasing ? 'Releasing…' : 'Release results'}
      </Button>
    );
  } else if (phase === 'released') {
    title = 'Print the results sheet and ribbon labels';
    body = 'The results are released. Print the paperwork below and record it as printed.';
  } else if (phase === 'done') {
    title = 'All done for this class';
    body = 'Results are released and the paperwork is printed.';
  } else if (phase === 'cancelled') {
    title = 'This class was cancelled';
    body = 'There are no results to check, release or print.';
  } else {
    title = 'No dogs ran in this class';
    body = 'Every entry was pulled, withdrawn or absent, so there are no results to release.';
  }
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Primary work
          </p>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

function ResultsTable({
  showId,
  row,
  renderRowVerifyCell,
}: Pick<ResultsClassDetailProps, 'showId' | 'row' | 'renderRowVerifyCell'>) {
  if (row.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No dogs are expected to run in this class.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Place</TableHead>
            <TableHead>Armband</TableHead>
            <TableHead>Dog · Handler</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Faults</TableHead>
            {renderRowVerifyCell && <TableHead>Matches paper</TableHead>}
            <TableHead>
              <span className="sr-only">Fix</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {row.entries.map(entry => (
            <TableRow key={entry.entryId}>
              <TableCell>{entry.placement ?? '—'}</TableCell>
              <TableCell>{entry.armband || '—'}</TableCell>
              <TableCell>
                <span className="font-medium">{entry.dogName}</span>
                {entry.handlerName && (
                  <span className="text-muted-foreground"> · {entry.handlerName}</span>
                )}
              </TableCell>
              <TableCell>{entry.resultLabel}</TableCell>
              <TableCell className="font-mono">{entry.timeLabel || '—'}</TableCell>
              <TableCell>{entry.faults ?? '—'}</TableCell>
              {renderRowVerifyCell && <TableCell>{renderRowVerifyCell(entry)}</TableCell>}
              <TableCell>
                <Link
                  to={getFixScoreHref(showId, row.id, entry.entryId)}
                  aria-label={`Fix score for ${entry.dogName}`}
                  className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Fix
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ResultsClassDetail({
  showId,
  row,
  timeZone,
  releasing,
  onRelease,
  renderRowVerifyCell,
  judgeSignOffSlot,
}: ResultsClassDetailProps) {
  const embedded = useEmbeddedDetail();
  const { search } = useLocation();
  const backParams = new URLSearchParams(search);
  backParams.delete('classId');
  const backQuery = backParams.toString();
  const finished = formatTime(row.finishedAt, timeZone);
  const released = Boolean(row.releasedAt);
  return (
    <section className="space-y-4" aria-label={`${row.name} results`}>
      {!embedded && (
        <Link
          to={`/shows/${encodeURIComponent(showId)}/results${backQuery ? `?${backQuery}` : ''}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All classes
        </Link>
      )}
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Class results
        </p>
        <h2 className="text-xl font-semibold">{row.name}</h2>
        <p className="text-sm text-muted-foreground">
          {[row.trialLabel, row.judgeName, finished ? `Finished ${finished}` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline">
            Scored {row.scoredCount} / {row.expectedCount}
          </Badge>
          <Badge variant="outline">{row.qualifiedCount} Q</Badge>
          <Badge variant="outline">{released ? 'Released' : 'Not released'}</Badge>
          <ResultsStatusChip phase={row.phase} />
        </div>
      </header>

      <PrimaryWork showId={showId} row={row} releasing={releasing} onRelease={onRelease} />
      <ResultsTable showId={showId} row={row} renderRowVerifyCell={renderRowVerifyCell} />
      {judgeSignOffSlot}

      {row.expectedCount > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Then</h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium">
              {released ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
              Release results
              <span className="font-normal text-muted-foreground">
                {released ? 'Released' : 'Not released yet'}
              </span>
            </li>
            {row.paperwork.map(item => (
              <li key={item.reportId}>
                <CockpitPaperworkRow
                  item={{ ...item, label: THEN_LABEL[item.reportId] ?? item.label }}
                  timeZone={timeZone}
                  onCommand={() => undefined}
                />
              </li>
            ))}
          </ul>
          {!released && row.paperwork.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Print after releasing, so the paperwork matches what exhibitors see.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
