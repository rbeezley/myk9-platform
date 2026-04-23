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

  // Admin — templates
  '/admin/templates/:templateId/edit': makeResolver(
    ids => `/admin/templates/${ids.templateId}/edit`,
    ['templateId']
  ),
  '/admin/templates/:templateId/test': makeResolver(
    ids => `/admin/templates/${ids.templateId}/test`,
    ['templateId']
  ),
};

/**
 * Substitute :param tokens in a route pattern with sample ids.
 * - If `pattern` has no `:`, it is returned unchanged.
 * - If `pattern` has a `:` and is listed in PATTERN_RESOLVERS, the resolver
 *   returns the substituted path or `null` when any required id is missing.
 * - If `pattern` has a `:` but is not listed, returns `null` (caller should
 *   treat as "unresolvable — disable the Go button").
 */
export function resolveExamplePath(pattern: string, ids: ExampleIds): string | null {
  if (!pattern.includes(':')) return pattern;
  const resolver = PATTERN_RESOLVERS[pattern];
  return resolver ? resolver(ids) : null;
}

/** Exported for invariants / tests that need the set of known patterns. */
export const KNOWN_PARAMETERIZED_PATTERNS = Object.keys(PATTERN_RESOLVERS);
