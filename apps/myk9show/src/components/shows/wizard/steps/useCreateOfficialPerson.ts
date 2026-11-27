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
import { fetchServerPersonMatches } from '@/components/shows/RegistrationWorkflow/useServerPersonMatches';
import type { User } from '@/types/user-types';
import type { CreatePersonData } from './OfficialPicker';

/** What the picker's "Add new" form collects: one type, so a new field cannot be dropped. */
export type NewOfficialPerson = CreatePersonData;

export interface CreateOfficialOptions {
  /** People who cannot take this role, such as the current holder of the other one. */
  excludePersonIds?: string[];
}

/** The typed email belongs to the person already holding the other role (Chair and Secretary differ). */
export class OfficialAlreadyHoldsRoleError extends Error {
  constructor(public readonly personName: string) {
    super(`${personName} already holds the other role`);
    this.name = 'OfficialAlreadyHoldsRoleError';
  }
}

/** Returns the person's id: the existing person with this email, or the one just created. */
export function useCreateOfficialPerson(): (
  data: NewOfficialPerson,
  options?: CreateOfficialOptions
) => Promise<string> {
  const { people, directoryIncomplete, loadPeople } = useUserStore(
    useShallow(state => ({
      people: state.people,
      directoryIncomplete: state.directoryIncomplete,
      loadPeople: state.loadPeople,
    }))
  );

  return useCallback(
    async (data: NewOfficialPerson, options?: CreateOfficialOptions): Promise<string> => {
      // Dedup guard: if a person with this email already exists, reuse them
      // instead of creating a duplicate record. Email is the reliable identity
      // key (name alone is too weak — two different "John Smith"s are common).
      // This is the wizard's #1 source of duplicate person rows.
      const normalizedEmail = data.email.trim().toLowerCase();
      let existing: User | undefined = normalizedEmail
        ? people.find(p => personEmailsMatch(p.email, data.email))
        : undefined;
      // A short or empty saved directory cannot prove nobody has this email: ask the server,
      // or the insert hits people_email_unique and neither phone nor assignment saves.
      if (!existing && normalizedEmail && (people.length === 0 || directoryIncomplete)) {
        const answer = await fetchServerPersonMatches({
          email: data.email,
          lastName: data.lastName,
        });
        existing = answer.people.find(p => personEmailsMatch(p.email, data.email));
      }
      if (existing && options?.excludePersonIds?.includes(existing.id)) {
        throw new OfficialAlreadyHoldsRoleError(
          `${existing.firstName} ${existing.lastName}`.trim() || data.email
        );
      }
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
    [people, directoryIncomplete, loadPeople]
  );
}
