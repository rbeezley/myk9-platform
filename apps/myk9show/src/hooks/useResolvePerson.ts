/**
 * Resolve person IDs to full person objects (name, photo, contact info).
 *
 * Extends the pattern from useResolvePersonName to return structured data
 * needed by ShowOfficials, JudgesList, and PersonAvatar components.
 */
import { useCallback } from 'react';
import { useUserStore } from '@/store/userStore';

export interface ResolvedPerson {
  name: string;
  profileImage: string | undefined;
  email: string | undefined;
  phone: string | undefined;
}

export function useResolvePerson() {
  const people = useUserStore(s => s.people);

  return useCallback(
    (personId: string | undefined | null): ResolvedPerson | null => {
      if (!personId) return null;

      const person = people.find(p => p.id === personId);
      if (person) {
        return {
          name: `${person.firstName} ${person.lastName}`,
          profileImage: person.profileImage,
          email: person.email,
          phone: person.phone,
        };
      }

      // Fallback: ID not found — could be a legacy name string
      return {
        name: personId,
        profileImage: undefined,
        email: undefined,
        phone: undefined,
      };
    },
    [people]
  );
}
