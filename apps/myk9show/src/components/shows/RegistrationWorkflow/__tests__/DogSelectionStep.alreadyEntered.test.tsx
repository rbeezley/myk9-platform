/**
 * MYK9-1963: the Dogs step said nothing about a dog already entered in this
 * show ("Used for this show" is about the NUMBER). The card says it, and the
 * dog can still be selected to add more classes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { fromPartial } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import { DogSelectionStep } from '@/components/shows/RegistrationWorkflow/DogSelectionStep';
import type { Dog } from '@/types/dog-types';

vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: vi.fn() }));
vi.mock('@/hooks/useExistingEntries', () => ({ useExistingEntries: vi.fn() }));

import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useExistingEntries } from '@/hooks/useExistingEntries';

const dog = (id: string, callName: string): Dog =>
  fromPartial<Dog>({
    id,
    name: callName,
    callName,
    breed: 'Golden Retriever',
    gender: 'Female',
    ownerId: 'owner-1',
    dateOfBirth: '2020-01-01',
    status: 'active',
    registrations: [],
    registrationsReadComplete: true,
  });

const entriesFor = (counts: Record<string, number>) => (dogId: string) =>
  Array.from({ length: counts[dogId] ?? 0 }, (_, index) => ({
    dogId,
    classId: `class-${index}`,
    registrationId: 'reg-1',
    status: 'submitted',
  }));

function mount(counts: Record<string, number>, showId: string | null = 'show-1') {
  vi.mocked(useDogStoreCompat).mockReturnValue(
    fromPartial({ dogs: [dog('dog-1', 'Maple'), dog('dog-2', 'Rex')], isLoading: false })
  );
  vi.mocked(useExistingEntries).mockReturnValue(
    fromPartial({ getEntriesForDog: entriesFor(counts) })
  );
  const onSelectionChange = vi.fn();
  return {
    onSelectionChange,
    ...render(
      <DogSelectionStep
        selectedDogs={[]}
        onSelectionChange={onSelectionChange}
        {...(showId ? { showId } : {})}
      />
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DogSelectionStep — a dog already entered in this show', () => {
  it('marks only the dog with entries, with its class count', () => {
    mount({ 'dog-1': 2 });

    expect(screen.getByText('Already entered in 2 classes')).toBeInTheDocument();
    expect(screen.getAllByText(/Already entered in/)).toHaveLength(1);
  });

  it('says "1 class" for a single entry', () => {
    mount({ 'dog-1': 1 });

    expect(screen.getByText('Already entered in 1 class')).toBeInTheDocument();
  });

  it('still lets her select the dog to add more classes', async () => {
    const { onSelectionChange, user } = mount({ 'dog-1': 2 });

    const checkbox = screen.getByRole('checkbox', { name: 'Select Maple' });
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledWith(['dog-1']);
  });

  it('marks nothing when the show is not known', () => {
    mount({ 'dog-1': 2 }, null);

    expect(screen.queryByText(/Already entered in/)).not.toBeInTheDocument();
  });
});
