/**
 * A dog Undo that could not give every placement back (restore_dog's
 * `placementsSkipped`, MYK9-607) must say so, with the same copy the admin
 * Deleted Items restore uses. MYK9-922 round 8: `unwrap` dropped it and Undo
 * said only "Dog restored".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  restoreDog: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('@/services/database/dogs/reads', () => ({
  deleteDog: vi.fn(),
  forceDeleteDog: vi.fn(),
  restoreDog: mocks.restoreDog,
}));
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, warning: mocks.toastWarning, error: mocks.toastError },
}));
vi.mock('./deleteLocalState', () => ({
  reconcileLocalDeletion: vi.fn(),
  reconcileLocalRestore: vi.fn(),
}));

import { describeRestoreDog } from '@/components/admin/DataLifecycleManagement/deletedEntityMappers';
import { restoreOnServer } from './deleteServer';
import { undoDelete } from './deleteUndoToast';

const skipped = {
  data: {
    dogId: 'd1',
    entriesRestored: 2,
    placementsReapplied: 0,
    placementsSkipped: [{ entryId: 'e1', classId: 'c1', className: 'Novice A', finalPlacement: 1 }],
  },
  error: null,
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
});

describe('dog Undo placement warning', () => {
  it('restoreOnServer returns the existing placement warning copy', async () => {
    mocks.restoreDog.mockResolvedValue(skipped);
    const warning = await restoreOnServer('dog', 'd1');
    expect(warning).toBe(describeRestoreDog(skipped));
    expect(warning).toContain('placement was not given back');
  });

  it('restoreOnServer returns nothing when every placement came back', async () => {
    mocks.restoreDog.mockResolvedValue({
      data: { ...skipped.data, placementsSkipped: [] },
      error: null,
    });
    expect(await restoreOnServer('dog', 'd1')).toBeUndefined();
  });

  it('Undo shows the warning instead of a plain "Dog restored"', async () => {
    mocks.restoreDog.mockResolvedValue(skipped);
    await undoDelete({
      kind: 'dog',
      deleted: [{ id: 'd1', name: 'Biscuit' }],
      deletedAt: Date.now(),
      queryClient: new QueryClient(),
    });
    expect(mocks.toastWarning).toHaveBeenCalledWith(describeRestoreDog(skipped), expect.anything());
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('Undo without skipped placements still says "Dog restored"', async () => {
    mocks.restoreDog.mockResolvedValue({
      data: { ...skipped.data, placementsSkipped: [] },
      error: null,
    });
    await undoDelete({
      kind: 'dog',
      deleted: [{ id: 'd1', name: 'Biscuit' }],
      deletedAt: Date.now(),
      queryClient: new QueryClient(),
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Dog restored');
    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });
});
