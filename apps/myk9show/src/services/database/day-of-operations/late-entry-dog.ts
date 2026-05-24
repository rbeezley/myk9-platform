import { supabase } from '@/lib/supabase';
import { searchUsers } from '@/services/database/users';
import type {
  CreateDayOfEntryDogInput,
  DayOfEntryDogResult,
} from '@/services/database/day-of-operations/types';

interface DayOfEntryOwnerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

function cleanOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sameName(person: DayOfEntryOwnerRow, firstName: string, lastName: string): boolean {
  return (
    (person.first_name ?? '').trim().toLowerCase() === firstName.toLowerCase() &&
    (person.last_name ?? '').trim().toLowerCase() === lastName.toLowerCase()
  );
}

async function findExistingOwner(firstName: string, lastName: string) {
  const { data, error } = await searchUsers(lastName);
  if (error) return { data: null, error };

  const owner =
    (data as DayOfEntryOwnerRow[] | null | undefined)?.find(person =>
      sameName(person, firstName, lastName)
    ) ?? null;

  return { data: owner, error: null };
}

export async function createDayOfEntryDog(
  input: CreateDayOfEntryDogInput
): Promise<{ data: DayOfEntryDogResult | null; error: Error | null }> {
  const ownerFirstName = input.ownerFirstName.trim();
  const ownerLastName = input.ownerLastName.trim();
  const ownerEmail = cleanOptional(input.ownerEmail);
  const dogName = input.dogName.trim();
  const dogCallName = cleanOptional(input.dogCallName);
  const dogBreed = input.dogBreed?.trim() || 'Mixed Breed';

  if (!ownerFirstName || !ownerLastName || !dogName) {
    return {
      data: null,
      error: new Error('Please enter the exhibitor name and dog name.'),
    };
  }

  if (ownerEmail && !isValidEmail(ownerEmail)) {
    return {
      data: null,
      error: new Error('Please enter a valid email address or leave it blank.'),
    };
  }

  const existingOwnerResult = await findExistingOwner(ownerFirstName, ownerLastName);
  if (existingOwnerResult.error) {
    return { data: null, error: existingOwnerResult.error };
  }

  let createdOwnerId: string | null = null;
  let owner = existingOwnerResult.data;

  if (!owner) {
    const { data: personId, error: ownerError } = await supabase.rpc('create_show_managed_person', {
      p_show_id: input.showId,
      p_first_name: ownerFirstName,
      p_last_name: ownerLastName,
      p_email: ownerEmail,
      p_phone: cleanOptional(input.ownerPhone),
    });

    if (ownerError || !personId) {
      return {
        data: null,
        error: ownerError instanceof Error ? ownerError : new Error('Unable to create exhibitor.'),
      };
    }

    owner = {
      id: personId,
      first_name: ownerFirstName,
      last_name: ownerLastName,
    };
    createdOwnerId = owner.id;
  }

  const { data: dogId, error: dogError } = await supabase.rpc('create_show_managed_dog', {
    p_show_id: input.showId,
    p_owner_id: owner.id,
    p_name: dogName,
    p_breed: dogBreed,
    p_call_name: dogCallName,
    p_sex: null,
    p_akc_number: null,
    p_ukc_number: null,
    p_microchip_number: null,
  });

  if (dogError || !dogId) {
    if (createdOwnerId) {
      await supabase.rpc('delete_show_managed_person', {
        p_show_id: input.showId,
        p_person_id: createdOwnerId,
      });
    }

    return {
      data: null,
      error: dogError instanceof Error ? dogError : new Error('Unable to create dog.'),
    };
  }

  return {
    data: {
      id: dogId,
      name: dogName,
      call_name: dogCallName,
      breed: dogBreed,
      owner: {
        id: owner.id,
        first_name: owner.first_name ?? null,
        last_name: owner.last_name ?? null,
      },
    },
    error: null,
  };
}
