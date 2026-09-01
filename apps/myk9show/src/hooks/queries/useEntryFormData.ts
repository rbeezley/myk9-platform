import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import { groupEntriesByDog } from '@/lib/reports/entryFormUtils';
import {
  resolveDogIdentityForOrganization,
  type DogRegistrationLike,
} from '@/features/dogs/identity';
import type { ShowExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import type {
  EntryFormDog,
  EntryFormSecretary,
  EntryFormTrial,
  EntryFormClass,
  EntryFormEntry,
  EntryFormRegistration,
  EntryFormPerson,
} from '@/lib/reports/entryFormTypes';

function formatPersonName(person: {
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
}

function buildSecretary(person: Record<string, unknown>): EntryFormSecretary {
  return {
    name: formatPersonName(person as { first_name?: string | null; last_name?: string | null }),
    streetAddress: (person.street_address as string) ?? null,
    city: (person.city as string) ?? null,
    state: (person.state as string) ?? null,
    zipCode: (person.zip_code as string) ?? null,
  };
}

export interface UseEntryFormDataOptions {
  showId: string;
  trialId?: string | undefined;
  dogId?: string | undefined;
  preferredRegistrationOrganization?: string | undefined;
  enabled?: boolean | undefined;
}

export interface UseEntryFormDataResult {
  dogs: EntryFormDog[];
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  classes: EntryFormClass[];
  show: {
    experienceIsPublished?: boolean;
    experiencePublishedContent?: ShowExperienceSnapshot | null;
  } | null;
  isLoading: boolean;
  isError: boolean;
}

async function fetchEntryFormData(
  showId: string,
  trialId?: string,
  dogId?: string,
  preferredRegistrationOrganization = 'AKC'
): Promise<{
  dogs: EntryFormDog[];
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  classes: EntryFormClass[];
  show: {
    experienceIsPublished?: boolean;
    experiencePublishedContent?: ShowExperienceSnapshot | null;
  } | null;
}> {
  const { data: showRaw } = await supabase
    .from('shows')
    .select('experience_is_published, experience_published_content')
    .eq('id', showId)
    .maybeSingle();

  const show = showRaw
    ? {
        experienceIsPublished: Boolean(
          (showRaw as unknown as Record<string, unknown>).experience_is_published
        ),
        experiencePublishedContent:
          ((showRaw as unknown as Record<string, unknown>)
            .experience_published_content as ShowExperienceSnapshot | null) ?? null,
      }
    : null;

  // 1. Fetch trials
  const { data: trialsRaw } = await supabase
    .from('trials')
    .select('id, date, trial_number')
    .eq('show_id', showId)
    .order('date')
    .order('trial_number');

  const trials: EntryFormTrial[] = (trialsRaw ?? [])
    .map(t => ({
      id: t.id,
      date: t.date ?? '',
      trialNumber: t.trial_number ?? '',
    }))
    // MYK9-282: `.order('trial_number')` is lexicographic on a text column, so
    // "Trial 10" lands before "Trial 2" among trials sharing a date. Date stays
    // primary; the tiebreak is numeric-aware.
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.trialNumber.localeCompare(b.trialNumber, undefined, { numeric: true })
    );

  const trialIds = trialId ? [trialId] : trials.map(t => t.id);

  // 2. Fetch classes
  const { data: classesRaw } = await supabase
    .from('classes')
    .select('id, trial_id, element, level')
    .in('trial_id', trialIds);

  const classes: EntryFormClass[] = (classesRaw ?? []).map(c => ({
    id: c.id,
    trialId: c.trial_id,
    element: c.element ?? '',
    level: c.level ?? '',
  }));

  // 3. Fetch entries
  let entriesQuery = supabase
    .from('entries')
    .select('id, dog_id, class_id, trial_id, armband, handler, submitted_at')
    .eq('show_id', showId)
    .is('deleted_at', null);

  if (trialId) entriesQuery = entriesQuery.eq('trial_id', trialId);
  if (dogId) entriesQuery = entriesQuery.eq('dog_id', dogId);

  const { data: entriesRaw } = await entriesQuery;

  if (!entriesRaw || entriesRaw.length === 0) {
    return { dogs: [], secretary: null, trials, classes, show };
  }

  const classMap = new Map(classes.map(c => [c.id, c]));

  const allEntries: (EntryFormEntry & { dogId: string })[] = (entriesRaw ?? []).map(e => {
    const cls = classMap.get(e.class_id ?? '');
    return {
      id: e.id,
      dogId: e.dog_id ?? '',
      trialId: e.trial_id ?? '',
      classId: e.class_id ?? '',
      element: cls?.element ?? '',
      level: cls?.level ?? '',
      armband: e.armband != null ? Number(e.armband) : null,
      handler: e.handler,
      submittedAt: e.submitted_at,
    };
  });

  const entriesByDog = groupEntriesByDog(allEntries);
  const dogIds = [...entriesByDog.keys()].filter(Boolean);

  // 4. Fetch dogs, registrations, pedigree in parallel
  const [{ data: dogsRaw }, { data: regsRaw }, { data: pedigreeRaw }] = await Promise.all([
    supabase
      .from('dogs')
      .select('id, call_name, sex, date_of_birth, owner_id, breeder_id')
      .in('id', dogIds),
    supabase
      .from('dog_registrations')
      // `id` and `created_at` are the resolver's tiebreak fields: a dog may hold
      // both an `AKC` and an `AKC (American Kennel Club)` row (the UNIQUE
      // constraint is exact-string), and both normalize to AKC. Without them the
      // comparator ties and the printed number could vary between runs.
      .select(
        'dog_id, id, created_at, registered_name, registration_number, organization, variety, breed'
      )
      .in('dog_id', dogIds),
    supabase
      .from('pedigree_ancestors')
      .select('dog_id, position, registered_name')
      .in('dog_id', dogIds)
      .in('position', ['sire', 'dam']),
  ]);

  // 5. Fetch people (owners + breeders)
  const ownerIds = new Set<string>();
  const breederIds = new Set<string>();
  for (const dog of dogsRaw ?? []) {
    if (dog.owner_id) ownerIds.add(dog.owner_id);
    if (dog.breeder_id) breederIds.add(dog.breeder_id);
  }
  const allPersonIds = [...new Set([...ownerIds, ...breederIds])].filter(Boolean);

  const { data: personsRaw } = await supabase
    .from('people')
    .select('id, first_name, last_name, street_address, city, state, zip_code, phone, email')
    .in('id', allPersonIds);

  const personMap = new Map((personsRaw ?? []).map(p => [p.id, p]));

  // Index pedigree
  const pedigreeMap = new Map<string, { sire: string | null; dam: string | null }>();
  for (const p of pedigreeRaw ?? []) {
    const existing = pedigreeMap.get(p.dog_id) ?? { sire: null, dam: null };
    if (p.position === 'sire') existing.sire = p.registered_name;
    if (p.position === 'dam') existing.dam = p.registered_name;
    pedigreeMap.set(p.dog_id, existing);
  }

  // Index registrations by dog. Selection is deliberately NOT done here: this
  // hook feeds organization-scoped paperwork (AKC scent work entry/transfer
  // forms, UKC nosework entry/change forms), so the registration is resolved
  // strictly against `preferredRegistrationOrganization` below, with **no
  // cross-organization fallback**. Printing a UKC number or a UKC breed on an
  // AKC form is worse than leaving the field blank.
  const regsByDog = new Map<string, DogRegistrationLike[]>();
  for (const r of regsRaw ?? []) {
    const list = regsByDog.get(r.dog_id) ?? [];
    list.push(r as DogRegistrationLike);
    regsByDog.set(r.dog_id, list);
  }

  // 6. Fetch secretary via the get_show_officials RPC.
  // SA-006: user_roles is no longer directly SELECT-able cross-user, so the
  // show's officials come from the SECURITY DEFINER RPC (migration 20260703180000).
  const { data: officialsData } = await supabase.rpc('get_show_officials', {
    p_show_id: showId,
  });
  const secretaryRow = (
    (officialsData as Array<{ user_id: string; role: string }> | null) || []
  ).find(o => o.role === 'secretary');
  const secretaryRole = secretaryRow ? { user_id: secretaryRow.user_id } : null;

  let secretary: EntryFormSecretary | null = null;
  if (secretaryRole?.user_id) {
    let secPerson = personMap.get(secretaryRole.user_id);
    if (!secPerson) {
      const { data: secData } = await supabase
        .from('people')
        .select('first_name, last_name, street_address, city, state, zip_code')
        .eq('id', secretaryRole.user_id)
        .maybeSingle();
      secPerson = (secData as unknown as typeof secPerson) ?? undefined;
    }
    if (secPerson) {
      secretary = buildSecretary(secPerson as Record<string, unknown>);
    }
  }

  // 7. Assemble EntryFormDog[] with all joined data
  const dogs: EntryFormDog[] = [];
  for (const dog of dogsRaw ?? []) {
    const dogEntries = entriesByDog.get(dog.id) ?? [];
    if (dogEntries.length === 0) continue;

    const ownerRaw = dog.owner_id ? personMap.get(dog.owner_id) : null;
    const owner: EntryFormPerson = ownerRaw
      ? {
          firstName: ownerRaw.first_name,
          lastName: ownerRaw.last_name,
          streetAddress: ownerRaw.street_address,
          city: ownerRaw.city,
          state: ownerRaw.state,
          zipCode: ownerRaw.zip_code,
          phone: ownerRaw.phone,
          email: ownerRaw.email,
        }
      : {
          firstName: null,
          lastName: null,
          streetAddress: null,
          city: null,
          state: null,
          zipCode: null,
          phone: null,
          email: null,
        };

    const breederRaw = dog.breeder_id ? personMap.get(dog.breeder_id) : null;
    const breederName = breederRaw ? formatPersonName(breederRaw) : null;

    const pedigree = pedigreeMap.get(dog.id);
    // Breed, registered name, variety and number all belong to the registration
    // with this organization — never to the dog record, and never borrowed from
    // another organization's registration.
    const identity = resolveDogIdentityForOrganization(
      regsByDog.get(dog.id),
      preferredRegistrationOrganization
    );
    const reg: EntryFormRegistration | null =
      identity.registrationNumber != null
        ? {
            registeredName: identity.registeredName,
            registrationNumber: identity.registrationNumber,
            organization: identity.organization ?? preferredRegistrationOrganization,
            variety: identity.variety,
          }
        : null;

    const ownerFullName = formatPersonName({
      first_name: owner.firstName,
      last_name: owner.lastName,
    });
    const handlerEntry = dogEntries.find(e => e.handler && e.handler !== ownerFullName);
    const handler = handlerEntry?.handler ?? null;

    const armband = dogEntries.find(e => e.armband != null)?.armband ?? null;
    const agreementDate = dogEntries.find(e => e.submittedAt)?.submittedAt ?? null;

    dogs.push({
      dogId: dog.id,
      callName: dog.call_name ?? '',
      breed: identity.breed ?? '',
      sex: dog.sex,
      dateOfBirth: dog.date_of_birth,
      registration: reg,
      breeder: breederName || null,
      sire: pedigree?.sire ?? null,
      dam: pedigree?.dam ?? null,
      owner,
      handler,
      armband,
      entries: dogEntries,
      agreementDate,
    });
  }

  return { dogs, secretary, trials, classes, show };
}

export function useEntryFormData({
  enabled = true,
  showId,
  trialId,
  dogId,
  preferredRegistrationOrganization,
}: UseEntryFormDataOptions): UseEntryFormDataResult {
  const query = useQuery({
    queryKey: [
      'entry-form-data',
      showId,
      trialId ?? 'all',
      dogId ?? 'all',
      preferredRegistrationOrganization ?? 'AKC',
    ],
    queryFn: () =>
      fetchEntryFormData(showId, trialId, dogId, preferredRegistrationOrganization ?? 'AKC'),
    enabled: enabled && !!showId,
    ...cacheStrategies.moderate,
  });

  return {
    dogs: query.data?.dogs ?? [],
    secretary: query.data?.secretary ?? null,
    trials: query.data?.trials ?? [],
    classes: query.data?.classes ?? [],
    show: query.data?.show ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
