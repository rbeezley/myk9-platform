import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { notifications } from '@/lib/notifications';

/**
 * MYK9-595 regression: a REJECTED single-dog force delete must leave the admin
 * on the dog page with the confirmation dialog open, never bounce them to
 * /dogs with an `accessDenied` flag.
 *
 * The tree below keeps the whole failing chain real — mutation -> optimistic
 * cache strip -> `useRoleBasedDogs` selector -> `DogDetailPage` render -> the
 * redirect effect. Only `DogDetailsMain` is stubbed, to a shell that mounts a
 * dialog the same way the real one does (conditionally, on its own state), so
 * "the dialog survived" is observable without dragging the full detail page in.
 */

const { mockForceDeleteDog, mockReplicatedDogsTable } = vi.hoisted(() => ({
  mockForceDeleteDog: vi.fn(),
  mockReplicatedDogsTable: {
    delete: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    getDogById: vi.fn().mockResolvedValue(null),
  },
}));

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
  deleteDog: vi.fn(),
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

// Stub detail shell: mounts its dialog conditionally on its own state, exactly
// like DogDetailsMain/DogDialogs do, so an unmount of the page is visible here.
const DogDetailsMainStub: React.FC<{
  dog: { callName: string };
  onForceDelete: () => Promise<void>;
}> = ({ dog, onForceDelete }) => {
    const [open, setOpen] = React.useState(false);
    return (
      <div>
        <div>Dog page for {dog.callName}</div>
        <button onClick={() => setOpen(true)}>Open delete dialog</button>
        {open && (
          <div role="dialog">
            <span>Delete {dog.callName} and its entries?</span>
            <button
              onClick={async () => {
                // Mirrors DogDialogs: close only after the callback resolves.
                try {
                  await onForceDelete();
                  setOpen(false);
                } catch {
                  /* rejection keeps the dialog open */
                }
              }}
            >
              Confirm force delete
            </button>
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

const DogsListProbe: React.FC = () => {
  const location = useLocation();
  return <div>dogs-list accessDenied={String((location.state as { accessDenied?: boolean } | null)?.accessDenied ?? false)}</div>;
};

const renderDogPage = async () => {
  const DogDetailPage = (await import('../DogDetailPage')).default;
  return render(
    <Routes>
      <Route path="/dogs/:id" element={<DogDetailPage />} />
      <Route path="/dogs" element={<DogsListProbe />} />
    </Routes>,
    { initialRoute: '/dogs/dog-1' }
  );
};

describe('DogDetailPage force delete failure (MYK9-595)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplicatedDogsTable.delete.mockResolvedValue(undefined);
  });

  it('keeps the admin on the dog page with the dialog open when force_delete_dog is refused', async () => {
    // A real RPC is in flight for at least one render. That window is the bug:
    // `onMutate` has already stripped the dog from the cache, so the page has
    // to survive on its own until `onError` puts it back.
    let rejectForceDelete!: (reason: unknown) => void;
    mockForceDeleteDog.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectForceDelete = reject;
        })
    );

    const { user } = await renderDogPage();

    await screen.findByText('Dog page for Max');
    await user.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm force delete' }));
    await waitFor(() => expect(mockForceDeleteDog).toHaveBeenCalledWith('dog-1'));

    // Mid-flight: the optimistic strip must not blank the page or fire the
    // not-found redirect.
    expect(screen.queryByText(/dogs-list/)).not.toBeInTheDocument();
    expect(screen.getByText('Dog page for Max')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      rejectForceDelete(
        Object.assign(new Error('permission denied for function force_delete_dog'), {
          code: '42501',
        })
      );
      await Promise.resolve();
    });

    // After the refusal: still on the dog page, dialog still open, and above
    // all no `accessDenied` bounce to /dogs.
    await waitFor(() => expect(notifications.error).toHaveBeenCalled());
    expect(screen.queryByText(/dogs-list/)).not.toBeInTheDocument();
    expect(screen.getByText('Dog page for Max')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('still navigates to /dogs, with no accessDenied flag, when the force delete succeeds', async () => {
    mockForceDeleteDog.mockResolvedValue({ data: { id: 'dog-1' }, error: null });

    const { user } = await renderDogPage();

    await screen.findByText('Dog page for Max');
    await user.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm force delete' }));

    expect(await screen.findByText(/dogs-list/)).toHaveTextContent('accessDenied=false');
    expect(notifications.success).toHaveBeenCalled();
  });
});
