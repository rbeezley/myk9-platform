/**
 * Per-show persistence for collapsed trial sections on the at-show class picker.
 *
 * We track which trial sections a judge/steward has COLLAPSED (not which are
 * open). The default is all-open, so an absent/empty record means every trial
 * is expanded — identical to the page's pre-collapse behavior. Collapsing is an
 * additive "reduce the list" affordance layered on top.
 *
 * Mirrors the shape of `features/show-map/showDeskToolsState.ts`: a per-show
 * localStorage key and defensive try/catch. We intentionally do NOT prune
 * against the currently-present trials at load time — the picker's data loads
 * asynchronously, so at first render there are no trial ids to validate
 * against, and filtering then would discard a judge's saved collapse state
 * before the trials arrive. Trial ids are non-reused UUIDs, so any stale id
 * left in the record is inert (it simply never matches a rendered trial).
 */

export function getAtShowCollapsedTrialsStorageKey(showId: string): string {
  return `at-show-collapsed-trials:${showId}`;
}

export function loadCollapsedTrialIds(showId: string): string[] {
  try {
    const raw = window.localStorage.getItem(getAtShowCollapsedTrialsStorageKey(showId));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export function saveCollapsedTrialIds(showId: string, collapsedTrialIds: readonly string[]): void {
  try {
    window.localStorage.setItem(
      getAtShowCollapsedTrialsStorageKey(showId),
      JSON.stringify([...collapsedTrialIds])
    );
  } catch {
    // Preference persistence is non-critical; the picker remains usable.
  }
}
