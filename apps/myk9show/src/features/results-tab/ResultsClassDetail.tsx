import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { useEmbeddedDetail } from '@/components/layout/embeddedDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CockpitPaperworkRow } from '@/features/show-map/cockpit/CockpitPaperworkRow';
import { judgeSignOffWording } from '@/features/show-map/judgeSignOff';
import { isStaleResultsError } from '@/features/show-map/resultsVerifiedMutations';
import { formatTime } from '@/lib/format/dates';
import type { ResultsClassRow, ResultsEntryRow } from './buildResultsClassRows';
import { PrintStatusUnavailable } from './PrintStatusUnavailable';
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
  /** Refetches every read; offered where print status could not be read. */
  onRetry: () => void;
  /**
   * Saves "scores match the paper" for the results text the user ticked (`canonical`). Rejects
   * when the server refuses (the caller has already told the user why).
   */
  onVerify: (canonical: string) => Promise<unknown>;
  /** Removes that check. */
  onUndoVerify: () => void;
  verifying: boolean;
  /** Saving or removing the check needs the server; ticking the dogs does not. */
  online: boolean;
  /** Why Release is held back on this tab right now (offline, scores still syncing), or null. */
  releaseBlockedReason: string | null;
  /** Auth uid of the signed-in user, so the check can say "you". */
  currentUserId: string | null;
  /** The Judge sign-off section, rendered between the results table and "Then". */
  judgeSignOffSlot?: ReactNode | undefined;
}

/** What a tick vouches for. A correction changes it, so the dog needs checking again. */
function resultSignature(entry: ResultsEntryRow): string {
  return [entry.placement, entry.resultLabel, entry.timeLabel, entry.faults].join('|');
}

interface PrimaryWorkProps extends Pick<
  ResultsClassDetailProps,
  'showId' | 'row' | 'releasing' | 'onRelease' | 'online' | 'releaseBlockedReason'
> {
  tickedCount: number;
  verifying: boolean;
  onVerify: () => void;
}

function PrimaryWork({
  showId,
  row,
  releasing,
  onRelease,
  online,
  releaseBlockedReason,
  tickedCount,
  verifying,
  onVerify,
}: PrimaryWorkProps) {
  const { phase } = row;
  const noun = judgeSignOffWording(row.registryId).nextActionLabel.toLowerCase();
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
  } else if (phase === 'needs-checking') {
    const allTicked = row.entries.length > 0 && tickedCount === row.entries.length;
    const released = Boolean(row.releasedAt);
    // The server records a check only on a Completed class. Mark Class Complete is Overview's
    // action, so the hint links there rather than offering a second way to complete a class.
    const blocked = !row.statusCompleted
      ? null
      : !online
        ? 'Connect to save the check'
        : row.resultsCanonical === null
          ? 'These scores need a reload before they can be checked'
          : null;
    title = 'Check the scores against the paper';
    body = `Tick each dog below when it matches its paper score sheet (${tickedCount} of ${row.entries.length}). Fix anything that is off first.${released ? ' These results are already released.' : ' Release unlocks once the scores are checked.'}`;
    action = row.statusCompleted ? (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={!allTicked || verifying || blocked !== null}
            onClick={onVerify}
          >
            {verifying ? 'Saving…' : 'Scores match the paper'}
          </Button>
          {!released && (
            <Button type="button" variant="outline" className="min-h-11" disabled>
              Release results
            </Button>
          )}
        </div>
        {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
      </div>
    ) : (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          The class is not marked complete, so the check cannot be saved yet.
        </p>
        <Button asChild variant="outline" className="min-h-11 gap-2">
          <Link to={getOverviewFocusHref(showId, row.id)}>
            Mark Class Complete on Overview
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  } else if (phase === 'ready-to-release') {
    title = 'Release the results';
    body = 'The scores are checked against the paper. Release makes them visible to exhibitors.';
    action = (
      <div className="space-y-1">
        <Button
          type="button"
          className="min-h-11"
          disabled={releasing || releaseBlockedReason !== null}
          onClick={onRelease}
        >
          {releasing ? 'Releasing…' : 'Release results'}
        </Button>
        {releaseBlockedReason && (
          <p className="text-xs text-muted-foreground">{releaseBlockedReason}</p>
        )}
      </div>
    );
  } else if (phase === 'release-unknown') {
    title = 'Release status unknown';
    body =
      'Could not read whether this class is released. Retry from the class list; Release is held back until it is known.';
  } else if (phase === 'released') {
    title = 'Print the results sheet and ribbon labels';
    body = 'The results are released. Print the paperwork below and record it as printed.';
  } else if (phase === 'needs-initials') {
    title = `Record the judge's ${noun}`;
    body = `The judge's day is over. Print the marked catalog, have the judge ${noun === 'initials' ? 'initial' : 'sign'} it, then record it in Judge sign-off below.`;
  } else if (phase === 'done') {
    title = 'All done for this class';
    body =
      row.judgeSignedOffAt === null
        ? `Results are released and the paperwork is printed. The judge's ${noun} are collected at the end of their day.`
        : 'Results are released, the paperwork is printed and the judge has signed off.';
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

/** Who checked the scores and when, with the way to take the check back. */
function VerifiedLine({
  row,
  timeZone,
  currentUserId,
  verifying,
  online,
  onUndo,
}: Pick<ResultsClassDetailProps, 'row' | 'timeZone' | 'currentUserId' | 'verifying' | 'online'> & {
  onUndo: () => void;
}) {
  const by = row.verifiedBy && row.verifiedBy === currentUserId ? 'you' : 'another show manager';
  const at = formatTime(row.verifiedAt, timeZone);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-success/5 px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        Scores checked against the paper by {by}
        {at ? ` at ${at}` : ''}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {!online && (
          <span className="text-xs text-muted-foreground">Connect to save the check</span>
        )}
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={verifying || !online}
          onClick={onUndo}
        >
          Undo check
        </Button>
      </span>
    </div>
  );
}

interface TickColumn {
  isTicked: (entry: ResultsEntryRow) => boolean;
  onToggle: (entry: ResultsEntryRow, checked: boolean) => void;
}

function ResultsTable({
  showId,
  row,
  tickColumn,
}: Pick<ResultsClassDetailProps, 'showId' | 'row'> & { tickColumn: TickColumn | null }) {
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
            {tickColumn && <TableHead>Matches paper</TableHead>}
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
              {tickColumn && (
                <TableCell>
                  <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                    <Checkbox
                      checked={tickColumn.isTicked(entry)}
                      onCheckedChange={checked => tickColumn.onToggle(entry, checked)}
                      aria-label={`${entry.dogName} matches the paper`}
                    />
                  </label>
                </TableCell>
              )}
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
  onRetry,
  onVerify,
  onUndoVerify,
  verifying,
  online,
  releaseBlockedReason,
  currentUserId,
  judgeSignOffSlot,
}: ResultsClassDetailProps) {
  const embedded = useEmbeddedDetail();
  // Ephemeral checklist, bound to the DISPLAY: the ticks remember the results text of the rows
  // they were made on (`resultsCanonical`), and when the displayed rows change (a correction, here
  // or downloaded) every tick lapses. A tick is also only good for the result it was made on.
  const [ticked, setTicked] = useState<{ canonical: string | null; marks: Record<string, string> }>(
    {
      canonical: row.resultsCanonical,
      marks: {},
    }
  );
  const marks = ticked.canonical === row.resultsCanonical ? ticked.marks : {};
  const isTicked = (entry: ResultsEntryRow) => marks[entry.entryId] === resultSignature(entry);
  const tickedCount = row.entries.filter(isTicked).length;
  const tickColumn: TickColumn | null =
    row.phase === 'needs-checking' && row.statusCompleted && row.resultsCanonical !== null
      ? {
          isTicked,
          onToggle: (entry, checked) => {
            const next = { ...marks };
            if (checked) next[entry.entryId] = resultSignature(entry);
            else delete next[entry.entryId];
            setTicked({ canonical: row.resultsCanonical, marks: next });
          },
        }
      : null;
  const handleVerify = () => {
    // The text the ticks were made against is what gets saved; nothing is re-read now. If the
    // server says the scores moved since (MK015), the ticks no longer vouch for anything.
    if (ticked.canonical === null) return;
    onVerify(ticked.canonical).catch(error => {
      if (isStaleResultsError(error)) setTicked({ canonical: row.resultsCanonical, marks: {} });
    });
  };
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
          <Badge variant="outline">
            {released ? 'Released' : row.phase === 'release-unknown' ? 'Unknown' : 'Not released'}
          </Badge>
          <ResultsStatusChip phase={row.phase} label={row.phaseLabel} />
        </div>
      </header>

      <PrimaryWork
        showId={showId}
        row={row}
        releasing={releasing}
        onRelease={onRelease}
        online={online}
        releaseBlockedReason={releaseBlockedReason}
        tickedCount={tickedCount}
        verifying={verifying}
        onVerify={handleVerify}
      />
      {row.verifiedAt && row.phase !== 'needs-checking' && (
        <VerifiedLine
          row={row}
          timeZone={timeZone}
          currentUserId={currentUserId}
          verifying={verifying}
          online={online}
          onUndo={onUndoVerify}
        />
      )}
      <ResultsTable showId={showId} row={row} tickColumn={tickColumn} />
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
                {released
                  ? 'Released'
                  : row.phase === 'release-unknown'
                    ? 'Status unknown'
                    : 'Not released yet'}
              </span>
            </li>
            {!row.paperworkAvailable && (
              <li>
                <PrintStatusUnavailable onRetry={onRetry} />
              </li>
            )}
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
