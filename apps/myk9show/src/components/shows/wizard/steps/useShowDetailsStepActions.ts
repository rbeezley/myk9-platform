/**
 * Custom hook for ShowDetailsStep mutation handlers.
 * Handles inline creation of official people and judge credentials from the
 * show creation wizard's Basic Show Information step.
 */

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUserStore } from '@/store/userStore';
import { createUser, updateUser } from '@/services/database/users';
import { createJudgeQualification } from '@/services/database/judges';
import { NewJudgeFormError } from './NewJudgeForm';
import { useCreateOfficialPerson } from './useCreateOfficialPerson';

export function useShowDetailsStepActions() {
  const { people, loadPeople } = useUserStore(
    useShallow(state => ({ people: state.people, loadPeople: state.loadPeople }))
  );

  const handleCreateOfficialPerson = useCreateOfficialPerson();

  const handleSaveJudgeCredentials = useCallback(
    async (
      personId: string,
      data: { organization: string; judgeNumber: string; email: string }
    ): Promise<void> => {
      if (!data.judgeNumber.trim()) throw new Error('Judge number is required');
      await createJudgeQualification({
        person_id: personId,
        organization: data.organization,
        qualification_level: 'General',
        disciplines: [],
        judge_number: data.judgeNumber,
        date_obtained: new Date().toISOString().split('T')[0],
        is_active: true,
      });
      const person = people.find(p => p.id === personId);
      if (data.email && !person?.email) {
        await updateUser(personId, { email: data.email });
      }
      await loadPeople();
    },
    [people, loadPeople]
  );

  const handleCreateNewJudge = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      organization: string;
      judgeNumber: string;
      email: string;
    }): Promise<string> => {
      if (!data.judgeNumber.trim()) throw new Error('Judge number is required');
      const result = await createUser({
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
      });
      if (result.error) throw result.error;
      const personId = result.data!.id;
      try {
        await createJudgeQualification({
          person_id: personId,
          organization: data.organization,
          qualification_level: 'General',
          disciplines: [],
          judge_number: data.judgeNumber,
          date_obtained: new Date().toISOString().split('T')[0],
          is_active: true,
        });
      } catch {
        // The person already exists at this point. Do not let the form's generic
        // "Failed to save" invite a retry that would create them a second time.
        throw new NewJudgeFormError(
          `${data.firstName} ${data.lastName} was added as a person, but their ${data.organization} judge qualification could not be saved. Add it from their profile under People instead of creating them again.`
        );
      }
      await loadPeople();
      return personId;
    },
    [loadPeople]
  );

  return {
    handleCreateOfficialPerson,
    handleSaveJudgeCredentials,
    handleCreateNewJudge,
  };
}
