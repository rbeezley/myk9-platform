import { useState, useMemo, useCallback } from 'react';
import { useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { extractPersonName } from '@/components/users/UserDetails/userDetailsTypes';
import type { User } from '@/types/user-types';

export interface PeopleFilters {
  search: string;
  role: string;
}

const INITIAL_FILTERS: PeopleFilters = {
  search: '',
  role: 'all',
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
}

export function useBrowsePeopleData(): BrowsePeopleData {
  const { people, isLoading, error } = useRoleBasedPeople();

  const [filters, setFilters] = useState<PeopleFilters>(INITIAL_FILTERS);

  // Derive unique roles from actual data
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

  // Filter people by search and role
  const filteredPeople = useMemo(() => {
    let result = people;

    // Search filter: match name or email
    if (filters.search.trim()) {
      const query = filters.search.toLowerCase().trim();
      result = result.filter(person => {
        const { fullName } = extractPersonName(person);
        return (
          fullName.toLowerCase().includes(query) || person.email?.toLowerCase().includes(query)
        );
      });
    }

    // Role filter
    if (filters.role !== 'all') {
      result = result.filter(person => person.roles?.includes(filters.role as never));
    }

    // Sort alphabetically by full name
    return [...result].sort((a, b) => {
      const nameA = extractPersonName(a).fullName;
      const nameB = extractPersonName(b).fullName;
      return nameA.localeCompare(nameB);
    });
  }, [people, filters]);

  const hasActiveFilters = filters.search.trim() !== '' || filters.role !== 'all';

  const clearAllFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, []);

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
  };
}
