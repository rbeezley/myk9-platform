/**
 * Resolve person IDs to display names.
 *
 * Chairman, secretary, and other personnel fields store person IDs.
 * This module provides both:
 *  - A React hook (`useResolvePersonName`) for component use
 *  - A standalone function (`resolvePersonNameFromStore`) for non-React contexts
 */

import { useCallback } from 'react';
import { useUserStore } from '@/store/userStore';

/**
 * React hook — returns a stable function that resolves a person ID
 * to "FirstName LastName". Falls back to the raw value if the person
 * isn't found (handles legacy data that may still contain name strings).
 */
export function useResolvePersonName() {
  const { people } = useUserStore();

  return useCallback(
    (personId: string | undefined | null): string => {
      if (!personId) return 'Not assigned';
      const person = people.find((p) => p.id === personId);
      if (person) return `${person.firstName} ${person.lastName}`;
      return personId;
    },
    [people]
  );
}

/**
 * Standalone resolver — reads people from the Zustand store directly.
 * Use this in non-React contexts (export utilities, report generators, etc.).
 */
export function resolvePersonNameFromStore(personId: string | undefined | null): string {
  if (!personId) return '';
  const { people } = useUserStore.getState();
  const person = people.find((p) => p.id === personId);
  if (person) return `${person.firstName} ${person.lastName}`;
  return personId;
}
