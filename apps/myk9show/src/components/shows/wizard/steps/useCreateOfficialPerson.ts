/**
 * "Add new" for a show official (Chair, Secretary, Steward), shared by the show wizard and
 * Edit Show → Officials (MYK9-2493) so both save the phone the form requires and reuse a
 * person who already has that email.
 */

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUserStore } from '@/store/userStore';
import { createUser, updateUser } from '@/services/database/users';
import { personEmailsMatch } from '@/utils/personIdentity';

export interface NewOfficialPerson {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/** Returns the person's id: the existing person with this email, or the one just created. */
export function useCreateOfficialPerson(): (data: NewOfficialPerson) => Promise<string> {
  const { people, loadPeople } = useUserStore(
    useShallow(state => ({ people: state.people, loadPeople: state.loadPeople }))
  );

  return useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    }): Promise<string> => {
      // Dedup guard: if a person with this email already exists, reuse them
      // instead of creating a duplicate record. Email is the reliable identity
      // key (name alone is too weak — two different "John Smith"s are common).
      // This is the wizard's #1 source of duplicate person rows.
      const normalizedEmail = data.email.trim().toLowerCase();
      const existing = normalizedEmail
        ? people.find(p => personEmailsMatch(p.email, data.email))
        : undefined;
      if (existing) {
        // Reuse the existing person, but keep their phone current. The form
        // requires a phone and the premium/reports surface it, so a matched
        // record with a missing or changed phone must be updated — otherwise
        // the phone the user just entered is silently dropped.
        const trimmedPhone = data.phone.trim();
        if (trimmedPhone && trimmedPhone !== (existing.phone ?? '').trim()) {
          const updateResult = await updateUser(existing.id, { phone: trimmedPhone });
          if (updateResult.error) throw updateResult.error;
          await loadPeople();
        }
        return existing.id;
      }

      const result = await createUser({
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
      });
      if (result.error) throw result.error;
      await loadPeople();
      return result.data!.id;
    },
    [people, loadPeople]
  );
}
