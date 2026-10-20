import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  shouldLandOnAllQueues,
  urlNamesQueue,
  writeCockpitQueues,
  type EntryManagementCockpitState,
} from '@/components/entries/management/entryManagementCockpitParams';
import type { ShowRegistrationGroup } from '@/components/entries/management/showRegistrationProjection';

interface UseEntryQueueLandingOptions {
  showId: string | null;
  /** True once this show's registrations have loaded without error. */
  loaded: boolean;
  /** Whether the Registrations tab (not an exception pane) is the one open. */
  onRegistrationsTab: boolean;
  groups: readonly ShowRegistrationGroup[];
  /** The cockpit's own view, so the rule sees what the table would show. */
  state: Pick<EntryManagementCockpitState, 'search' | 'trialIds' | 'classIds'>;
  /** The selected trials' class ids; `undefined` while they are unknown. */
  trialClassIds: readonly string[] | undefined;
}

/**
 * MYK9-1276: a link that names no queue opens Entry Forms on All when Needs review would show
 * nothing but All would. Per show, whether the link named a queue is captured at RENDER time,
 * when the show id first appears and before the page's param-sync effect strips an explicit
 * `queue=needs-review` as the default. The decision is spent only when the rule was actually
 * evaluated: on the Registrations tab, with forms loaded and the trial scope known. It uses the
 * first loaded read, so a later replica refill does not re-decide. It is written into the URL
 * (never over a URL that names a queue by then, e.g. a Pull link opened from an exception pane)
 * with `replace`, so `cockpit.state.queues` stays the one source of queue state and Back is not
 * polluted. Declare it after the page's param-sync effect.
 */
export function useEntryQueueLanding({
  showId,
  loaded,
  onRegistrationsTab,
  groups,
  state,
  trialClassIds,
}: UseEntryQueueLandingOptions): void {
  const [searchParams, setSearchParams] = useSearchParams();
  // Captured at the first render (the show id may resolve a render later, after the page's
  // param sync has run) and again whenever the page moves from one show to another.
  const [captured, setCaptured] = useState<{ showId: string | null; named: boolean }>(() => ({
    showId: showId || null,
    named: urlNamesQueue(searchParams),
  }));
  if (showId && captured.showId !== showId) {
    setCaptured({
      showId,
      named: captured.showId === null ? captured.named : urlNamesQueue(searchParams),
    });
  }
  const named = captured.showId === showId ? captured.named : null;
  const decidedFor = useRef<string | null>(null);
  const scopeKnown = state.trialIds.length === 0 || trialClassIds !== undefined;

  useEffect(() => {
    if (!showId || named === null || decidedFor.current === showId) return;
    if (!loaded || !onRegistrationsTab || !scopeKnown || groups.length === 0) return;
    decidedFor.current = showId;
    const view = {
      search: state.search,
      classIds: state.classIds,
      trialClassIds: state.trialIds.length > 0 ? trialClassIds : undefined,
    };
    if (shouldLandOnAllQueues(named || urlNamesQueue(searchParams), groups, view)) {
      setSearchParams(previous => writeCockpitQueues(previous, ['all']), {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    showId,
    named,
    loaded,
    onRegistrationsTab,
    scopeKnown,
    groups,
    state,
    trialClassIds,
    searchParams,
    setSearchParams,
  ]);
}
