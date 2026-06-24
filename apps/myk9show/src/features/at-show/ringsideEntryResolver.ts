/**
 * ringsideEntryResolver — pure resolution of "which show(s) should the Ringside
 * entry point send this user to?"
 *
 * The permanent "Ringside" sidebar item points at the bare `/at-show` route. For
 * a signed-in user that route resolves their live show(s) via this function and
 * either auto-jumps (exactly one live show) or renders a chooser/home. Kept pure
 * (no hooks, no async) so the branch logic is unit-testable in isolation; the
 * `useRingsideEntryShows` hook wires the real data sources into it.
 *
 * Three role-self-gating sources feed in (non-applicable roles contribute empty
 * arrays): judge class assignments, the exhibitor "show today" list, and the
 * manager's own shows bucketed by phase.
 *
 * Note on names: judge assignments carry a showId but no show *name* (only the
 * class name), so a judge-only show may resolve with `showName: null`. This is
 * deliberately not enriched with an async lookup — a judge with exactly one live
 * show auto-jumps (no name shown), and a judge simultaneously live at 2+
 * different shows is not physically possible, so the nameless-chooser case is
 * vanishingly rare. The exhibitor/manager sources always carry names.
 */

/** A judge class assignment, narrowed to the fields the resolver needs. */
export interface JudgeClassSource {
  showId: string;
  /** Dashboard status: 'in-progress' means the ring is live right now. */
  status: 'completed' | 'in-progress' | 'pending';
  /** Trial date as 'YYYY-MM-DD' in the trial's local zone. */
  trialDate: string;
}

/** A named show reference from the exhibitor "today" or manager sources. */
export interface NamedShowSource {
  showId: string;
  showName: string;
}

export interface ResolveRingsideEntryInput {
  judgeClasses: JudgeClassSource[];
  exhibitorToday: NamedShowSource[];
  managerToday: NamedShowSource[];
  managerUpcoming: NamedShowSource[];
  /** Today's date as 'YYYY-MM-DD' in the viewer's local zone. */
  todayISO: string;
}

export interface RingsideShowRef {
  showId: string;
  showName: string | null;
  phase: 'live' | 'upcoming';
}

export interface ResolveRingsideEntryResult {
  liveShows: RingsideShowRef[];
  upcomingShows: RingsideShowRef[];
}

/** Prefer a real name over null when the same show arrives from two sources. */
function mergeName(existing: string | null, incoming: string | null): string | null {
  return existing ?? incoming;
}

/** Deterministic order: named shows first (alphabetical), then nameless by id. */
function sortRefs(refs: RingsideShowRef[]): RingsideShowRef[] {
  return [...refs].sort((a, b) => {
    if (a.showName && b.showName) return a.showName.localeCompare(b.showName);
    if (a.showName) return -1;
    if (b.showName) return 1;
    return a.showId.localeCompare(b.showId);
  });
}

export function resolveRingsideEntry(
  input: ResolveRingsideEntryInput
): ResolveRingsideEntryResult {
  const { judgeClasses, exhibitorToday, managerToday, managerUpcoming, todayISO } = input;

  // ── Live (today / in-progress) — keyed by showId so the same show from
  //    multiple sources collapses to one entry, keeping the best-known name. ──
  const live = new Map<string, string | null>();
  const addLive = (showId: string, name: string | null) => {
    live.set(showId, mergeName(live.get(showId) ?? null, name));
  };

  for (const jc of judgeClasses) {
    if (jc.status === 'in-progress' || jc.trialDate === todayISO) addLive(jc.showId, null);
  }
  for (const s of exhibitorToday) addLive(s.showId, s.showName);
  for (const s of managerToday) addLive(s.showId, s.showName);

  // ── Upcoming — anything not already live. Manager upcoming carries names;
  //    judge future assignments contribute a nameless ref. ──
  const upcoming = new Map<string, string | null>();
  const addUpcoming = (showId: string, name: string | null) => {
    if (live.has(showId)) return;
    upcoming.set(showId, mergeName(upcoming.get(showId) ?? null, name));
  };

  for (const s of managerUpcoming) addUpcoming(s.showId, s.showName);
  for (const jc of judgeClasses) {
    if (jc.status !== 'completed' && jc.trialDate > todayISO) addUpcoming(jc.showId, null);
  }

  const toRefs = (m: Map<string, string | null>, phase: RingsideShowRef['phase']) =>
    sortRefs(Array.from(m, ([showId, showName]) => ({ showId, showName, phase })));

  return {
    liveShows: toRefs(live, 'live'),
    upcomingShows: toRefs(upcoming, 'upcoming'),
  };
}
