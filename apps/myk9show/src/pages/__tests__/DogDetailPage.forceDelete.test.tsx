import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';

/**
 * MYK9-595, on the shared delete path (CRUD standard Phase 2): while a delete
 * started on this page is running, the dog is purged from this device before
 * the dialog finishes, so the roster the page reads says the dog is gone. The
 * page must stay mounted (and the dialog with it) and must not bounce the admin
 * to /dogs, and must not show a false "Dog Not Found". On success it leaves for /dogs once; on
 * failure it stays; a late success never yanks the admin off another dog.
 *
 * The roster, the redirect effect and the router are real. Only DogDetailsMain
 * is stubbed, to a shell that drives the page's delete callbacks the way the
 * shared DeleteObjectDialog does: start, then deleted or failed.
 */

const { navigateSpy, roster } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  roster: {
    dogs: [
      { id: 'dog-1', call_name: 'Max', name: null, owner_id: 'person-1', sex: 'male' },
      { id: 'dog-2', call_name: 'Bella', name: null, owner_id: 'person-1', sex: 'female' },
    ] as Array<Record<string, unknown>>,
  },
}));

vi.mock('@/services/database/dogs', () => ({
  getAllDogs: vi.fn(async () => ({ data: roster.dogs, error: null })),
  getDogById: vi.fn(async () => ({ data: null, error: null })),
  getDogsByOwner: vi.fn(async () => ({ data: [], error: null })),
  getOwnedLiveDogsByPerson: vi.fn(async () => ({ data: [], error: null })),
  searchDogs: vi.fn(async () => ({ data: [], error: null })),
  getDogStatistics: vi.fn(async () => ({ data: null, error: null })),
  createDog: vi.fn(),
  updateDog: vi.fn(),
}));

vi.mock('@/hooks/useCurrentPersonId', () => ({
  useCurrentPersonId: () => 'person-1',
}));

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    useAuthContext: () => ({
      hasRole: (role: UserRole) => role === UserRole.SITE_ADMIN,
      getUserRoles: () => ['site_admin'],
      userWithRoles: { id: 'user-1', databaseUserId: 'person-1', roles: [] },
    }),
  };
});

// Real navigation is kept (so a redirect genuinely swaps the route) and spied.
vi.mock('react-router-dom', async importOriginal => {
  const actual = (await importOriginal()) as typeof import('react-router-dom');
  return {
    ...actual,
    useNavigate: () => {
      const navigate = actual.useNavigate();
      return React.useCallback(
        (...args: Parameters<ReturnType<typeof actual.useNavigate>>) => {
          navigateSpy(...args);
          return navigate(...args);
        },
        [navigate]
      );
    },
  };
});

/** The delete the stub dialog is running, settled by the test. */
const pending = vi.hoisted(() => ({
  settle: null as null | ((ok: boolean) => void),
}));

const DogDetailsMainStub: React.FC<{
  dog: { id: string; callName: string };
  onDeleteStart?: () => void;
  onDeleted?: (dogId: string) => void;
  onDeleteFailed?: () => void;
}> = ({ dog, onDeleteStart, onDeleted, onDeleteFailed }) => {
  const [open, setOpen] = React.useState(false);
  const confirm = () => {
    onDeleteStart?.();
    pending.settle = ok => {
      if (ok) {
        setOpen(false);
        onDeleted?.(dog.id);
      } else {
        onDeleteFailed?.();
      }
    };
  };
  return (
    <div>
      <div>Dog page for {dog.callName}</div>
      <button onClick={() => setOpen(true)}>Open delete dialog</button>
      {open && (
        <div role="dialog">
          <button onClick={confirm}>Confirm delete</button>
        </div>
      )}
    </div>
  );
};

vi.mock('@/components/dogs/DogDetailsMain', () => ({
  default: (props: React.ComponentProps<typeof DogDetailsMainStub>) => (
    <DogDetailsMainStub {...props} />
  ),
}));

const queryClient = createTestQueryClient();

const renderDogPage = async (initialRoute = '/dogs/dog-1') => {
  const DogDetailPage = (await import('../DogDetailPage')).default;
  return render(
    <>
      <Link to="/dogs/dog-404">Go to an unknown dog</Link>
      <Link to="/dogs/dog-2">Go to Bella</Link>
      <Routes>
        <Route path="/dogs/:id" element={<DogDetailPage />} />
        <Route path="/dogs" element={<div>dogs-list-page</div>} />
      </Routes>
    </>,
    { initialRoute, queryClient }
  );
};

/** What the shared dialog's purge + invalidation does to the roster mid-delete. */
async function purgeMax() {
  roster.dogs = roster.dogs.filter(dog => dog.id !== 'dog-1');
  await act(async () => {
    queryClient.setQueriesData<Array<{ id: string }>>({ queryKey: ['dogs'] }, old =>
      Array.isArray(old) ? old.filter(dog => dog.id !== 'dog-1') : old
    );
    // React Query notifies observers on a timer: let the page re-render on the
    // purged roster before anything is asserted, or the assertions are vacuous.
    await new Promise(resolve => setTimeout(resolve, 50));
  });
  expect(
    queryClient
      .getQueriesData<Array<{ id: string }>>({ queryKey: ['dogs'] })
      .some(([, data]) => Array.isArray(data) && data.length === 1)
  ).toBe(true);
}

async function startDelete(user: Awaited<ReturnType<typeof renderDogPage>>['user']) {
  await screen.findByText('Dog page for Max');
  await user.click(screen.getByRole('button', { name: 'Open delete dialog' }));
  await user.click(await screen.findByRole('button', { name: 'Confirm delete' }));
}

describe('DogDetailPage while its own delete runs (MYK9-595)', () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    pending.settle = null;
    queryClient.clear();
    roster.dogs = [
      { id: 'dog-1', call_name: 'Max', name: null, owner_id: 'person-1', sex: 'male' },
      { id: 'dog-2', call_name: 'Bella', name: null, owner_id: 'person-1', sex: 'female' },
    ];
  });

  it('keeps the page and dialog mounted while the dog is purged mid-delete', async () => {
    const { user } = await renderDogPage();
    await startDelete(user);

    await purgeMax();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Dog page for Max')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stays on the dog when the delete is refused', async () => {
    const { user } = await renderDogPage();
    await startDelete(user);

    act(() => pending.settle?.(false));

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Dog page for Max')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('navigates to /dogs exactly once, with no accessDenied, when the delete succeeds', async () => {
    const { user } = await renderDogPage();
    await startDelete(user);
    await purgeMax();

    act(() => pending.settle?.(true));

    await screen.findByText('dogs-list-page');
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith('/dogs', { replace: true });
    expect(
      navigateSpy.mock.calls.some(
        ([, options]) => (options as { state?: { accessDenied?: boolean } })?.state?.accessDenied
      )
    ).toBe(false);
  });

  it('does not hold the guard open on a DIFFERENT id mid-delete', async () => {
    const { user } = await renderDogPage();
    await startDelete(user);

    // The route reuses this component; the latch belongs to dog-1 only.
    await user.click(screen.getByRole('link', { name: 'Go to an unknown dog' }));

    // MYK9-930 (H8): an unknown dog is the shared Not Found state, not a silent
    // bounce to the list that throws away the URL the user asked for.
    expect(await screen.findByRole('heading', { name: 'Dog Not Found' })).toBeInTheDocument();
    expect(screen.queryByText('dogs-list-page')).not.toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back to Dogs' }));
    expect(await screen.findByText('dogs-list-page')).toBeInTheDocument();
  });

  it('does not yank the admin off ANOTHER dog when the delete succeeds late', async () => {
    const { user } = await renderDogPage();
    await startDelete(user);
    const settle = pending.settle;

    await user.click(screen.getByRole('link', { name: 'Go to Bella' }));
    expect(await screen.findByText('Dog page for Bella')).toBeInTheDocument();

    act(() => settle?.(true));

    await waitFor(() => expect(screen.getByText('Dog page for Bella')).toBeInTheDocument());
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('dogs-list-page')).not.toBeInTheDocument();
  });
});
