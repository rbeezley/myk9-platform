/**
 * The secretary show page is ONE row of six tabs, and every tab is a real page
 * (MYK9-630 phase 2; `docs/plan-secretary-show-actions.md` § "Phase 2 — one row
 * of six tabs"). Overview is `/shows/:id` itself; the other five are children.
 *
 * This file is the single source of that row: the tab strip, the router's
 * child routes, the legacy redirects and the actions registry all read it, so
 * a seventh tab cannot appear in one of them and not the others.
 */

export const SHOW_TAB_IDS = [
  'overview',
  'setup',
  'entries',
  'show-day',
  'results',
  'reports',
] as const;

export type ShowTabId = (typeof SHOW_TAB_IDS)[number];

export type ShowManagementSectionPath = 'setup' | 'entries' | 'show-day' | 'results' | 'reports';

export interface ShowTabDef {
  id: ShowTabId;
  label: string;
  /** Path segment under `/shows/:id`; empty string for Overview. */
  path: '' | ShowManagementSectionPath;
}

/** The six tabs, in the decided order (Richard, 2026-09-17). */
export const SHOW_TABS: readonly ShowTabDef[] = [
  { id: 'overview', label: 'Overview', path: '' },
  { id: 'setup', label: 'Setup', path: 'setup' },
  { id: 'entries', label: 'Entries', path: 'entries' },
  { id: 'show-day', label: 'Show Day', path: 'show-day' },
  { id: 'results', label: 'Results', path: 'results' },
  { id: 'reports', label: 'Reports', path: 'reports' },
];

/** The five tabs that are child routes of `/shows/:id` (Overview is the index). */
export const SHOW_MANAGEMENT_SECTIONS: readonly {
  id: ShowTabId;
  label: string;
  path: ShowManagementSectionPath;
}[] = SHOW_TABS.filter(
  (tab): tab is ShowTabDef & { path: ShowManagementSectionPath } => tab.path !== ''
);

/**
 * Every URL the five-link row and the old section nav ever produced, and the
 * tab it now lands on. Bookmarks, the sidebar, e2e specs and the phase-1
 * actions registry all still emit these, so each one stays a real route that
 * redirects rather than a 404.
 *
 * `submit-results` carries a query param instead of its own route: Submit
 * Results is a STEP inside Results now, not a peer of it.
 */
export const LEGACY_SHOW_SECTION_REDIRECTS: Readonly<
  Record<string, { path: ShowManagementSectionPath; search?: Record<string, string> }>
> = {
  'show-desk': { path: 'show-day' },
  'entry-management': { path: 'entries' },
  'results-control': { path: 'results' },
  'submit-results': { path: 'results', search: { step: 'submit' } },
};

/**
 * `?tab=` forms the show page used to write into the address bar, and the tab
 * each one is now. A MANAGER arriving with one is redirected into the matching
 * page; an exhibitor keeps their own `?tab=` strip, which this map never
 * touches (see `ShowDetailsPage`).
 */
export const LEGACY_SHOW_TAB_PARAM_REDIRECTS: Readonly<
  Record<string, { path: '' | ShowManagementSectionPath; search?: Record<string, string> }>
> = {
  overview: { path: '' },
  map: { path: 'setup', search: { section: 'map' } },
  trials: { path: 'setup', search: { section: 'trials' } },
  classes: { path: 'setup', search: { section: 'classes' } },
  'my-entries': { path: 'entries' },
  results: { path: 'results' },
};

/**
 * Every child route path `publicRoutes.tsx` mounts under `/shows/:id` behind
 * `ShowManagementSectionRoute` — the five tabs, the legacy URLs that redirect
 * into them, and Class Management, which is reached FROM Setup and has no tab
 * of its own.
 *
 * It is the list, not a summary of it: the wizard-surface blocklist and the
 * actions registry's shell predicate both read it, and both were wrong about
 * `classes/:trialId` when they carried their own copies.
 */
export const SHOW_MANAGEMENT_CHILD_ROUTE_PATHS: readonly string[] = [
  ...SHOW_MANAGEMENT_SECTIONS.map(section => section.path),
  ...Object.keys(LEGACY_SHOW_SECTION_REDIRECTS),
  'classes/:trialId',
  'classes/:trialId/create',
];

/** First segment of each of those, for predicates that match on the segment. */
export const SHOW_SHELL_CHILD_SEGMENTS: readonly string[] = [
  ...new Set(SHOW_MANAGEMENT_CHILD_ROUTE_PATHS.map(path => path.split('/')[0]!)),
];
