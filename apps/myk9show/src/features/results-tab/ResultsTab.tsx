import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ListChecks } from 'lucide-react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { MASTER_DETAIL_QUERY, MasterDetailLayout } from '@/components/layout/MasterDetailLayout';
import { CarriedClassNotice } from '@/components/shows/ShowDetails/CarriedClassNotice';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getTrialTimezone } from '@/features/registries';
import { useJudgeSignOffMutations } from '@/features/show-map/useJudgeSignOffMutations';
import { useResultsVerifiedMutations } from '@/features/show-map/useResultsVerifiedMutations';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useReleaseResults } from '@/hooks/mutations/useReleaseResults';
import { useUnreleaseResults } from '@/hooks/mutations/useUnreleaseResults';
import type { ResultsClassRow } from './buildResultsClassRows';
import { CoinFlipPanel } from './CoinFlipPanel';
import { NationalsLeaderboardLink, NationalsLeaderboardView } from './NationalsLeaderboardView';
import { ResultsRefreshFailedAlert } from './ResultsRefreshFailedAlert';
import { ResultsClassDetail } from './ResultsClassDetail';
import { ResultsClassList } from './ResultsClassList';
import { BulkReleaseBar } from './BulkReleaseBar';
import { useBulkRelease } from './useBulkRelease';
import {
  OFFLINE_RELEASE_REASON,
  releaseClassRow,
  type ReleaseClassRowDeps,
} from './releaseClassRow';
import { calculateResultsRowsLeft } from '@/features/show-closeout/fromResultsRows';
import { openClassListLine } from '@/features/show-closeout/finishList';
import { ResultsPackets } from './ResultsPackets';
import { ResultsJudgeSignOff } from './ResultsJudgeSignOff';
import { buildJudgeSignOffGroup } from './judgeSignOffGroup';
import { ResultsTabToolbar } from './ResultsTabToolbar';
import { ResultsVisibilitySheet } from './ResultsVisibilitySheet';
import { deriveDefaultResultsStatus, matchesResultsStatusFilter } from './resultsNextAction';
import {
  effectiveReadState,
  getShowIdParam,
  isNationalsLeaderboardView,
  readResultsTabUrlState,
  writeResultsTabUrlState,
  type ResultsTabUrlState,
  type ResultsTabViewState,
} from './resultsTabRoutes';
import { classRowSyncBlockedReason, useClassRowSyncState } from './useClassRowSyncState';
import { useClassUnsyncedScores } from './useClassUnsyncedScores';
import { useResultsTabData } from './useResultsTabData';

function rowMatchesSearch(row: ResultsClassRow, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return (
    [row.name, row.trialLabel, row.judgeName].some(text => text.toLowerCase().includes(query)) ||
    row.entries.some(
      entry =>
        entry.dogName.toLowerCase().includes(query) ||
        entry.handlerName.toLowerCase().includes(query) ||
        entry.armband === query
    )
  );
}

/**
 * The Results tab (MYK9-1031, part 1): the classes whose scoring is complete, with each one's
 * scores beside it, laid out like the Entry Forms tab. A class lives on Overview until scoring is
 * complete and on Results from then on; an unfinished class links back to Overview.
 *
 * The page owns only the URL state and the release call. Reads are `useResultsTabData`'s, and
 * Release is the `useReleaseResults` mutation; this is the one place a class is released (MYK9-1318).
 */
export default function ResultsTab({ showStatsLink }: { showStatsLink?: ReactNode } = {}) {
  const showId = getShowIdParam(useParams<{ showId?: string; id?: string }>());
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = readResultsTabUrlState(searchParams);
  const {
    rows,
    entries,
    showStartDate,
    isNationals,
    rankingKeyState,
    trials,
    readState,
    retry,
    refreshFailed,
    flaggedPulls,
  } = useResultsTabData(showId);
  // The default status is derived live from the rows the view would list and never written to the
  // URL; a status the URL names always wins (MYK9-1276).
  const defaultStatus = useMemo(
    () =>
      deriveDefaultResultsStatus(
        readState === 'ready'
          ? rows.filter(
              row =>
                (urlState.trialId === null || row.trialId === urlState.trialId) &&
                rowMatchesSearch(row, urlState.search)
            )
          : []
      ),
    [readState, rows, urlState.search, urlState.trialId]
  );
  const state: ResultsTabViewState = { ...urlState, status: urlState.status ?? defaultStatus };
  const release = useReleaseResults();
  const unrelease = useUnreleaseResults();
  const { pathname, search } = useLocation();
  const judgeSignOff = useJudgeSignOffMutations();
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const verification = useResultsVerifiedMutations();
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);
  const [visibilityOpen, setVisibilityOpen] = useState(
    () => searchParams.get('visibility') === '1'
  );
  const [coinFlipOpen, setCoinFlipOpen] = useState(false);
  // The link's `visibility=1` only seeds the sheet; drop it so a refresh or Back does not reopen it.
  const hasVisibilityParam = searchParams.has('visibility');
  useEffect(() => {
    if (!hasVisibilityParam) return;
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete('visibility');
        return next;
      },
      { replace: true }
    );
  }, [hasVisibilityParam, setSearchParams]);
  const timeZone = getTrialTimezone(trials[0]);

  const update = useCallback(
    (next: Partial<ResultsTabUrlState>) =>
      setSearchParams(previous => writeResultsTabUrlState(previous, next), {
        replace: true,
        preventScrollReset: true,
      }),
    [setSearchParams]
  );

  // Print all ready is a shortcut to the Needs printing filter: the print rows live in each
  // class's detail. Beside the list (desktop) the first match opens so they are on screen at once;
  // below `lg` selecting a class replaces the list, so only the filter is applied and the list
  // shows the classes to open one by one.
  const printAllReady = () => {
    const first = rows.find(row => matchesResultsStatusFilter(row.phase, 'needs-printing'));
    update({
      status: 'needs-printing',
      trialId: null,
      search: '',
      ...(isWide && first ? { classId: first.id } : { classId: null }),
    });
  };

  // A "Finish the show" line's link (`?left=<key>`) lists exactly the classes that line counted,
  // from the same calculation, whatever their phase (MYK9-1945).
  // Only an open line filters: a stale link to a line that is now done shows the unfiltered list.
  const leftCalc = useMemo(() => calculateResultsRowsLeft(rows, trials), [rows, trials]);
  const leftLine = useMemo(
    () => (state.left === null ? null : openClassListLine(showId, leftCalc, state.left)),
    [leftCalc, showId, state.left]
  );
  const visibleRows = useMemo(() => {
    const leftIds = leftLine ? new Set(leftLine.classIds) : null;
    return rows.filter(
      row =>
        // The class a link points at stays listed whatever the filters say: Overview deep-links
        // with classId/trialId only, and the default "Needs me" filter would otherwise hide it.
        row.id === state.classId ||
        ((state.trialId === null || row.trialId === state.trialId) &&
          (leftIds ? leftIds.has(row.id) : matchesResultsStatusFilter(row.phase, state.status)) &&
          rowMatchesSearch(row, state.search))
    );
  }, [leftLine, rows, state.classId, state.search, state.status, state.trialId]);
  const selected = rows.find(row => row.id === state.classId) ?? null;
  const unsyncedScores = useClassUnsyncedScores(selected?.id ?? null);
  // The saved check reaches this device through a class sync, which a dirty or conflicted class row
  // refuses; say so up front instead of letting the click look like it did nothing (MYK9-1113).
  const classRowSync = useClassRowSyncState(selected?.id ?? null);
  const verifyBlockedReason = classRowSyncBlockedReason(classRowSync);
  const [releaseChecking, setReleaseChecking] = useState(false);
  // Bumped whenever the check is taken back, so a Release already reading the server can tell.
  const checkGeneration = useRef(0);
  // Release on this tab asks the SERVER whether the class is checked, so it needs a connection and
  // no score change of the class still waiting to sync (the answer would describe older results).
  const releaseBlockedReason = !isOnline
    ? OFFLINE_RELEASE_REASON
    : unsyncedScores !== false
      ? 'Waiting for score changes to be sent'
      : null;

  const judgeGroup = useMemo(
    () => (selected?.runFinished ? buildJudgeSignOffGroup(showId, rows, selected.id) : null),
    [rows, selected, showId]
  );

  // The deps one release needs; `checkChanged` is fixed at the moment the release starts.
  const releaseDeps = (
    verifyBlocked: string | null,
    releaseBlocked: string | null,
    quietVerify = false
  ): ReleaseClassRowDeps => {
    const generationAtClick = checkGeneration.current;
    return {
      showId,
      verification,
      release,
      quietVerify,
      checkChanged: () => checkGeneration.current !== generationAtClick,
      verifyBlockedReason: verifyBlocked,
      releaseBlockedReason: releaseBlocked,
    };
  };

  const handleRelease = async (row: ResultsClassRow) => {
    if (unrelease.isPending) return;
    // Held for the WHOLE verify and preflight, so Undo and the button stay disabled until the
    // release is queued or the preflight gives up.
    setReleaseChecking(true);
    try {
      const outcome = await releaseClassRow(
        row,
        releaseDeps(verifyBlockedReason, releaseBlockedReason)
      );
      if (outcome.kind === 'released' && outcome.announce) toast.success('Results released');
      else if (outcome.kind === 'failed' && !outcome.toasted) toast.error(outcome.message);
    } finally {
      setReleaseChecking(false);
    }
  };

  const bulk = useBulkRelease({
    rows: visibleRows,
    isOnline,
    busy: release.isPending || releaseChecking || verification.isPending || unrelease.isPending,
    setBusy: setReleaseChecking,
    releaseDeps,
  });

  const handleHide = (row: ResultsClassRow) => {
    // The button is disabled in these states; this keeps a stale click from racing a release.
    if (release.isPending || releaseChecking || verification.isPending || !isOnline) return;
    unrelease.mutate(
      { classIds: [row.id], showId },
      {
        onSuccess: ({ unreleased }) =>
          unreleased.length > 0
            ? toast.success('Results hidden')
            : toast.error('Could not hide the results. Try again.'),
        onError: () => toast.error('Could not hide the results. Try again.'),
      }
    );
  };

  // A direct leaderboard URL waits on the nationals flag instead of guessing: the class list is
  // shown only once the show is known not to be nationals (MYK9-1516).
  const shownReadState = effectiveReadState(readState, searchParams, rankingKeyState);
  if (shownReadState === 'loading') {
    return (
      <div className="mt-4">
        <LoadingSkeleton variant="cards" count={3} />
      </div>
    );
  }
  if (shownReadState === 'failed' || shownReadState === 'unavailable') {
    return (
      <Alert variant={shownReadState === 'failed' ? 'destructive' : 'default'} className="mt-4">
        <AlertTitle>Couldn&apos;t load the scores</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            The class list can&apos;t be trusted until the scores load. Check your connection and
            try again.
          </span>
          <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Only a nationals show has the board; the URL alone never opens it elsewhere.
  if (isNationalsLeaderboardView(searchParams, isNationals)) {
    return (
      <NationalsLeaderboardView
        showId={showId}
        entries={entries}
        rows={rows}
        showStartDate={showStartDate}
        refreshFailed={refreshFailed}
        onRetry={retry}
      />
    );
  }

  const list =
    visibleRows.length > 0 ? (
      <>
        <BulkReleaseBar bulk={bulk} />
        <ResultsClassList
          showId={showId}
          rows={visibleRows}
          selectedId={selected?.id ?? null}
          ticks={bulk.ticks}
        />
      </>
    ) : (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {rows.length === 0 ? (
          <p>This show has no classes yet.</p>
        ) : state.status === 'needs-me' && !state.search && !state.trialId ? (
          <>
            <ListChecks className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
            <p className="font-medium text-foreground">Nothing needs you right now.</p>
            <Button
              type="button"
              variant="link"
              className="min-h-11"
              onClick={() => update({ status: 'all' })}
            >
              Show all classes
            </Button>
          </>
        ) : (
          <>
            <p>No classes match these filters.</p>
            <Button
              type="button"
              variant="link"
              className="min-h-11"
              onClick={() => update({ status: 'all', trialId: null, search: '' })}
            >
              Show all classes
            </Button>
          </>
        )}
      </div>
    );

  const detail = selected ? (
    <ResultsClassDetail
      key={selected.id}
      showId={showId}
      row={selected}
      timeZone={timeZone}
      releasing={release.isPending || releaseChecking}
      onRelease={() => handleRelease(selected)}
      onHide={() => handleHide(selected)}
      hiding={unrelease.isPending}
      onRetry={retry}
      onUndoVerify={() => {
        checkGeneration.current += 1;
        verification.undo({ classId: selected.id, trialId: selected.trialId });
      }}
      releaseBlockedReason={releaseBlockedReason}
      verifyBlockedReason={verifyBlockedReason}
      verifying={verification.isPending}
      online={isOnline}
      onRecordCoinFlip={() => setCoinFlipOpen(true)}
      currentUserId={user?.id ?? null}
      judgeSignOffSlot={
        judgeGroup ? (
          <ResultsJudgeSignOff
            showId={showId}
            group={judgeGroup}
            returnTo={`${pathname}${search}`}
            pending={judgeSignOff.isPending}
            onRecord={classIds =>
              judgeSignOff.recordSignOff({ classIds, registryId: judgeGroup.registryId })
            }
            onUndo={classId =>
              judgeSignOff.clearSignOff({ classIds: [classId], registryId: judgeGroup.registryId })
            }
          />
        ) : null
      }
    />
  ) : isWide ? (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <ListChecks className="h-8 w-8" aria-hidden="true" />
      <p className="text-sm">Select a class to check its scores</p>
    </div>
  ) : null;

  return (
    <div className="mt-4 space-y-4">
      <h1 className="sr-only">Results</h1>
      {refreshFailed && <ResultsRefreshFailedAlert onRetry={retry} />}
      {showStatsLink && entries.some(entry => entry.is_scored === true) && showStatsLink}
      <NationalsLeaderboardLink showId={showId} isNationals={isNationals} />
      <ResultsPackets
        showId={showId}
        trials={trials}
        rows={rows}
        entries={entries}
        entriesTrusted={!refreshFailed}
        flaggedPulls={flaggedPulls}
        timeZone={timeZone}
      />
      {state.classId && !selected && <CarriedClassNotice />}
      {leftLine && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm" role="status">
          <span>Showing the classes behind &ldquo;{leftLine.label}&rdquo;</span>
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-11 p-0"
            onClick={() => update({ left: null })}
          >
            Show all classes
          </Button>
        </p>
      )}
      <MasterDetailLayout
        id="results-classes"
        listLabel="Classes"
        detailLabel="Class results"
        listHeader={
          <ResultsTabToolbar
            state={state}
            trials={trials}
            rows={rows}
            onChange={update}
            onPrintAllReady={printAllReady}
            onOpenVisibility={() => setVisibilityOpen(true)}
          />
        }
        list={list}
        detail={detail}
      />
      <ResultsVisibilitySheet open={visibilityOpen} onOpenChange={setVisibilityOpen} />
      {selected && (
        <CoinFlipPanel
          showId={showId}
          row={selected}
          isNationals={isNationals}
          rankingKeyState={rankingKeyState}
          onRetry={retry}
          online={isOnline}
          open={coinFlipOpen}
          onOpenChange={setCoinFlipOpen}
        />
      )}
    </div>
  );
}
