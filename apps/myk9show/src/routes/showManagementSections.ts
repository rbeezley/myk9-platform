/**
 * The secretary show page is ONE row of four tabs, and every tab is a real page
 * (MYK9-630 phase 2; `docs/plan-secretary-show-actions.md`). Overview is
 * `/shows/:id` itself -- the secretary's show home, which absorbed Setup and
 * Show Day (MYK9-957, `docs/plan-secretary-show-home.md`); the other three are
 * children.
 *
 * This file is the single source of that row: the tab strip, the router's
 * child routes, the legacy redirects and the actions registry all read it, so
 * a seventh tab cannot appear in one of them and not the others.
 */

export const SHOW_TAB_IDS = ['overview', 'entries', 'results', 'reports'] as const;

export type ShowTabId = (typeof SHOW_TAB_IDS)[number];

export type ShowManagementSectionPath = 'entries' | 'results' | 'reports';

export interface ShowTabDef {
  id: ShowTabId;
  label: string;
  /** Path segment under `/shows/:id`; empty string for Overview. */
  path: '' | ShowManagementSectionPath;
}

/** The four tabs, in order (owner, 2026-10-02: Setup and Show Day folded into Overview). */
export const SHOW_TABS: readonly ShowTabDef[] = [
  { id: 'overview', label: 'Overview', path: '' },
  { id: 'entries', label: 'Entry Forms', path: 'entries' },
  { id: 'results', label: 'Results', path: 'results' },
  { id: 'reports', label: 'Reports', path: 'reports' },
];

/** The tabs that are child routes of `/shows/:id` (Overview is the index). */
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
export interface LegacyShowSectionTarget {
  /** Tab path; '' is the show home (Overview). */
  path: '' | ShowManagementSectionPath;
  search?: Record<string, string>;
  /** Rewrite the retired Setup tab's own params (`legacySetupToHomeSearch`). */
  fromSetup?: true;
}

export const LEGACY_SHOW_SECTION_REDIRECTS: Readonly<Record<string, LegacyShowSectionTarget>> = {
  // MYK9-957: Show Day and Setup are the home now. The cockpit's own params
  // (day, filter, focus, anchor, tool, view) ride along unchanged.
  'show-day': { path: '' },
  'show-desk': { path: '' },
  setup: { path: '', fromSetup: true },
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
  map: { path: '' },
  trials: { path: '' },
  classes: { path: '', search: { select: 'classes' } },
  'my-entries': { path: 'entries' },
  results: { path: 'results' },
};

/**
 * Every child route path `publicRoutes.tsx` mounts under `/shows/:id` — the
 * five tabs, which render behind `ShowManagementSectionRoute`, plus the legacy URLs
 * that redirect into them (the retired Class Management `classes/:trialId` among
 * them), which render their redirect bare.
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
