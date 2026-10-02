/**
 * MYK9-930 review: unresolved identity or people is NOT "Dog Not Found". The REAL
 * useRoleBasedDogs and useCanAccessDog run; only auth, the dog store and the
 * people store are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = vi.hoisted(() => ({
  value: {
    userWithRoles: null as null | { id: string; databaseUserId?: string },
    roles: [] as string[],
  },
}));
const store = vi.hoisted(() => ({
  dogs: [] as Array<Record<string, unknown>>,
  people: [] as unknown[],
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: auth.value.userWithRoles,
    hasRole: (role: string) => auth.value.roles.includes(role),
  }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: store.dogs,
    isLoading: false,
    isFetching: false,
    error: null,
    updateDog: vi.fn(),
  }),
}));
vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) =>
    selector({ people: store.people }),
}));
vi.mock('@/hooks/useViewerOwnsDog', () => ({ useViewerOwnsDog: () => false }));
vi.mock('@/components/dogs/DogDetailsMain', () => ({
  default: ({ dog }: { dog: { callName: string } }) => (
    <div data-testid="dog-page">{dog.callName}</div>
  ),
}));

import DogDetailPage from '../DogDetailPage';

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/dogs/${id}`]}>
      <Routes>
        <Route path="/dogs/:id" element={<DogDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const maple = { id: 'dog-1', name: 'Maple', callName: 'Maple', ownerId: 'p-1', sex: 'female' };
const rex = { id: 'dog-2', name: 'Rex', callName: 'Rex', ownerId: 'p-2', sex: 'male' };

beforeEach(() => {
  auth.value = { userWithRoles: { id: 'auth-1', databaseUserId: 'p-1' }, roles: ['exhibitor'] };
  store.dogs = [maple, rex];
  store.people = [];
});

describe('DogDetailPage with unresolved inputs (MYK9-930)', () => {
  it('positive control: an exhibitor opens their own dog', () => {
    renderAt('dog-1');
    expect(screen.getByTestId('dog-page')).toHaveTextContent('Maple');
  });

  it('positive control: an id that is on no roster IS Dog Not Found', () => {
    renderAt('ghost');
    expect(screen.getByRole('heading', { name: 'Dog Not Found' })).toBeInTheDocument();
  });

  it('does not say Not Found or refuse while the viewer identity is unresolved', () => {
    auth.value = { userWithRoles: null, roles: [] };

    renderAt('dog-1');

    expect(
      screen.queryByRole('heading', { name: /not found|can't open/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('dog-page')).not.toBeInTheDocument();
  });

  it('does not refuse an exhibitor whose person row has not resolved yet', () => {
    auth.value = { userWithRoles: { id: 'auth-1' }, roles: ['exhibitor'] };
    store.people = [];

    renderAt('dog-1');

    expect(
      screen.queryByRole('heading', { name: /not found|can't open/i })
    ).not.toBeInTheDocument();
  });

  it('says "You can\'t open this dog", not Not Found, for someone else\'s dog', () => {
    renderAt('dog-2');

    expect(screen.getByRole('heading', { name: "You can't open this dog" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dog Not Found' })).not.toBeInTheDocument();
  });
});
