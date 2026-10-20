import { PERMISSIONS, UserRole } from '@/types/auth-types';
// `people:create` is declared only on the RBAC service's map; the auth-types map has no
// people permissions. Each gate reads the map its list page has always read.
import { PERMISSIONS as RBAC_PERMISSIONS } from '@/services/auth/rbacService';

/** Where each top-level object is created: its list page's own create panel. */
export const CREATE_HREFS = {
  show: '/?wizard=true',
  dog: '/dogs?add=true',
  person: '/people?add=true',
  club: '/clubs?create=true',
} as const;

export interface CreateGates {
  canCreateShows: boolean;
  canCreateDogs: boolean;
  canCreatePeople: boolean;
  canCreateClubs: boolean;
}

/**
 * Who may create each top-level object. THE one copy: the header Actions menu's Create
 * group, the command palette, and the Dogs, People and Clubs list pages' own Add buttons
 * all read it, so no door can offer a create panel another would refuse. Clubs follow the
 * `clubs_insert` policy (migration 160); the rest are plain permissions.
 */
export function resolveCreateGates(auth: {
  hasRole: (role: UserRole) => boolean;
  hasPermission: (permission: string) => boolean;
}): CreateGates {
  return {
    canCreateShows: auth.hasPermission(PERMISSIONS.SHOW_CREATE),
    canCreateDogs: auth.hasPermission(PERMISSIONS.DOG_CREATE),
    canCreatePeople: auth.hasPermission(RBAC_PERMISSIONS.PEOPLE_CREATE),
    canCreateClubs:
      auth.hasRole(UserRole.SECRETARY) ||
      auth.hasRole(UserRole.CLUB_ADMIN) ||
      auth.hasRole(UserRole.SITE_ADMIN),
  };
}

const CREATE_ACTION_KINDS = {
  'create-dog': 'dog',
  'create-person': 'person',
  'create-club': 'club',
} as const;

/**
 * Where a Create item goes from `pathname`. On its own list or one of its records (`/clubs`,
 * `/clubs/:id`) the panel opens IN PLACE: the current path and search are kept and only the
 * create param is added, so the open record and the list's search survive. Anywhere else, the
 * plain href. THE one rule for Dog, Person and Club; the list pages read the param from the URL.
 */
export function createHrefFor(
  actionId: string,
  href: string,
  pathname: string,
  search: string
): string {
  const kind = CREATE_ACTION_KINDS[actionId as keyof typeof CREATE_ACTION_KINDS];
  if (!kind) return href;
  const target = new URL(CREATE_HREFS[kind], 'http://placeholder');
  const onItsList = pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
  if (!onItsList) return href;
  const params = new URLSearchParams(search);
  target.searchParams.forEach((value, key) => params.set(key, value));
  return `${pathname}?${params.toString()}`;
}
