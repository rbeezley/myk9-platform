/**
 * MYK9-1594: "Add entry for <exhibitor>" opens the secretary wizard with `?exhibitor=<person id>`.
 * The dog step then offers that person's dogs first (not the whole local roster), says whose
 * entries these are, and goes back to its ordinary search the moment the secretary types.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { selectedDogsOwner } from '@/features/registration/selectedDogsOwner';
import type { Dog } from '@/types/dog-types';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';

const dbDog = (id: string, callName: string, ownerId: string, first: string, last: string) => ({
  id,
  name: callName,
  call_name: callName,
  owner_id: ownerId,
  owner: { id: ownerId, first_name: first, last_name: last },
  status: 'active',
  registrations: [],
});

const roster = vi.hoisted(() => ({
  ownerQuery: vi.fn(),
}));

const store = vi.hoisted(() => ({
  dogs: [] as unknown[],
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  // A getter, not a copy: the test swaps the wizard's list the way a refetch would.
  useDogStoreCompat: () => ({ dogs: store.dogs, isLoading: false }),
}));
const wizardDog = (id: string, callName: string, ownerId: string, ownerName: string) => ({
  id,
  name: callName,
  callName,
  ownerId,
  ownerName,
  status: 'active',
  registrations: [],
});
const BOB = wizardDog('dog-bob', 'Scout', 'person-bob', 'Bob Stone');
const POPPY = wizardDog('dog-alice-1', 'Poppy', 'person-alice', 'Alice Martin');
const BEAN = wizardDog('dog-alice-2', 'Bean', 'person-alice', 'Alice Martin');
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsByOwnerQuery: (ownerId: string, enabled: boolean) => roster.ownerQuery(ownerId, enabled),
}));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    user: { id: 'u1' },
    roles: [UserRole.SECRETARY],
    canBulkOperations: true,
    canCreateExhibitor: true,
    getMaxDogsPerRegistration: () => 50,
  }),
}));
vi.mock('@/hooks/useRegistrationContext', () => ({
  useRegistrationContext: () => ({
    workflowConfig: { features: { advancedSearch: true, createNew: true } },
  }),
}));
vi.mock('./QuickCreateFlow', () => ({ QuickCreateFlow: () => null }));
vi.mock('@/components/panels/edit', () => ({ AddDogPanel: () => null }));
vi.mock('@/services/database/dogs', () => ({
  SEARCH_ALL_DOGS_LIMIT: 25,
  searchAllDogs: vi.fn(async () => ({ data: [], error: null, hitLimit: false })),
}));

const rowsFor = (...dogs: ReturnType<typeof dbDog>[]) => ({ data: dogs, isError: false });

describe('DogSelectionStepEnhanced with an exhibitor named in the URL', () => {
  beforeEach(() => {
    store.dogs = [BOB, POPPY, BEAN];
  });

  it("offers that exhibitor's dogs first, not the rest of the roster, and says whose entries these are", async () => {
    roster.ownerQuery.mockReturnValue(
      rowsFor(
        dbDog('dog-alice-1', 'Poppy', 'person-alice', 'Alice', 'Martin'),
        dbDog('dog-alice-2', 'Bean', 'person-alice', 'Alice', 'Martin')
      )
    );

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />, {
      initialRoute: '/secretary/register/show-1?exhibitor=person-alice&returnForm=reg-1',
    });

    expect(await screen.findByText('Bean')).toBeInTheDocument();
    expect(screen.getByText('Poppy')).toBeInTheDocument();
    expect(screen.queryByText('Scout')).toBeNull();
    expect(screen.getByTestId('exhibitor-entry-notice')).toHaveTextContent(
      'Adding entries for Alice Martin.'
    );
    expect(roster.ownerQuery).toHaveBeenCalledWith('person-alice', true);
  });

  it('is the ordinary dog step, with no notice, when no exhibitor is named', () => {
    roster.ownerQuery.mockReturnValue({ data: undefined, isError: false });

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />, {
      initialRoute: '/secretary/register/show-1',
    });

    expect(screen.queryByTestId('exhibitor-entry-notice')).toBeNull();
    expect(roster.ownerQuery).toHaveBeenLastCalledWith('', false);
  });

  it('falls back to the ordinary dog step, with no notice, when the exhibitor read fails', () => {
    roster.ownerQuery.mockReturnValue({ data: undefined, isError: true });

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />, {
      initialRoute: '/secretary/register/show-1?exhibitor=person-alice',
    });

    expect(screen.queryByTestId('exhibitor-entry-notice')).toBeNull();
  });

  it("offers only dogs the wizard's own list can resolve, and refetches that list for the rest", async () => {
    // Added minutes ago by another official: the owner query has Bean, the wizard's cache does not.
    store.dogs = [BOB, POPPY];
    roster.ownerQuery.mockReturnValue(
      rowsFor(
        dbDog('dog-alice-1', 'Poppy', 'person-alice', 'Alice', 'Martin'),
        dbDog('dog-alice-2', 'Bean', 'person-alice', 'Alice', 'Martin')
      )
    );
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { rerender } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />,
      { initialRoute: '/secretary/register/show-1?exhibitor=person-alice', queryClient }
    );

    expect(await screen.findByText('Poppy')).toBeInTheDocument();
    // Not pickable yet: picking it would leave owner resolution false and Next disabled.
    expect(screen.queryByText('Bean')).toBeNull();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dogs }));

    // The refetch lands: the dog is now in the wizard's list, so it is offered and resolvable.
    store.dogs = [BOB, POPPY, BEAN];
    rerender(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    expect(await screen.findByText('Bean')).toBeInTheDocument();
    expect(selectedDogsOwner(store.dogs as Dog[], ['dog-alice-2'])).toMatchObject({
      ok: true,
      ownerId: 'person-alice',
    });
  });
});
