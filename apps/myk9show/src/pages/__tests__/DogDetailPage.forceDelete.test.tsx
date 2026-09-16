import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { notifications } from '@/lib/notifications';
import { createDatabaseError } from '@/services/database/databaseError';

/**
 * MYK9-595 regression: a REJECTED single-dog delete must leave the admin on the
 * dog page with the confirmation dialog open and the server's reason on screen,
 * never bounce them to /dogs with an `accessDenied` flag.
 *
 * The tree below keeps the whole failing chain real — mutation -> optimistic
 * cache strip -> `useRoleBasedDogs` selector -> `DogDetailPage` render -> the
 * redirect effect — and rejects with the shape production actually produces:
 * `createDatabaseError(...)`, a plain object literal cast to `DatabaseError`
 * and NOT an `Error` instance. Only `DogDetailsMain` is stubbed, to a shell
 * that mounts its dialog conditionally on its own state the way `DogDialogs`
 * does, so a page unmount is observable here. The dialog's own survival on a
 * rejection is pinned against the real components in
 * `components/dogs/DogDetailsMain/__tests__/forceDeleteRejection.test.tsx`.
 */

const { mockForceDeleteDog, mockDeleteDog, mockReplicatedDogsTable, navigateSpy } = vi.hoisted(
  () => ({
    mockForceDeleteDog: vi.fn(),
    mockDeleteDog: vi.fn(),
    mockReplicatedDogsTable: {
      delete: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      getDogById: vi.fn().mockResolvedValue(null),
    },
    navigateSpy: vi.fn(),
  })
);

const dbDogs = [
  { id: 'dog-1', call_name: 'Max', name: null, owner_id: 'person-1', sex: 'male' },
  { id: 'dog-2', call_name: 'Bella', name: null, owner_id: 'person-1', sex: 'female' },
];

vi.mock('@/services/database/dogs', () => ({
  getAllDogs: vi.fn(async () => ({ data: dbDogs, error: null })),
  getDogById: vi.fn(async () => ({ data: null, error: null })),
  getDogsByOwner: vi.fn(async () => ({ data: [], error: null })),
  getOwnedLiveDogsByPerson: vi.fn(async () => ({ data: [], error: null })),
  searchDogs: vi.fn(async () => ({ data: [], error: null })),
  getDogStatistics: vi.fn(async () => ({ data: null, error: null })),
  createDog: vi.fn(),
  updateDog: vi.fn(),
  deleteDog: mockDeleteDog,
  forceDeleteDog: mockForceDeleteDog,
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockReplicatedDogsTable,
}));

vi.mock('@/hooks/useCurrentPersonId', () => ({
  useCurrentPersonId: () => 'person-1',
}));

const mockHasRole = vi.fn((role: UserRole) => role === UserRole.SITE_ADMIN);
vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    useAuthContext: () => ({
      hasRole: mockHasRole,
      getUserRoles: () => ['site_admin'],
      userWithRoles: { id: 'user-1', databaseUserId: 'person-1', roles: [] },
    }),
  };
});

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// Real navigation is kept (so a redirect genuinely swaps the route) and spied,
// so the assertions can name the exact arguments rather than infer them.
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

// Stub detail shell: mounts its dialog conditionally on its own state, exactly
// like DogDetailsMain/DogDialogs do, so an unmount of the page is visible here.
const DogDetailsMainStub: React.FC<{
  dog: { callName: string };
  onDelete: () => Promise<void>;
  onForceDelete: () => Promise<void>;
}> = ({ dog, onDelete, onForceDelete }) => {
  const [open, setOpen] = React.useState(false);
  const confirm = async (run: () => Promise<void>) => {
    // Mirrors DogDialogs: close only after the callback RESOLVES.
    try {
      await run();
      setOpen(false);
    } catch {
      /* a rejection keeps the dialog open */
    }
  };
  return (
    <div>
      <div>Dog page for {dog.callName}</div>
      <button onClick={() => setOpen(true)}>Open delete dialog</button>
      {open && (
        <div role="dialog">
          <span>Delete {dog.callName} and its entries?</span>
          <button onClick={() => confirm(onForceDelete)}>Confirm force delete</button>
          <button onClick={() => confirm(onDelete)}>Confirm delete</button>
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

const renderDogPage = async (initialRoute = '/dogs/dog-1') => {
  const DogDetailPage = (await import('../DogDetailPage')).default;
  return render(
    <>
      {/* `Link` navigates through the router itself, so it does not pollute
          `navigateSpy` — only the page's own redirects land there. */}
      <Link to="/dogs/dog-404">Go to an unknown dog</Link>
      <Link to="/dogs/dog-2">Go to Bella</Link>
      <Routes>
        <Route path="/dogs/:id" element={<DogDetailPage />} />
        <Route path="/dogs" element={<div>dogs-list-page</div>} />
      </Routes>
    </>,
    { initialRoute }
  );
};

/** The exact value production rejects with: an object literal, not an Error. */
const permissionDenied = () =>
  createDatabaseError(
    { message: 'Permission denied', code: '42501' },
    'dog',
    'force_delete'
  ) as unknown;

/** Holds the RPC open so the optimistic strip is observable mid-flight. */
const deferred = () => {
  let settle!: (outcome: { reject?: unknown; resolve?: unknown }) => void;
  const promise = new Promise((resolve, reject) => {
    settle = outcome => ('reject' in outcome ? reject(outcome.reject) : resolve(outcome.resolve));
  });
  return { promise, settle };
};

describe('DogDetailPage delete failures (MYK9-595)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplicatedDogsTable.delete.mockResolvedValue(undefined);
  });

  it('keeps the page and dialog mounted and surfaces the reason when force_delete_dog is refused', async () => {
    const rpc = deferred();
    mockForceDeleteDog.mockImplementation(() => rpc.promise);

    const { user } = await renderDogPage();

    await screen.findByText('Dog page for Max');
    await user.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm force delete' }));
    await waitFor(() => expect(mockForceDeleteDog).toHaveBeenCalledWith('dog-1'));

    // Mid-flight: the optimistic strip must not blank the page or fire the
    // not-found redirect.
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Dog page for Max')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      rpc.settle({ reject: permissionDenied() });
      await Promise.resolve();
    });

    // The refusal's REASON reaches the toast. A `DatabaseError` is not an
    // `Error` instance, so before MYK9-595 this was the generic fallback.
    await waitFor(() => expect(notifications.error).toHaveBeenCalled());
    expect(vi.mocked(notifications.error).mock.calls[0]?.[0]).toBe(
      'You no longer have permission to delete this dog and its entries.'
    );
    expect(vi.mocked(notifications.error).mock.calls[0]?.[0]).not.toMatch(/Please try again/);

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Dog page for Max')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the page and dialog mounted when the ORDINARY delete is refused', async () => {
    const rpc = deferred();
    mockDeleteDog.mockImplementation(() => rpc.promise);

    const { user } = await renderDogPage();

    await screen.findByText('Dog page for Max');
    await user.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(mockDeleteDog).toHaveBeenCalled());

    // `useDogStoreCompat`'s `isLoading` folds in this mutation's `isPending`,
    // which would otherwise swap the page for the loading skeleton.
    expect(screen.getByText('Dog page for Max')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      rpc.settle({
        reject: Object.assign(new Error('Dog not found or already deleted'), { code: 'P0002' }),
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(notifications.error).toHaveBeenCalled());
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Dog page for Max')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('navigates to /dogs exactly once, with no accessDenied, when the force delete succeeds', async () => {
    mockForceDeleteDog.mockResolvedValue({ data: { id: 'dog-1' }, error: null });

    const { user } = await renderDogPage();

    await screen.findByText('Dog page for Max');
    await user.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm force delete' }));

    await screen.findByText('dogs-list-page');
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith('/dogs', { replace: true });
    // Positive control for the `not.toHaveBeenCalled()` assertions above, and
    // proof no call smuggled the flag in.
    expect(
      navigateSpy.mock.calls.some(
        ([, options]) => (options as { state?: { accessDenied?: boolean } })?.state?.accessDenied
      )
    ).toBe(false);
    expect(notifications.success).toHaveBeenCalled();
    // The deleted dog is gone for good — no re-render of the detail page.
    expect(screen.queryByText('Dog page for Max')).not.toBeInTheDocument();
  });

  it('does not hold the guard (or the wrong dog) open on a DIFFERENT id mid-delete', async () => {
    const rpc = deferred();
    mockForceDeleteDog.mockImplementation(() => rpc.promise);

    const { user } = await renderDogPage();

    await screen.findByText('Dog page for Max');
    await user.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm force delete' }));
    await waitFor(() => expect(mockForceDeleteDog).toHaveBeenCalledWith('dog-1'));

    // The route renders DogDetailPage without a `key`, so this REUSES the
    // component instance and the latch dog-1's delete set. An unscoped latch
    // renders dog-1's page at /dogs/dog-404 and suppresses the redirect the
    // unknown id has genuinely earned.
    await user.click(screen.getByRole('link', { name: 'Go to an unknown dog' }));

    expect(await screen.findByText('dogs-list-page')).toBeInTheDocument();
    expect(screen.queryByText('Dog page for Max')).not.toBeInTheDocument();
    expect(navigateSpy).toHaveBeenCalledWith('/dogs', {
      replace: true,
      state: { accessDenied: true },
    });

    // Settle dog-1's RPC so the test leaves no unhandled rejection behind.
    await act(async () => {
      rpc.settle({ reject: permissionDenied() });
      await Promise.resolve();
    });
  });

  it('does not yank the admin off ANOTHER dog when the delete succeeds late', async () => {
    const rpc = deferred();
    mockForceDeleteDog.mockImplementation(() => rpc.promise);

    const { user } = await renderDogPage();

    await screen.findByText('Dog page for Max');
    await user.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm force delete' }));
    await waitFor(() => expect(mockForceDeleteDog).toHaveBeenCalledWith('dog-1'));

    // The admin moves on while dog-1's RPC is still open.
    await user.click(screen.getByRole('link', { name: 'Go to Bella' }));
    expect(await screen.findByText('Dog page for Bella')).toBeInTheDocument();

    await act(async () => {
      rpc.settle({ resolve: { data: { id: 'dog-1' }, error: null } });
      await Promise.resolve();
    });

    // The success toast still reports dog-1...
    await waitFor(() => expect(notifications.success).toHaveBeenCalled());
    expect(vi.mocked(notifications.success).mock.calls[0]?.[0]).toMatch(/Max/);
    // ...but the admin stays on the dog they navigated to.
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Dog page for Bella')).toBeInTheDocument();
    expect(screen.queryByText('dogs-list-page')).not.toBeInTheDocument();
  });
});
