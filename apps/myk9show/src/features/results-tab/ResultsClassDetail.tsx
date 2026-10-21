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
import { judgeSignOffWording } from '@/features/show-map/judgeSignOff';
import { formatTime } from '@/lib/format/dates';
import { useReserveBottomAbove } from '@/hooks/useReserveBottomAbove';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import type { ResultsClassRow } from './buildResultsClassRows';
import { useClassManualReleaseTiming } from './classManualReleaseTiming';
import { HideResultsButton, hideBlockedReason } from './HideResultsButton';
import { PrintStatusUnavailable } from './PrintStatusUnavailable';
import { ResultsStatusChip } from './ResultsClassList';
import { getFixScoreHref, getOverviewFocusHref } from './resultsTabRoutes';

const THEN_LABEL: Record<string, string> = {
  'results-sheet': 'Results sheet',
  'result-labels': 'Result labels',
};

interface ResultsClassDetailProps {
  showId: string;
  row: ResultsClassRow;
  timeZone: string;
  releasing: boolean;
  onRelease: () => void;
  /** Takes a released class back to unreleased (MYK9-1318). */
  onHide: () => void;
  hiding: boolean;
  /** Refetches every read; offered where print status could not be read. */
  onRetry: () => void;
  /** Removes the saved check. */
  onUndoVerify: () => void;
  verifying: boolean;
  /** Saving or removing the check needs the server; ticking the dogs does not. */
  online: boolean;
  /** Why Release is held back on this tab right now (offline, scores still syncing), or null. */
  releaseBlockedReason: string | null;
  /** Why the saved check could not show here yet (class row unsynced or in conflict), or null. */
  verifyBlockedReason: string | null;
  /** Auth uid of the signed-in user, so the check can say "you". */
  currentUserId: string | null;
  /** The Judge sign-off section, rendered between the results table and "Then". */
  judgeSignOffSlot?: ReactNode | undefined;
}

interface PrimaryWorkProps extends Pick<
  ResultsClassDetailProps,
  | 'showId'
  | 'row'
  | 'releasing'
  | 'hiding'
  | 'onRelease'
  | 'online'
  | 'releaseBlockedReason'
  | 'verifyBlockedReason'
> {
  verifying: boolean;
}

function PrimaryWork({
  showId,
  row,
  releasing,
  hiding,
  onRelease,
  online,
  releaseBlockedReason,
  verifyBlockedReason,
  verifying,
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
    const released = Boolean(row.releasedAt);
    // The server records a check only on a Completed class. Mark Class Complete is Overview's
    // action, so the hint links there rather than offering a second way to complete a class.
    const blocked = !row.statusCompleted
      ? null
      : !online
        ? 'Connect to release from here'
        : row.resultsCanonical === null
          ? 'These scores need a reload before they can be released'
          : (verifyBlockedReason ?? releaseBlockedReason);
    title = released ? 'Confirm the scores' : 'Release the results';
    body = released
      ? 'These results are already released. The scores were changed since they were last checked: look them over, then confirm.'
      : 'Look the scores over and fix anything that is off. Release saves the check and makes them visible to exhibitors.';
    action = row.statusCompleted ? (
      <div className="space-y-1">
        <Button
          type="button"
          className="min-h-11"
          disabled={verifying || releasing || hiding || blocked !== null}
          onClick={onRelease}
        >
          {verifying
            ? 'Saving…'
            : releasing
              ? 'Releasing…'
              : released
                ? 'Confirm scores'
                : 'Release results'}
        </Button>
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
    body = 'The scores are checked. Release makes them visible to exhibitors.';
    action = (
      <div className="space-y-1">
        <Button
          type="button"
          className="min-h-11"
          disabled={releasing || verifying || hiding || releaseBlockedReason !== null}
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
    title = 'Print the results sheet and result labels';
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
  releasing,
  online,
  onUndo,
}: Pick<
  ResultsClassDetailProps,
  'row' | 'timeZone' | 'currentUserId' | 'verifying' | 'releasing' | 'online'
> & {
  onUndo: () => void;
}) {
  const by = row.verifiedBy && row.verifiedBy === currentUserId ? 'you' : 'another show manager';
  const at = formatTime(row.verifiedAt, timeZone);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-success/5 px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        Scores checked by {by}
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
          disabled={verifying || releasing || !online}
          onClick={onUndo}
        >
          Undo check
        </Button>
      </span>
    </div>
  );
}

function ResultsTable({ showId, row }: Pick<ResultsClassDetailProps, 'showId' | 'row'>) {
  // Only a scope RESOLVED as non-operator falls back to the ringside flow; while it resolves,
  // the paper page's own route guard is the safety net.
  const manageScope = useShowManageScope(showId);
  const canOperate = !(manageScope.status === 'resolved' && !manageScope.canOperate);
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
              <TableCell>
                <Link
                  to={getFixScoreHref(showId, row.id, entry.entryId, canOperate)}
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
  onHide,
  hiding,
  onRetry,
  onUndoVerify,
  verifying,
  online,
  releaseBlockedReason,
  verifyBlockedReason,
  currentUserId,
  judgeSignOffSlot,
}: ResultsClassDetailProps) {
  // Same rule as the Fix link: only a scope RESOLVED as non-operator is refused; while it
  // resolves, the route guard is the safety net.
  const manageScope = useShowManageScope(showId);
  const releaseTiming = useClassManualReleaseTiming(showId, row.id, row.trialId);
  const canOperate = !(manageScope.status === 'resolved' && !manageScope.canOperate);
  const embedded = useEmbeddedDetail();
  const { search } = useLocation();
  const backParams = new URLSearchParams(search);
  backParams.delete('classId');
  const backQuery = backParams.toString();
  const finished = formatTime(row.finishedAt, timeZone);
  const released = Boolean(row.releasedAt);
  // MYK9-1217: releasing raises two bottom-right toasts, which landed on the Print link at
  // 1280x720. In the desktop pane the paperwork rows are the next thing the secretary clicks, so
  // the toast stack stays above them. Not reserved on the mobile page, where the pane is gone.
  const thenRef = useReserveBottomAbove<HTMLDivElement>(embedded && released);
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
        hiding={hiding}
        onRelease={onRelease}
        online={online}
        releaseBlockedReason={releaseBlockedReason}
        verifyBlockedReason={verifyBlockedReason}
        verifying={verifying}
      />
      {/* A released class always shows Hide; it is enabled only under manual release timing
          (clearing the release changes nothing otherwise), online, and while nothing else runs.
          An unknown release state has no releasedAt, so it offers neither Release nor Hide. */}
      {canOperate && released && (
        <div className="flex justify-end">
          <HideResultsButton
            className={row.name}
            hiding={hiding}
            blockedReason={hideBlockedReason({
              online,
              timing: releaseTiming,
              busy: releasing || verifying,
            })}
            onHide={onHide}
          />
        </div>
      )}
      {row.verifiedAt && row.phase !== 'needs-checking' && (
        <VerifiedLine
          row={row}
          timeZone={timeZone}
          currentUserId={currentUserId}
          verifying={verifying}
          releasing={releasing}
          online={online}
          onUndo={onUndoVerify}
        />
      )}
      <ResultsTable showId={showId} row={row} />
      {judgeSignOffSlot}

      {row.expectedCount > 0 && (
        <div ref={thenRef} className="space-y-2">
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
