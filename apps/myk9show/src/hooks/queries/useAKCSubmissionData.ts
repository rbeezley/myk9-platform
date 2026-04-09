// apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import type {
  AKCSubmissionData,
  AKCSubmissionEntry,
  SubmissionShow,
  SubmissionTrial,
} from '@myk9/secretary';

export function useAKCSubmissionData(showId: string) {
  const { user } = useAuthContext();

  return useQuery({
    queryKey: ['akc-submission-data', showId],
    queryFn: async (): Promise<AKCSubmissionData> => {
      // Round 1: show + club, secretary profile, trials, entries — all parallel
      // (entries only need show_id, not trialIds, so can run upfront)
      const [showRes, secretaryRes, trialsRes, entriesRes] = await Promise.all([
        supabase.from('shows').select('id, name, club_id, clubs(name)').eq('id', showId).single(),
        supabase
          .from('people')
          .select('first_name, last_name, email')
          .eq('auth_user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('trials')
          .select('id, event_number, date, trial_number, name')
          .eq('show_id', showId)
          .is('deleted_at', null)
          .order('date'),
        supabase
          .from('entries')
          .select(
            'id, dog_id, class_id, trial_id, armband, search_time_seconds, final_placement, result_status, entry_status, check_in_status, run_order'
          )
          .eq('show_id', showId)
          .is('deleted_at', null),
      ]);

      if (showRes.error) throw showRes.error;
      if (trialsRes.error) throw trialsRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const showRow = showRes.data;
      const clubRow = showRow.clubs as { name: string } | null;
      const secretaryRow = secretaryRes.data;
      const trialRows = (trialsRes.data ?? []) as Array<{
        id: string;
        event_number: string | null;
        date: string;
        trial_number: string | null;
        name: string;
      }>;

      const show: SubmissionShow = {
        id: showRow.id as string,
        name: showRow.name as string,
        clubName: clubRow?.name ?? null,
        date: null,
        clubLicenseNumber: null,
        secretaryName: secretaryRow
          ? `${secretaryRow.first_name} ${secretaryRow.last_name}`.trim()
          : null,
        secretaryEmail: secretaryRow?.email ?? null,
      };

      const trials: SubmissionTrial[] = trialRows.map(t => ({
        id: t.id,
        trialNumber: t.trial_number ?? 1,
        date: t.date,
        judgeName: '',
        organization: 'AKC',
        sportType: 'scent_work',
        eventNumber: t.event_number,
      }));

      const trialIds = trialRows.map(t => t.id);

      if (trialIds.length === 0) {
        return { show, trials, entries: [] };
      }

      // Round 2: classes (needs trialIds from Round 1)
      const classesRes = await supabase
        .from('classes')
        .select('id, element, level, section, time_limit_seconds, trial_id, name')
        .in('trial_id', trialIds)
        .is('deleted_at', null);

      if (classesRes.error) throw classesRes.error;

      const classRows = (classesRes.data ?? []) as Array<{
        id: string;
        element: string | null;
        level: string | null;
        section: string | null;
        time_limit_seconds: number | null;
        trial_id: string;
        name: string;
      }>;
      const entryRows = (entriesRes.data ?? []) as Array<{
        id: string;
        dog_id: string | null;
        class_id: string | null;
        trial_id: string | null;
        armband: string | null;
        search_time_seconds: number | null;
        final_placement: number | null;
        result_status: string | null;
        entry_status: string | null;
        check_in_status: string | null;
        run_order: number | null;
      }>;

      const classMap = new Map(classRows.map(c => [c.id, c]));
      const validEntries = entryRows.filter(
        e => e.dog_id && e.class_id && classMap.has(e.class_id)
      );
      const dogIds = [...new Set(validEntries.map(e => e.dog_id!))] as string[];

      if (dogIds.length === 0) {
        return { show, trials, entries: [] };
      }

      // Round 3: dogs + dog registrations (AKC org) — parallel
      const [dogsRes, dogRegsRes] = await Promise.all([
        supabase.from('dogs').select('id, akc_number, sex, owner_id, name').in('id', dogIds),
        supabase
          .from('dog_registrations')
          .select('dog_id, registered_name')
          .in('dog_id', dogIds)
          .eq('organization', 'AKC'),
      ]);

      if (dogsRes.error) throw dogsRes.error;
      if (dogRegsRes.error) throw dogRegsRes.error;

      const dogMap = new Map(
        (
          (dogsRes.data ?? []) as Array<{
            id: string;
            akc_number: string | null;
            sex: string | null;
            owner_id: string | null;
            name: string;
          }>
        ).map(d => [d.id, d])
      );
      const dogRegMap = new Map(
        ((dogRegsRes.data ?? []) as Array<{ dog_id: string; registered_name: string | null }>).map(
          r => [r.dog_id, r.registered_name]
        )
      );

      const ownerIds = [
        ...new Set(
          [...dogMap.values()].map(d => d.owner_id).filter((id): id is string => id != null)
        ),
      ];

      // Round 4: owners
      const ownersRes = await supabase
        .from('people')
        .select('id, first_name, last_name, street_address, city, state, zip_code, country')
        .in('id', ownerIds);

      if (ownersRes.error) throw ownersRes.error;

      const ownerMap = new Map(
        (
          (ownersRes.data ?? []) as Array<{
            id: string;
            first_name: string;
            last_name: string;
            street_address: string | null;
            city: string | null;
            state: string | null;
            zip_code: string | null;
            country: string | null;
          }>
        ).map(o => [
          o.id,
          {
            name: `${o.first_name} ${o.last_name}`.trim(),
            address: {
              street: o.street_address,
              city: o.city,
              state: o.state,
              zip: o.zip_code,
              country: o.country,
            },
          },
        ])
      );

      // Build AKCSubmissionEntry array
      const entries: AKCSubmissionEntry[] = validEntries.map(e => {
        const cls = classMap.get(e.class_id!)!;
        const dog = dogMap.get(e.dog_id!);
        const owner = dog?.owner_id ? ownerMap.get(dog.owner_id) : null;
        const registeredName = dogRegMap.get(e.dog_id!) ?? null;

        const dogGender: 'D' | 'B' | null =
          dog?.sex === 'Male' ? 'D' : dog?.sex === 'Female' ? 'B' : null;

        return {
          // SubmissionEntry base fields
          dogName: dog?.name ?? '',
          breed: 'Unknown',
          registrationNumber: dog?.akc_number ?? null,
          handlerName: '',
          className: cls.name,
          element: cls.element ?? '',
          level: cls.level ?? '',
          section: cls.section ?? null,
          resultCode: e.result_status,
          searchTimeSeconds: e.search_time_seconds,
          totalFaults: null,
          finalPlacement: e.final_placement,
          armbandNumber: e.armband != null ? Number(e.armband) : 0,
          trialId: e.trial_id ?? '',
          classId: e.class_id ?? '',
          // AKCSubmissionEntry fields
          dogRegisteredName: registeredName,
          dogGender,
          ownerName: owner?.name ?? null,
          ownerAddress: owner?.address ?? null,
          timeLimitSeconds: cls.time_limit_seconds,
          entryStatus: e.entry_status,
          checkInStatus: e.check_in_status,
          resultStatus: e.result_status,
        };
      });

      return { show, trials, entries };
    },
    enabled: !!showId && !!user,
    staleTime: 5 * 60 * 1000,
  });
}
