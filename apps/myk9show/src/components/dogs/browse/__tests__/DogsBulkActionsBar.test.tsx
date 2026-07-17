import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { DogsBulkActionsBar } from '../DogsBulkActionsBar';

const updateDogMutateAsync = vi.fn();
const deleteDogMutateAsync = vi.fn();

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useUpdateDogMutation: () => ({
    mutateAsync: (...args: unknown[]) => updateDogMutateAsync(...args),
  }),
  useDeleteDogMutation: () => ({
    mutateAsync: (...args: unknown[]) => deleteDogMutateAsync(...args),
  }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'staff-1' } }),
}));

function dog(id: string, status: Dog['status'] = 'active'): Dog {
  return {
    id,
    name: `Dog ${id}`,
    callName: `Dog ${id}`,
    breed: 'Border Collie',
    sex: 'male',
    ownerId: 'owner-1',
    status,
  };
}

function setup(dogs: Dog[], canDelete = true) {
  const onClear = vi.fn();
  const utils = render(
    <DogsBulkActionsBar selectedDogs={dogs} onClear={onClear} canDelete={canDelete} />
  );
  return { ...utils, onClear };
}

describe('DogsBulkActionsBar', () => {
  beforeEach(() => {
    updateDogMutateAsync.mockReset().mockResolvedValue(undefined);
    deleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  it('renders nothing when no dogs are selected', () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count', () => {
    setup([dog('1'), dog('2')]);
    expect(screen.getByText('2 dogs selected')).toBeInTheDocument();
  });

  it('clicking Clear calls onClear', async () => {
    const { user, onClear } = setup([dog('1')]);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('mark retired dispatches useUpdateDogMutation for eligible dogs and clears selection', async () => {
    const { user, onClear } = setup([dog('1', 'active'), dog('2', 'retired')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /mark retired 1 of 2 selected/i })
    );

    await waitFor(() => {
      expect(updateDogMutateAsync).toHaveBeenCalledWith({
        id: '1',
        updates: { status: 'retired' },
      });
    });
    expect(updateDogMutateAsync).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalled();
  });

  it('delete opens a confirmation dialog and only dispatches after confirming', async () => {
    const { user } = setup([dog('1'), dog('2')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 2 of 2 selected/i }));

    // Dialog is open; nothing dispatched yet.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(deleteDogMutateAsync).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteDogMutateAsync).toHaveBeenCalledWith({ id: '1', deletedBy: 'staff-1' });
      expect(deleteDogMutateAsync).toHaveBeenCalledWith({ id: '2', deletedBy: 'staff-1' });
    });
    expect(deleteDogMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('does not offer bulk delete when the user cannot delete dogs', async () => {
    const { user } = setup([dog('1'), dog('2')], false);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    // Status change (dog:update) is still offered; Delete (dog:delete) is absent.
    expect(await screen.findByRole('menuitem', { name: /mark retired/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('dispatches one update per eligible dog when marking several at once', async () => {
    const { user } = setup([dog('1', 'active'), dog('2', 'active'), dog('3', 'active')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /mark retired 3 of 3 selected/i })
    );

    // Regression guard: a per-dog dispatch would trip the in-flight latch and
    // update only the first dog. All three must be updated.
    await waitFor(() => {
      expect(updateDogMutateAsync).toHaveBeenCalledTimes(3);
    });
  });
});
