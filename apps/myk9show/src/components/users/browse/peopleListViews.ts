/**
 * The People page's built-in views (docs/plan-list-toolkit.md, MYK9-797).
 * Each is a role or login-state preset; its count replaces what a stat card
 * would have shown. "No login" is a person with no linked
 * `people.auth_user_id` (`person.user_id` on the client `User` type).
 *
 * A view is active only when the filters match it exactly; search is
 * independent — it narrows within a view, same convention as the Users pilot.
 */

import type { ListView } from '@/components/list-toolkit';
import type { User } from '@/types/user-types';
import { DEFAULT_PEOPLE_FILTERS, filterPeople, type PeopleFilters } from '@/hooks/useBrowsePeopleData';

type PeopleViewFilterPatch = Pick<PeopleFilters, 'role' | 'location' | 'login'>;

interface PeopleViewDefinition {
  id: string;
  label: string;
  patch: Partial<PeopleViewFilterPatch>;
}

export const PEOPLE_VIEWS: readonly PeopleViewDefinition[] = [
  { id: 'all', label: 'All', patch: {} },
  { id: 'secretaries', label: 'Secretaries', patch: { role: 'secretary' } },
  { id: 'judges', label: 'Judges', patch: { role: 'judge' } },
  { id: 'exhibitors', label: 'Exhibitors', patch: { role: 'exhibitor' } },
  { id: 'club-admins', label: 'Club admins', patch: { role: 'club_admin' } },
  { id: 'no-login', label: 'No login', patch: { login: 'none' } },
];

/** Every view field, reset to its default, then the view's own patch on top. */
export function peopleViewFilterPatch(id: string): PeopleViewFilterPatch {
  const view = PEOPLE_VIEWS.find(v => v.id === id) ?? PEOPLE_VIEWS[0];
  return {
    role: DEFAULT_PEOPLE_FILTERS.role,
    location: DEFAULT_PEOPLE_FILTERS.location,
    login: DEFAULT_PEOPLE_FILTERS.login,
    ...view.patch,
  };
}

/** The view the current filters match exactly, or null for a custom filter. */
export function activePeopleViewId(filters: PeopleFilters): string | null {
  return (
    PEOPLE_VIEWS.find(view => {
      const patch = peopleViewFilterPatch(view.id);
      return (
        filters.role === patch.role &&
        filters.location === patch.location &&
        filters.login === patch.login
      );
    })?.id ?? null
  );
}

/** Every built-in view with its count over the whole roster (search excluded). */
export function buildPeopleViews(people: User[]): ListView[] {
  return PEOPLE_VIEWS.map(view => ({
    id: view.id,
    label: view.label,
    count: filterPeople(people, { ...DEFAULT_PEOPLE_FILTERS, ...peopleViewFilterPatch(view.id) })
      .length,
  }));
}
