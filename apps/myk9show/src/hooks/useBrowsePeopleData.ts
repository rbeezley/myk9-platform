import { useMemo, useCallback } from 'react';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { extractPersonName } from '@/components/users/UserDetails/userDetailsTypes';
import type { User } from '@/types/user-types';

export interface PeopleFilters {
  search: string;
  role: string;
  /** A state value, or 'all'. Data-derived — see `availableLocations`. */
  location: string;
  /** 'all' or 'none' (a person with no linked `people.auth_user_id`). */
  login: string;
}

export const DEFAULT_PEOPLE_FILTERS: PeopleFilters = {
  search: '',
  role: 'all',
  location: 'all',
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
  availableRoles: string[];
  availableLocations: string[];
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
      return (
        fullName.toLowerCase().includes(query) || person.email?.toLowerCase().includes(query)
      );
    });
  }

  if (filters.role !== 'all') {
    result = result.filter(person => person.roles?.includes(filters.role as never));
  }

  if (filters.location !== 'all') {
    result = result.filter(person => person.state === filters.location);
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

const URL_FILTER_OPTIONS = { allowedValues: { login: ['none'] as readonly string[] } };

export function useBrowsePeopleData(): BrowsePeopleData {
  const { people, isLoading, error } = useRoleBasedPeople();

  // URL-backed so a refresh, back-navigation, or shared link keeps the same
  // result set (MYK9-221). Same [values, setValues] contract as useState.
  const [filters, setFilters] = useUrlFilters<PeopleFilters>(
    DEFAULT_PEOPLE_FILTERS,
    URL_FILTER_OPTIONS
  );

  // Derive unique roles and locations from actual data — a closed vocabulary
  // would show options with nobody behind them.
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const person of people) {
      if (person.roles) {
        for (const role of person.roles) {
          roles.add(role);
        }
      }
    }
    return [...roles].sort((a, b) => a.localeCompare(b));
  }, [people]);

  const availableLocations = useMemo(() => {
    const locations = new Set<string>();
    for (const person of people) {
      if (person.state) locations.add(person.state);
    }
    return [...locations].sort((a, b) => a.localeCompare(b));
  }, [people]);

  const filteredPeople = useMemo(() => filterPeople(people, filters), [people, filters]);

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.role !== 'all' ||
    filters.location !== 'all' ||
    filters.login !== 'all';

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
    availableRoles,
    availableLocations,
  };
}
