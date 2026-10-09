import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ListChecks } from 'lucide-react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { MASTER_DETAIL_QUERY, MasterDetailLayout } from '@/components/layout/MasterDetailLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getTrialTimezone } from '@/features/registries';
import { useJudgeSignOffMutations } from '@/features/show-map/useJudgeSignOffMutations';
import { useResultsVerifiedMutations } from '@/features/show-map/useResultsVerifiedMutations';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useReleaseResults } from '@/hooks/mutations/useReleaseResults';
import type { ResultsClassRow } from './buildResultsClassRows';
import { ResultsClassDetail } from './ResultsClassDetail';
import { ResultsClassList } from './ResultsClassList';
import { ResultsJudgeSignOff } from './ResultsJudgeSignOff';
import { buildJudgeSignOffGroup } from './judgeSignOffGroup';
import { ResultsTabToolbar } from './ResultsTabToolbar';
import { ResultsVisibilitySheet } from './ResultsVisibilitySheet';
import { matchesResultsStatusFilter } from './resultsNextAction';
import {
  getResultsStepHref,
  readResultsTabUrlState,
  writeResultsTabUrlState,
  type ResultsTabUrlState,
} from './resultsTabRoutes';
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
 * Every class that ran has been released and the judge has signed off on it: time to point at
 * Submit and Close.
 */
function everyClassReleasedAndInitialed(rows: readonly ResultsClassRow[]): boolean {
  const ran = rows.filter(row => row.phase !== 'cancelled' && row.phase !== 'no-dogs');
  return (
    ran.length > 0 && ran.every(row => Boolean(row.releasedAt) && row.judgeSignedOffAt !== null)
  );
}

/**
 * The Results tab (MYK9-1031, part 1): the classes whose scoring is complete, with each one's
 * scores beside it, laid out like the Entry Forms tab. A class lives on Overview until scoring is
 * complete and on Results from then on; an unfinished class links back to Overview.
 *
 * The page owns only the URL state and the release call. Reads are `useResultsTabData`'s, and
 * Release is the mutation `ResultsBulkBar` has always used (`useReleaseResults`).
 */
export default function ResultsTab() {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const state = readResultsTabUrlState(searchParams);
  const { rows, trials, readState, retry, refreshFailed, paperworkAvailable } =
    useResultsTabData(showId);
  const release = useReleaseResults();
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const verification = useResultsVerifiedMutations();
  const isOnline = useIsOnline();
  const judgeSignOff = useJudgeSignOffMutations();
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const timeZone = getTrialTimezone(trials[0]);

  const update = useCallback(
    (next: Partial<ResultsTabUrlState>) =>
      setSearchParams(previous => writeResultsTabUrlState(previous, next), {
        replace: true,
        preventScrollReset: true,
      }),
    [setSearchParams]
  );

  const visibleRows = useMemo(
    () =>
      rows.filter(
        row =>
          // The class a link points at stays listed whatever the filters say: Overview deep-links
          // with classId/trialId only, and the default "Needs me" filter would otherwise hide it.
          row.id === state.classId ||
          ((state.trialId === null || row.trialId === state.trialId) &&
            matchesResultsStatusFilter(row.phase, state.status) &&
            rowMatchesSearch(row, state.search))
      ),
    [rows, state.classId, state.search, state.status, state.trialId]
  );
  const selected = rows.find(row => row.id === state.classId) ?? null;

  const judgeGroup = useMemo(
    () => (selected?.runFinished ? buildJudgeSignOffGroup(showId, rows, selected.id) : null),
    [rows, selected, showId]
  );

  const handleRelease = (row: ResultsClassRow) => {
    // Release in this tab waits for the paper check (the server does not, by design).
    if (row.phase !== 'ready-to-release') return;
    release.mutate(
      { classIds: [row.id], showId },
      {
        onSuccess: ({ released }) =>
          released.length > 0
            ? toast.success('Results released')
            : toast.error('Could not release the results. Try again.'),
        onError: () => toast.error('Could not release the results. Try again.'),
      }
    );
  };

  if (readState === 'loading') {
    return (
      <div className="mt-4">
        <LoadingSkeleton variant="cards" count={3} />
      </div>
    );
  }
  if (readState === 'failed' || readState === 'unavailable') {
    return (
      <Alert variant={readState === 'failed' ? 'destructive' : 'default'} className="mt-4">
        <AlertTitle>Couldn&apos;t load the scores</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            The class list can&apos;t be trusted until the scores load. Check your connection and
            try again.
          </span>
          <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const list =
    visibleRows.length > 0 ? (
      <ResultsClassList showId={showId} rows={visibleRows} selectedId={selected?.id ?? null} />
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
      releasing={release.isPending}
      onRelease={() => handleRelease(selected)}
      onRetry={retry}
      onVerify={() => verification.verifyAsync({ classId: selected.id })}
      onUndoVerify={() => verification.undo({ classId: selected.id })}
      verifying={verification.isPending}
      online={isOnline}
      currentUserId={user?.id ?? null}
      judgeSignOffSlot={
        judgeGroup ? (
          <ResultsJudgeSignOff
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
      {refreshFailed && (
        <Alert>
          <AlertTitle>Couldn&apos;t refresh the scores</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>What is shown may be out of date. Check your connection and try again.</span>
            <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {everyClassReleasedAndInitialed(rows) && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Every class is released and signed off</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Next: submit the results to the registry, then close the show.</span>
            <Link
              to={getResultsStepHref(showId, 'submit')}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
            >
              Submit to registry
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to={getResultsStepHref(showId, 'close')}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
            >
              Close the show
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <MasterDetailLayout
        id="results-classes"
        listLabel="Classes"
        detailLabel="Class results"
        listHeader={
          <ResultsTabToolbar
            showId={showId}
            state={state}
            trials={trials}
            rows={rows}
            timeZone={timeZone}
            paperworkAvailable={paperworkAvailable}
            onRetry={retry}
            onChange={update}
            onOpenVisibility={() => setVisibilityOpen(true)}
          />
        }
        list={list}
        detail={detail}
      />
      <ResultsVisibilitySheet open={visibilityOpen} onOpenChange={setVisibilityOpen} />
    </div>
  );
}
