/**
 * MYK9-594 round-1 review (P1): this is the ONE real no-handler surface —
 * the person-detail Dogs tab mounts `DogEditPanel` with no status dialog
 * behind it, so `DogStatusRow` renders read-only. That is only an
 * improvement if the plumbing actually carries `dogStatus`/`dogDeceasedDate`
 * from `dogToEdit` (a full `Dog`) into the panel; otherwise the read-only
 * badge silently defaults every dog to "Active" and drops the date of
 * passing, which is worse than showing nothing.
 *
 * ASSERTION-FIRST: written to fail red against the panel mounted with no
 * `dogStatus`/`dogDeceasedDate` props (the pre-fix code), and pass once
 * `UserDetailsTabs.tsx` plumbs them from `dogToEdit`, mirroring the
 * `DogDialogs.tsx` hop (`dogStatus={dog.status}`,
 * `dogDeceasedDate={dog.deceasedDate ? formatDisplayDate(dog.deceasedDate) : undefined}`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import PeopleDetailsTabs from './UserDetailsTabs';
import type { Dog, User } from '@/types/dog-types';

// Bypass the real dog-card grid: expose a single button per dog that fires
// the same `onEditDog(id)` callback AssociatedDogsSection's own Edit action
// raises, so this test can open the panel without fighting DogCard's DOM.
vi.mock('../AssociatedDogsSection', () => ({
  default: (props: { dogs: Dog[]; onEditDog?: (id: string) => void }) => (
    <div>
      {props.dogs.map(dog => (
        <button key={dog.id} onClick={() => props.onEditDog?.(dog.id)}>
          Edit {dog.callName}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: mockDogs,
    updateDog: vi.fn(),
    deleteDog: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  return {
    ...actual,
    useAuthContext: () => ({ getUserRoles: () => [] }),
  };
});

let mockDogs: Dog[] = [];

const selectedUser: User = {
  id: 'owner-1',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'pat@example.com',
  roles: [],
  dogs: [],
} as unknown as User;

function makeDog(overrides: Partial<Dog> = {}): Dog {
  return {
    id: 'dog-1',
    name: 'Juniper',
    callName: 'Juni',
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-1',
    ...overrides,
  } as Dog;
}

describe('UserDetailsTabs — Status row plumbing (person-detail Dogs tab)', () => {
  beforeEach(() => {
    mockDogs = [];
  });

  it("carries the dog's stored retired status into the read-only Status row", () => {
    mockDogs = [makeDog({ status: 'retired' })];
    render(<PeopleDetailsTabs selectedUser={selectedUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Juni' }));

    expect(screen.getByRole('group', { name: 'Status' })).toHaveTextContent('Retired');
    // No dialog is mounted behind this surface, so no change control either.
    expect(screen.queryByRole('button', { name: /change status/i })).not.toBeInTheDocument();
  });

  it('carries a deceased status and its formatted date of passing', () => {
    mockDogs = [makeDog({ status: 'deceased', deceasedDate: '2026-03-03' })];
    render(<PeopleDetailsTabs selectedUser={selectedUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Juni' }));

    // `formatDisplayDate` renders M/D/YYYY, the same form DogDialogs' hop uses.
    expect(screen.getByRole('group', { name: 'Status' })).toHaveTextContent('Deceased — 3/3/2026');
  });
});
