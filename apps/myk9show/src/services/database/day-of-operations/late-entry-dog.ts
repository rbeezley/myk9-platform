import { createDog } from '@/services/database/dogs';
import { createUser } from '@/services/database/users';
import type {
  CreateDayOfEntryDogInput,
  DayOfEntryDogResult,
} from '@/services/database/day-of-operations/types';

function cleanOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createDayOfEntryDog(
  input: CreateDayOfEntryDogInput
): Promise<{ data: DayOfEntryDogResult | null; error: Error | null }> {
  const ownerFirstName = input.ownerFirstName.trim();
  const ownerLastName = input.ownerLastName.trim();
  const dogName = input.dogName.trim();
  const dogCallName = cleanOptional(input.dogCallName);
  const dogBreed = input.dogBreed?.trim() || 'Mixed Breed';

  if (!ownerFirstName || !ownerLastName || !dogName) {
    return {
      data: null,
      error: new Error('Please enter the exhibitor name and dog name.'),
    };
  }

  const { data: owner, error: ownerError } = await createUser({
    first_name: ownerFirstName,
    last_name: ownerLastName,
    email: cleanOptional(input.ownerEmail),
    phone: cleanOptional(input.ownerPhone),
    status: 'active',
  });

  if (ownerError || !owner) {
    return {
      data: null,
      error: ownerError instanceof Error ? ownerError : new Error('Unable to create exhibitor.'),
    };
  }

  const { data: dog, error: dogError } = await createDog({
    name: dogName,
    call_name: dogCallName,
    breed: dogBreed,
    owner_id: owner.id,
    status: 'active',
  });

  if (dogError || !dog) {
    return {
      data: null,
      error: dogError instanceof Error ? dogError : new Error('Unable to create dog.'),
    };
  }

  return {
    data: {
      id: dog.id,
      name: dog.name,
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

