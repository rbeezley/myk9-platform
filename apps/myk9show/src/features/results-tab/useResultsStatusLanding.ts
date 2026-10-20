import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ResultsClassPhase } from './resultsNextAction';
import { shouldLandOnAllStatus, writeResultsTabUrlState } from './resultsTabRoutes';

/**
 * MYK9-1276, smallest change only: a link with no `status` opens Results on All when no class
 * needs the secretary. Whether the link named a status is captured per show at render time. The
 * decision is spent only once classes have loaded (an empty first read does not spend it), uses
 * that first loaded read, and is written with `replace` so Back is not polluted. An explicit
 * `?status=needs-me` keeps the empty Needs me list.
 */
export function useResultsStatusLanding(
  showId: string,
  loaded: boolean,
  rows: readonly { phase: ResultsClassPhase }[]
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  // Captured at the first render (the show id may resolve a render later, after the page's
  // param sync has run) and again whenever the page moves from one show to another.
  const [captured, setCaptured] = useState<{ showId: string | null; named: boolean }>(() => ({
    showId: showId || null,
    named: searchParams.has('status'),
  }));
  if (showId && captured.showId !== showId) {
    setCaptured({
      showId,
      named: captured.showId === null ? captured.named : searchParams.has('status'),
    });
  }
  const named = captured.showId === showId ? captured.named : null;
  const decidedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!showId || named === null || decidedFor.current === showId) return;
    if (!loaded || rows.length === 0) return;
    decidedFor.current = showId;
    if (shouldLandOnAllStatus(named, rows)) {
      setSearchParams(previous => writeResultsTabUrlState(previous, { status: 'all' }), {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [showId, named, loaded, rows, setSearchParams]);
}
