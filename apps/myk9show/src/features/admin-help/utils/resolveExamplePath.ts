import type { ExampleIds } from '../types';

type Resolver = (ids: ExampleIds) => string | null;

const makeResolver =
  (build: (ids: ExampleIds) => string, required: (keyof ExampleIds)[]): Resolver =>
  ids =>
    required.every(key => ids[key]) ? build(ids) : null;

/**
 * Hard-coded map of route patterns to resolver functions.
 * Order intentional: longer/more-specific routes are matched by exact-pattern
 * lookup so parent prefixes do not shadow children.
 */
const PATTERN_RESOLVERS: Record<string, Resolver> = {
  // Shows / trials / classes chain
  '/shows/:id': makeResolver(ids => `/shows/${ids.showId}`, ['showId']),
  '/shows/:showId/setup': makeResolver(ids => `/shows/${ids.showId}/setup`, ['showId']),
  '/shows/:showId/show-desk': makeResolver(ids => `/shows/${ids.showId}/show-desk`, ['showId']),
  '/shows/:showId/entry-management': makeResolver(
    ids => `/shows/${ids.showId}/entry-management`,
    ['showId']
  ),
  '/shows/:showId/reports': makeResolver(ids => `/shows/${ids.showId}/reports`, ['showId']),
  '/shows/:showId/results-control': makeResolver(
    ids => `/shows/${ids.showId}/results-control`,
    ['showId']
  ),
  '/shows/:showId/submit-results': makeResolver(
    ids => `/shows/${ids.showId}/submit-results`,
    ['showId']
  ),
  '/shows/:showId/trials/:trialId': makeResolver(
    ids => `/shows/${ids.trialShowId}/trials/${ids.trialId}`,
    ['trialShowId', 'trialId']
  ),
  '/shows/:showId/trials/:trialId/classes/:classId': makeResolver(
    ids => `/shows/${ids.classShowId}/trials/${ids.classTrialId}/classes/${ids.classId}`,
    ['classShowId', 'classTrialId', 'classId']
  ),
  '/shows/:showId/trials/:trialId/classes/:classId/results': makeResolver(
    ids => `/shows/${ids.classShowId}/trials/${ids.classTrialId}/classes/${ids.classId}/results`,
    ['classShowId', 'classTrialId', 'classId']
  ),
  '/trials/:trialId': makeResolver(ids => `/trials/${ids.trialId}`, ['trialId']),
  '/classes/:classId': makeResolver(ids => `/classes/${ids.classId}`, ['classId']),
  '/shows/:showId/register': makeResolver(ids => `/shows/${ids.showId}/register`, ['showId']),

  // Dogs / clubs
  '/dogs/:id': makeResolver(ids => `/dogs/${ids.dogId}`, ['dogId']),
  '/clubs/:id': makeResolver(ids => `/clubs/${ids.clubId}`, ['clubId']),

  // Exhibitor
  '/exhibitor/check-in/:entryId': makeResolver(
    ids => `/exhibitor/check-in/${ids.entryId}`,
    ['entryId']
  ),

  // TV display
  '/tv/:showId': makeResolver(ids => `/tv/${ids.showId}`, ['showId']),

  // Admin — permissions
  '/admin/permissions/roles/:roleId': makeResolver(
    ids => `/admin/permissions/roles/${ids.roleId}`,
    ['roleId']
  ),
  '/admin/permissions/roles/:roleId/clone': makeResolver(
    ids => `/admin/permissions/roles/${ids.roleId}/clone`,
    ['roleId']
  ),
};

/**
 * Paths that are route-complete — no `:param` to substitute — but still cannot
 * be opened cold, because the page needs a query string the directory has no
 * sample value for. Navigating to the bare path lands on an error state, so
 * these resolve to `null` and the row's Go button disables like any other
 * unresolvable entry.
 *
 * /support renders "Ticket not found" without `?ticketId`; its only real entry
 * point is the support notification's deep link.
 */
const QUERY_DEPENDENT_PATHS = new Set(['/support']);

/**
 * Substitute :param tokens in a route pattern with sample ids.
 * - If `pattern` is query-dependent, returns `null` regardless of ids.
 * - If `pattern` has no `:`, it is returned unchanged.
 * - If `pattern` has a `:` and is listed in PATTERN_RESOLVERS, the resolver
 *   returns the substituted path or `null` when any required id is missing.
 * - If `pattern` has a `:` but is not listed, returns `null` (caller should
 *   treat as "unresolvable — disable the Go button").
 */
export function resolveExamplePath(pattern: string, ids: ExampleIds): string | null {
  // Checked before the `:` test: these paths have no param, so the branch below
  // would otherwise hand back an enabled link to a guaranteed error state.
  if (QUERY_DEPENDENT_PATHS.has(pattern)) return null;
  if (!pattern.includes(':')) return pattern;
  const resolver = PATTERN_RESOLVERS[pattern];
  return resolver ? resolver(ids) : null;
}

/** Exported for test invariants that assert every registry pattern has a resolver. Not used in production. */
export const KNOWN_PARAMETERIZED_PATTERNS = Object.keys(PATTERN_RESOLVERS);
