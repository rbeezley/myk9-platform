/**
 * Restoring a club never gives its roles back (MYK9-1388: club delete deactivates them,
 * restore is role-neutral like person restore), so both restore paths warn the admin to
 * appoint people again instead of saying only "Club restored".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  restoreClub: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('@/services/database/clubs/reads', () => ({
  deleteClub: vi.fn(),
  restoreClub: mocks.restoreClub,
}));
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, warning: mocks.toastWarning, error: mocks.toastError },
}));
vi.mock('./deleteLocalState', () => ({
  reconcileLocalDeletion: vi.fn(),
  reconcileLocalRestore: vi.fn(),
}));

import { describeRestoreClub } from '@/components/admin/DataLifecycleManagement/deletedEntityMappers';
import { ENTITY_SECTIONS } from '@/components/admin/DataLifecycleManagement/deletedEntityConfig';
import { restoreOnServer } from './deleteServer';
import { undoDelete } from './deleteUndoToast';

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.restoreClub.mockResolvedValue({ data: null, error: null });
});

describe('club restore warning', () => {
  it('says the roles were not given back and where to appoint people again', () => {
    expect(describeRestoreClub()).toMatch(/does not switch them back on/);
    expect(describeRestoreClub()).toMatch(/Members page/);
  });

  it('restoreOnServer returns the warning for a club', async () => {
    expect(await restoreOnServer('club', 'c1')).toBe(describeRestoreClub());
  });

  it('Undo of a club delete shows the warning instead of a plain success', async () => {
    await undoDelete({
      kind: 'club',
      deleted: [{ id: 'c1', name: 'Heartland Scent Work Club' }],
      deletedAt: Date.now(),
      queryClient: new QueryClient(),
    });
    expect(mocks.toastWarning).toHaveBeenCalledWith(describeRestoreClub(), expect.anything());
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('the admin Deleted Items restore uses the same warning', () => {
    const clubs = ENTITY_SECTIONS.find(section => section.type === 'club');
    expect(clubs?.describeRestore?.(null)).toBe(describeRestoreClub());
  });

  it('a failed restore surfaces the error, not the warning', async () => {
    mocks.restoreClub.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(restoreOnServer('club', 'c1')).rejects.toBeTruthy();
  });
});
