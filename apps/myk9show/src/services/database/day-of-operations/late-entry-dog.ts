import { createDog } from '@/services/database/dogs';
import { createUser, deleteUser, searchUsers } from '@/services/database/users';
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
    const ownerResult = await createUser({
      first_name: ownerFirstName,
      last_name: ownerLastName,
      email: ownerEmail,
      phone: cleanOptional(input.ownerPhone),
      status: 'active',
    });

    if (ownerResult.error || !ownerResult.data) {
      return {
        data: null,
        error:
          ownerResult.error instanceof Error
            ? ownerResult.error
            : new Error('Unable to create exhibitor.'),
      };
    }

    owner = ownerResult.data;
    createdOwnerId = owner.id;
  }

  const { data: dog, error: dogError } = await createDog({
    // `dogName` here is a name the secretary typed as the dog's name, not a
    // copy of the call name, so it still populates the legacy column (same as
    // `create_show_managed_dog`). MYK9-90 §5.3 removes the *copy*, not this.
    name: dogName,
    // MYK9-90 §5.1 — `dogs.call_name` is NOT NULL after 20260727110000, and the
    // call name is optional in this input. Fall back to the dog name rather
    // than requiring a second field: this is the show-day late-entry desk, and
    // a secretary taking an entry at the gate should not be blocked because
    // they typed one name instead of two. A dog whose only known name is what
    // was written on the form has that as its call name.
    call_name: dogCallName ?? dogName,
    breed: dogBreed,
    owner_id: owner.id,
    status: 'active',
  });

  if (dogError || !dog) {
    if (createdOwnerId) {
      await deleteUser(createdOwnerId);
    }

    return {
      data: null,
      error: dogError instanceof Error ? dogError : new Error('Unable to create dog.'),
    };
  }

  return {
    data: {
      id: dog.id,
      // MYK9-90 §5.2 — `dogs.name` is a nullable legacy alias; fall back to the
      // (NOT NULL) call name so this row never surfaces a dog with no name.
      name: dog.name ?? dog.call_name ?? '',
      call_name: dog.call_name ?? null,
      breed: dog.breed ?? null,
      owner: {
        id: owner.id,
        first_name: owner.first_name ?? null,
        last_name: owner.last_name ?? null,
      },
    },
    error: null,
  };
}
