import { useMemo, useCallback } from 'react';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { extractPersonName } from '@/components/users/UserDetails/userDetailsTypes';
import type { User } from '@/types/user-types';

export interface PeopleFilters {
  search: string;
  role: string;
  /** 'all' or 'none' (a person with no linked `people.auth_user_id`). */
  login: string;
}

export const DEFAULT_PEOPLE_FILTERS: PeopleFilters = {
  search: '',
  role: 'all',
  login: 'all',
};

export interface BrowsePeopleData {
  people: User[];
  filteredPeople: User[];
  isLoading: boolean;
  error: Error | null;
  filters: PeopleFilters;
  setFilters: React.Dispatch<React.SetStateAction<PeopleFilters>>;
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
}

/**
 * Pure filter over the roster, shared with `peopleListViews`' view counts so a
 * view's badge and the rows it shows can never disagree.
 */
export function filterPeople(people: User[], filters: PeopleFilters): User[] {
  let result = people;

  if (filters.search.trim()) {
    const query = filters.search.toLowerCase().trim();
    result = result.filter(person => {
      const { fullName } = extractPersonName(person);
      return fullName.toLowerCase().includes(query) || person.email?.toLowerCase().includes(query);
    });
  }

  if (filters.role !== 'all') {
    result = result.filter(person => person.roles?.includes(filters.role as never));
  }

  if (filters.login === 'none') {
    result = result.filter(person => !person.user_id);
  }

  return [...result].sort((a, b) => {
    const nameA = extractPersonName(a).fullName;
    const nameB = extractPersonName(b).fullName;
    return nameA.localeCompare(nameB);
  });
}

// The role views (`peopleListViews.ts`) are the only control for role, so only
// their roles are accepted; anything else reads as 'all' instead of narrowing the
// list by something the page cannot show and reset.
const VIEW_ROLES: readonly string[] = ['secretary', 'judge', 'exhibitor', 'club_admin'];
const URL_FILTER_OPTIONS = {
  allowedValues: { role: VIEW_ROLES, login: ['none'] as readonly string[] },
};

export function useBrowsePeopleData(): BrowsePeopleData {
  const { people, isLoading, error } = useRoleBasedPeople();

  // URL-backed so a refresh, back-navigation, or shared link keeps the same
  // result set (MYK9-221). Same [values, setValues] contract as useState.
  const [rawFilters, setFilters] = useUrlFilters<PeopleFilters>(
    DEFAULT_PEOPLE_FILTERS,
    URL_FILTER_OPTIONS
  );
  // Role and "No login" are alternative views, never combined (no preset covers
  // both), so a role wins and the sign-in restriction reads as off.
  const filters = useMemo<PeopleFilters>(
    () =>
      rawFilters.role !== 'all' && rawFilters.login !== 'all'
        ? { ...rawFilters, login: 'all' }
        : rawFilters,
    [rawFilters]
  );

  const filteredPeople = useMemo(() => filterPeople(people, filters), [people, filters]);

  const hasActiveFilters =
    filters.search.trim() !== '' || filters.role !== 'all' || filters.login !== 'all';

  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_PEOPLE_FILTERS);
  }, [setFilters]);

  return {
    people,
    filteredPeople,
    isLoading,
    error,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
  };
}
