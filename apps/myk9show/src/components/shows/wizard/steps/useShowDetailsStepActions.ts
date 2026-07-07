/**
 * Custom hook for ShowDetailsStep mutation handlers.
 * Handles inline creation of clubs, official people, and judge credentials
 * from within the show creation wizard's Basic Show Information step.
 */

import { useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { useWizardStore } from '@/store/wizardStore';
import { createUser, updateUser } from '@/services/database/users';
import { createJudgeQualification } from '@/services/database/judges';
import { createClub } from '@/services/database/clubs';
import { clubNamesMatch } from '@/utils/clubIdentity';
import { personEmailsMatch } from '@/utils/personIdentity';
import type { CreateClubData } from './sections';

export function useShowDetailsStepActions() {
  const { clubs, loadClubs } = useClubStore();
  const { people, loadPeople } = useUserStore();
  const { updateShowData } = useWizardStore();

  // Inline club creation — no panelManager needed
  const handleCreateClub = useCallback(
    async (data: CreateClubData): Promise<void> => {
      const existing = clubs.find(club => clubNamesMatch(club.name, data.name));
      if (existing) {
        updateShowData({ clubId: existing.id });
        logger.debug('Existing club selected instead of duplicate create', 'wizard', {
          clubName: data.name,
          clubId: existing.id,
        });
        return;
      }

      const result = await createClub({ name: data.name, email: data.email });
      if (result.error) throw result.error;
      await loadClubs();
      updateShowData({ clubId: result.data!.id });
      logger.debug('Club created and selected', 'wizard', { clubName: data.name });
    },
    [clubs, loadClubs, updateShowData]
  );

  const handleCreateOfficialPerson = useCallback(
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
      await createJudgeQualification({
        person_id: personId,
        organization: data.organization,
        qualification_level: 'General',
        disciplines: [],
        judge_number: data.judgeNumber,
        date_obtained: new Date().toISOString().split('T')[0],
        is_active: true,
      });
      await loadPeople();
      return personId;
    },
    [loadPeople]
  );

  return {
    handleCreateClub,
    handleCreateOfficialPerson,
    handleSaveJudgeCredentials,
    handleCreateNewJudge,
  };
}
