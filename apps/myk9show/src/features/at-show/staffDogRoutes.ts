import type { StaffDogTab } from './staffDogIndex';

export function atShowDogPath(showId: string, dogKey: string): string {
  return `/at-show/${showId}/dogs/${encodeURIComponent(dogKey)}`;
}

const tabKey = (showId: string | undefined) => `at-show-dogs-tab:${showId ?? ''}`;

/** The chosen tab is kept for the browser session (v3 behaviour); storage may be blocked. */
export function loadDogTab(showId: string | undefined): StaffDogTab {
  try {
    return sessionStorage.getItem(tabKey(showId)) === 'favorites' ? 'favorites' : 'all';
  } catch {
    return 'all';
  }
}

export function saveDogTab(showId: string | undefined, tab: StaffDogTab): void {
  try {
    sessionStorage.setItem(tabKey(showId), tab);
  } catch {
    // Storage blocked: the tab simply resets on the next visit.
  }
}

/** The class entry list for a class, or the combined list for an A/B pair run together. */
export function atShowClassPath(showId: string, classIds: readonly string[]): string {
  return classIds.length === 2
    ? `/at-show/${showId}/class/${classIds[0]}/${classIds[1]}`
    : `/at-show/${showId}/class/${classIds[0]}`;
}
