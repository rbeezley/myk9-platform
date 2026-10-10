/**
 * Scoresheet ↔ entry-list routes for the at-show flow.
 *
 * A combined Novice A/B list (`/at-show/:showId/class/:classIdA/:classIdB`)
 * opens each dog's scoresheet under that dog's OWN class id, so the scoresheet
 * URL alone cannot say which list it came from. The pair rides along as
 * `?combined=<classIdA>,<classIdB>` so "Back to Entry List" — and the next dog
 * picked after a save — return to the combined list, not the single section.
 * A query (not router state) survives a reload of the scoresheet.
 */

export const COMBINED_PARAM = 'combined';

export function buildAtShowScoreSheetRoute(
  showId: string,
  classId: string,
  entryId: string,
  combined?: string | null
): string {
  const route = `/at-show/${showId}/class/${classId}/score/${entryId}`;
  if (!combined) return route;
  return `${route}?${new URLSearchParams({ [COMBINED_PARAM]: combined }).toString()}`;
}

/** The pair as it appears in the combined list's URL: A first, then B. */
export function combinedPairParam(classIdA: string, classIdB: string): string {
  return `${classIdA},${classIdB}`;
}

/**
 * The entry list a scoresheet returns to: the combined A/B list when `combined`
 * names exactly two distinct classes that include this one, else the single
 * class list.
 */
export function resolveScoreSheetEntryListRoute(
  showId: string,
  classId: string,
  combined: string | null
): string {
  const single = `/at-show/${showId}/class/${classId}`;
  const ids = combined?.split(',') ?? [];
  if (ids.length !== 2) return single;
  const [classIdA, classIdB] = ids;
  if (!classIdA || !classIdB || classIdA === classIdB) return single;
  if (classId !== classIdA && classId !== classIdB) return single;
  return `/at-show/${showId}/class/${classIdA}/${classIdB}`;
}
