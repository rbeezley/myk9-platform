import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import { groupEntriesByDog } from '@/lib/reports/entryFormUtils';
import type {
  EntryFormDog,
  EntryFormSecretary,
  EntryFormTrial,
  EntryFormClass,
  EntryFormEntry,
  EntryFormRegistration,
  EntryFormPerson,
} from '@/lib/reports/entryFormTypes';

export interface UseEntryFormDataOptions {
  showId: string;
  trialId?: string;
  dogId?: string;
}

export interface UseEntryFormDataResult {
  dogs: EntryFormDog[];
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  classes: EntryFormClass[];
  isLoading: boolean;
  isError: boolean;
}

async function fetchEntryFormData(
  showId: string,
  trialId?: string,
  dogId?: string
): Promise<{
  dogs: EntryFormDog[];
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  classes: EntryFormClass[];
}> {
  // 1. Fetch trials
  const { data: trialsRaw } = await supabase
    .from('trials')
    .select('id, date, trial_number')
    .eq('show_id', showId)
    .order('date')
    .order('trial_number');

  const trials: EntryFormTrial[] = (trialsRaw ?? []).map(t => ({
    id: t.id,
    date: t.date ?? '',
    trialNumber: t.trial_number ?? 0,
  }));

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
    return { dogs: [], secretary: null, trials, classes };
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
      .select('id, call_name, breed, sex, date_of_birth, owner_id, breeder_id')
      .in('id', dogIds),
    supabase
      .from('dog_registrations')
      .select('dog_id, registered_name, registration_number, organization, variety')
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

  // Index registrations (prefer AKC)
  const regMap = new Map<string, EntryFormRegistration>();
  for (const r of regsRaw ?? []) {
    const existing = regMap.get(r.dog_id);
    if (!existing || r.organization === 'AKC') {
      regMap.set(r.dog_id, {
        registeredName: r.registered_name,
        registrationNumber: r.registration_number,
        organization: r.organization,
        variety: r.variety,
      });
    }
  }

  // 6. Fetch secretary via user_roles
  const { data: secretaryRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('scope_id', showId)
    .eq('role', 'secretary')
    .limit(1)
    .maybeSingle();

  let secretary: EntryFormSecretary | null = null;
  if (secretaryRole?.user_id) {
    const secPerson = personMap.get(secretaryRole.user_id);
    if (!secPerson) {
      const { data: secData } = await supabase
        .from('people')
        .select('first_name, last_name, street_address, city, state, zip_code')
        .eq('id', secretaryRole.user_id)
        .maybeSingle();
      if (secData) {
        secretary = {
          name: `${secData.first_name ?? ''} ${secData.last_name ?? ''}`.trim(),
          streetAddress: secData.street_address,
          city: secData.city,
          state: secData.state,
          zipCode: secData.zip_code,
        };
      }
    } else {
      secretary = {
        name: `${secPerson.first_name ?? ''} ${secPerson.last_name ?? ''}`.trim(),
        streetAddress: secPerson.street_address,
        city: secPerson.city,
        state: secPerson.state,
        zipCode: secPerson.zip_code,
      };
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
    const breederName = breederRaw
      ? `${breederRaw.first_name ?? ''} ${breederRaw.last_name ?? ''}`.trim()
      : null;

    const pedigree = pedigreeMap.get(dog.id);
    const reg = regMap.get(dog.id) ?? null;

    // Handler: if entry has a handler name different from owner, build a minimal EntryFormPerson
    const ownerFullName = `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim();
    const handlerEntry = dogEntries.find(e => e.handler && e.handler !== ownerFullName);
    let handler: EntryFormPerson | null = null;
    if (handlerEntry?.handler) {
      // Handler is stored as a name string in entries; build a minimal person
      const parts = handlerEntry.handler.trim().split(/\s+/);
      const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
      const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] ?? null);
      handler = {
        firstName,
        lastName,
        streetAddress: null,
        city: null,
        state: null,
        zipCode: null,
        phone: null,
        email: null,
      };
    }

    const armband = dogEntries.find(e => e.armband != null)?.armband ?? null;
    const agreementDate = dogEntries.find(e => e.submittedAt)?.submittedAt ?? null;

    dogs.push({
      dogId: dog.id,
      callName: dog.call_name ?? '',
      breed: dog.breed ?? '',
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

  return { dogs, secretary, trials, classes };
}

export function useEntryFormData({
  showId,
  trialId,
  dogId,
}: UseEntryFormDataOptions): UseEntryFormDataResult {
  const query = useQuery({
    queryKey: ['entry-form-data', showId, trialId ?? 'all', dogId ?? 'all'],
    queryFn: () => fetchEntryFormData(showId, trialId, dogId),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });

  return {
    dogs: query.data?.dogs ?? [],
    secretary: query.data?.secretary ?? null,
    trials: query.data?.trials ?? [],
    classes: query.data?.classes ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
