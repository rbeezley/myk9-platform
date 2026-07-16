export const ROLE_JOURNEY_VIEWPORTS = [
  { id: 'phone', width: 390, height: 844 },
  { id: 'tablet', width: 834, height: 1112 },
  { id: 'desktop', width: 1280, height: 800 },
] as const;

export const ROLE_JOURNEY_THEMES = ['light', 'dark'] as const;

export type RoleJourneyViewport = (typeof ROLE_JOURNEY_VIEWPORTS)[number];
export type RoleJourneyTheme = (typeof ROLE_JOURNEY_THEMES)[number];
export type RoleJourneyRole = 'exhibitor' | 'secretary' | 'judge-steward' | 'admin';
export type RoleJourneyAuthUser = 'DEMO_EXHIBITOR' | 'SECRETARY' | 'JUDGE' | 'SITE_ADMIN';

export type RoleJourneyCheck =
  | 'render'
  | 'horizontal-overflow'
  | 'console-errors'
  | 'modal-feedback'
  | 'selected-state'
  | 'disabled-state'
  | 'visual-baseline';

export interface RoleJourneyRoute {
  id: string;
  label: string;
  pathTemplate: string;
}

export interface RoleJourneyScenario {
  id: string;
  role: RoleJourneyRole;
  roleLabel: string;
  authUser: RoleJourneyAuthUser;
  goal: string;
  routes: readonly RoleJourneyRoute[];
  checks: readonly RoleJourneyCheck[];
}

export interface RoleJourneyPathParams {
  registrationShowId: string;
  secretaryShowId: string;
}

/**
 * The executable contract for MYK9-17. Keep route ownership here so the
 * browser runner and its coverage test cannot silently drift apart.
 */
export const ROLE_JOURNEY_MATRIX = [
  {
    id: 'exhibitor-entry',
    role: 'exhibitor',
    roleLabel: 'Exhibitor',
    // This matrix uses the real exhibitor identity and validates the
    // registration guardrails; the seeded happy path through payment remains
    // covered by the dedicated registration visual suite.
    authUser: 'DEMO_EXHIBITOR',
    goal: 'Browse Shows → Show Detail → registration guardrails',
    routes: [
      { id: 'browse-shows', label: 'Browse Shows', pathTemplate: '/shows' },
      { id: 'show-detail', label: 'Show Detail', pathTemplate: '/shows/{registrationShowId}' },
      {
        id: 'registration',
        label: 'Registration and payment review',
        pathTemplate: '/shows/{registrationShowId}/register',
      },
    ],
    checks: [
      'render',
      'horizontal-overflow',
      'console-errors',
      'disabled-state',
      'selected-state',
      'modal-feedback',
      'visual-baseline',
    ],
  },
  {
    id: 'secretary-management',
    role: 'secretary',
    roleLabel: 'Secretary',
    authUser: 'SECRETARY',
    goal: 'Open show setup/workbench and reach Entry Management clearing actions',
    routes: [
      {
        id: 'setup',
        label: 'Setup and readiness',
        pathTemplate: '/shows/{secretaryShowId}/setup',
      },
      {
        id: 'show-desk',
        label: 'Show-day workbench',
        pathTemplate: '/shows/{secretaryShowId}/show-desk',
      },
      {
        id: 'entry-management',
        label: 'Entry Management',
        pathTemplate: '/shows/{secretaryShowId}/entry-management',
      },
    ],
    checks: [
      'render',
      'horizontal-overflow',
      'console-errors',
      'selected-state',
      'disabled-state',
      'modal-feedback',
    ],
  },
  {
    id: 'judge-steward-check-in',
    role: 'judge-steward',
    roleLabel: 'Judge / steward',
    authUser: 'JUDGE',
    goal: 'Review assigned classes and manage show-day check-in',
    routes: [
      {
        id: 'dashboard',
        label: 'Judge dashboard',
        pathTemplate: '/judge/dashboard',
      },
      {
        id: 'check-in',
        label: 'Judge check-in management',
        pathTemplate: '/judge/check-in',
      },
    ],
    checks: ['render', 'horizontal-overflow', 'console-errors', 'selected-state'],
  },
  {
    id: 'admin-support',
    role: 'admin',
    roleLabel: 'Admin',
    authUser: 'SITE_ADMIN',
    goal: 'Open a concise support and management path',
    routes: [
      { id: 'dashboard', label: 'Admin dashboard', pathTemplate: '/admin/dashboard' },
      { id: 'support', label: 'Support', pathTemplate: '/admin/support' },
    ],
    checks: ['render', 'horizontal-overflow', 'console-errors'],
  },
] as const satisfies readonly RoleJourneyScenario[];

export function resolveRoleJourneyPath(
  pathTemplate: string,
  params: RoleJourneyPathParams
): string {
  return pathTemplate.replace(/\{(\w+)\}/g, (placeholder, key: keyof RoleJourneyPathParams) => {
    const value = params[key];
    return value === undefined ? placeholder : value;
  });
}
