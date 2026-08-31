/**
 * Route table for the a11y/geometry measurement sweep.
 *
 * Deliberately broader than `route-health-by-role.spec.ts`, which visits the
 * subset it can assert render/console/network health on. This sweep measures
 * rather than asserts, so a route that renders an empty state is still worth
 * visiting — the shell, the nav, and the empty state itself all carry text and
 * controls, and those are what is being measured.
 *
 * Kept separate from `roleJourneyMatrix.ts` on purpose: that matrix encodes
 * user JOURNEYS (ordered steps toward a goal, with per-step interaction
 * checks). This is a flat surface inventory. Merging them would force the
 * journey matrix to carry routes no journey passes through.
 *
 * Club-admin is absent because `E2E_CLUB_ADMIN_PASSWORD` is local-only and not
 * wired into any workflow (see `helpers/testUsers.ts`). Adding it here would
 * produce a group that silently skips everywhere.
 */

export type SweepAuthUser = 'PUBLIC' | 'DEMO_EXHIBITOR' | 'SECRETARY' | 'JUDGE' | 'SITE_ADMIN';

export interface SweepRoute {
  /** Stable id used in the findings report; keep it terse. */
  id: string;
  /** `{secretaryShowId}` / `{registrationShowId}` are substituted at run time. */
  path: string;
  /** Landing route for the group's sign-in. */
  landing?: boolean;
}

export interface SweepGroup {
  id: string;
  authUser: SweepAuthUser;
  routes: readonly SweepRoute[];
}

export const SWEEP_GROUPS: readonly SweepGroup[] = [
  {
    id: 'public',
    authUser: 'PUBLIC',
    routes: [
      { id: 'landing', path: '/' },
      { id: 'sign-in', path: '/sign-in' },
      { id: 'sign-up', path: '/sign-up' },
      { id: 'browse-shows', path: '/shows' },
      { id: 'show-detail', path: '/shows/{registrationShowId}' },
      { id: 'browse-clubs', path: '/clubs' },
      { id: 'terms', path: '/terms' },
      { id: 'privacy', path: '/privacy' },
    ],
  },
  {
    id: 'exhibitor',
    authUser: 'DEMO_EXHIBITOR',
    routes: [
      { id: 'my-entries', path: '/exhibitor/entries', landing: true },
      { id: 'registration-wizard', path: '/shows/{registrationShowId}/register' },
      { id: 'my-dogs', path: '/dogs' },
      { id: 'account', path: '/account' },
      { id: 'notifications', path: '/notifications' },
      { id: 'payments', path: '/exhibitor/payments' },
      { id: 'show-detail', path: '/shows/{registrationShowId}' },
      { id: 'browse-shows', path: '/shows' },
    ],
  },
  {
    id: 'secretary',
    authUser: 'SECRETARY',
    routes: [
      { id: 'dashboard', path: '/secretary/dashboard', landing: true },
      { id: 'show-overview', path: '/shows/{secretaryShowId}' },
      { id: 'show-desk', path: '/shows/{secretaryShowId}/show-desk' },
      { id: 'entry-management', path: '/shows/{secretaryShowId}/entry-management' },
      { id: 'reports', path: '/shows/{secretaryShowId}/reports' },
      { id: 'results-control', path: '/shows/{secretaryShowId}/results-control' },
      { id: 'create-show-wizard', path: '/secretary/create-show/wizard' },
      { id: 'settings', path: '/secretary/settings' },
      { id: 'people', path: '/people' },
      { id: 'tasks', path: '/secretary/tasks' },
      { id: 'waitlist', path: '/secretary/waitlist' },
    ],
  },
  {
    id: 'judge',
    authUser: 'JUDGE',
    routes: [
      { id: 'dashboard', path: '/judge/dashboard', landing: true },
      { id: 'check-in', path: '/judge/check-in' },
      { id: 'stats', path: '/judge/stats' },
      { id: 'at-show', path: '/at-show/{secretaryShowId}' },
    ],
  },
  {
    id: 'admin',
    authUser: 'SITE_ADMIN',
    routes: [
      { id: 'dashboard', path: '/admin/dashboard', landing: true },
      { id: 'health', path: '/admin/health' },
      { id: 'users', path: '/admin/users' },
      { id: 'support', path: '/admin/support' },
      { id: 'payouts', path: '/admin/payouts' },
      { id: 'permissions', path: '/admin/permissions' },
      { id: 'role-requests', path: '/admin/role-requests' },
      { id: 'templates', path: '/admin/templates' },
      { id: 'sync', path: '/admin/sync' },
      { id: 'deleted-items', path: '/admin/deleted-items' },
      { id: 'help', path: '/admin/help' },
    ],
  },
] as const;

export interface SweepPathParams {
  registrationShowId: string;
  secretaryShowId: string;
}

export function resolveSweepPath(path: string, params: SweepPathParams): string {
  return path.replace(/\{(\w+)\}/g, (whole, key: keyof SweepPathParams) => params[key] ?? whole);
}

export const SWEEP_ROUTE_COUNT = SWEEP_GROUPS.reduce((n, g) => n + g.routes.length, 0);
