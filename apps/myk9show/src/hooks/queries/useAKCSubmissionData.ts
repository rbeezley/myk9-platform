// apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  resolveDogIdentityForOrganization,
  type DogRegistrationLike,
} from '@/features/dogs/identity';
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
          .from('view_authenticated_entry_results')
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

      // Round 3: dogs + dog registrations — parallel.
      //
      // MYK9-90: registration number, registered name, and breed come from the
      // AKC `dog_registrations` row, NOT from `dogs.akc_number` (a
      // pre-normalization column nothing writes — NULL for every row, which is
      // why every submission shipped a blank registration number).
      //
      // The organization filter is applied in TypeScript rather than as
      // `.eq('organization', 'AKC')`, because that column is free text and has
      // drifted: the database holds both `AKC` and `AKC (American Kennel
      // Club)`. The old equality filter matched only the minority spelling.
      const [dogsRes, dogRegsRes] = await Promise.all([
        supabase.from('dogs').select('id, sex, owner_id, name, call_name').in('id', dogIds),
        supabase
          .from('dog_registrations')
          // `id` and `created_at` are the resolver's tiebreak fields and must be
          // selected, not just the display columns. `UNIQUE (dog_id,
          // organization)` is an EXACT-STRING constraint (verified against the
          // applied schema), so one dog may legitimately hold both an `AKC` row
          // and an `AKC (American Kennel Club)` row. Both normalize to AKC, so
          // the resolver sees two candidates; without these fields the
          // comparator ties and falls back to unspecified PostgREST row order,
          // and the submitted registration number could vary between runs.
          //
          // `is_primary` is deliberately NOT selected: its migration is written
          // but unpushed, and selecting a nonexistent column would fail every
          // submission. `created_at` then `id` is fully deterministic on its
          // own, and the backfill marks the earliest row primary anyway, so the
          // two orderings agree. Add `is_primary` here when the migration lands.
          .select(
            'dog_id, id, created_at, organization, registration_number, registered_name, breed, variety'
          )
          .in('dog_id', dogIds),
      ]);

      if (dogsRes.error) throw dogsRes.error;
      if (dogRegsRes.error) throw dogRegsRes.error;

      const dogMap = new Map(
        (
          (dogsRes.data ?? []) as Array<{
            id: string;
            sex: string | null;
            owner_id: string | null;
            name: string;
            call_name: string | null;
          }>
        ).map(d => [d.id, d])
      );

      const registrationsByDog = new Map<string, DogRegistrationLike[]>();
      for (const row of (dogRegsRes.data ?? []) as Array<
        DogRegistrationLike & { dog_id: string }
      >) {
        const list = registrationsByDog.get(row.dog_id);
        if (list) list.push(row);
        else registrationsByDog.set(row.dog_id, [row]);
      }

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
        const akcIdentity = resolveDogIdentityForOrganization(
          registrationsByDog.get(e.dog_id!),
          'AKC'
        );

        const dogGender: 'D' | 'B' | null =
          dog?.sex === 'Male' ? 'D' : dog?.sex === 'Female' ? 'B' : null;

        return {
          // SubmissionEntry base fields
          // MYK9-90 §5.2 — the call name leads. `dogs.name` is a nullable legacy
          // alias that is NULL for every dog created after that migration, so
          // reading it alone would put a blank dog name on an AKC submission.
          // The registered name is separate and comes from the AKC registration
          // (`dogRegisteredName` below).
          dogName: dog?.call_name ?? dog?.name ?? '',
          // Empty, never a placeholder. `SubmissionEntry.breed` is a non-null
          // string in @myk9/secretary, so an unregistered dog contributes ''
          // rather than a guess — the app must not invent a breed.
          breed: akcIdentity.breed ?? '',
          registrationNumber: akcIdentity.registrationNumber,
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
          dogRegisteredName: akcIdentity.registeredName,
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
