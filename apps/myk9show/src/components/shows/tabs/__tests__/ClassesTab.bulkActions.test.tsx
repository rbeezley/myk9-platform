import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-924: selection and bulk actions on Setup → Classes, ported from the retired Class
// Management page's bulk-selection tests. Selection follows the view and the trial; bulk delete
// is the shared `DeleteObjectDialog`; bulk status never reaches another trial's classes.

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true }),
}));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => ['table', vi.fn(), true],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: { id: 's1', organization: 'AKC' } }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));

const applyManualClassStatus = vi.hoisted(() => vi.fn());
vi.mock('@/services/show-day/classStatusMutations', () => ({ applyManualClassStatus }));

// Bulk delete is the shared delete dialog (features/delete): its server and device halves.
const deleteMocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
  reconcileLocalRestore: vi.fn(),
}));
const NOTHING_BLOCKS = {
  trials: 0,
  classes: 0,
  entries: 0,
  shows: 0,
  dogs: 0,
  paid: 0,
  scored: 0,
  blocking: 0,
};
vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  classKeys: { all: ['classes'], byTrial: (trialId: string) => ['classes', 'trial', trialId] },
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError, info: vi.fn() } }));

function makeClass(id: string, trialId: string, patch: Partial<ClassInfo> = {}): ClassInfo {
  return {
    id,
    name: `Class ${id}`,
    element: 'Containers',
    level: 'Novice',
    section: '',
    judgeName: '',
    trialId,
    trialDate: trialId === 't1' ? '2026-08-01' : '2026-08-02',
    trialNumber: trialId === 't1' ? '1' : '2',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 3,
    userHasEntry: false,
    ...patch,
  };
}

const classes = [
  makeClass('c1', 't1'),
  makeClass('c2', 't1', { element: 'Interior', status: 'In Progress' }),
  makeClass('c3', 't2'),
];

const renderTab = (props: Partial<React.ComponentProps<typeof ClassesTab>> = {}) =>
  render(<ClassesTab classes={classes} showId="s1" userHasEntries={false} {...props} />);

describe('ClassesTab selection and bulk actions', () => {
  beforeEach(() => {
    applyManualClassStatus.mockReset();
    applyManualClassStatus.mockResolvedValue(undefined);
    deleteMocks.preview.mockReset().mockResolvedValue(NOTHING_BLOCKS);
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);
  });

  it('select all and bulk status stay inside the trial being managed', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('checkbox', { name: 'Select all visible classes' }));
    const bar = await screen.findByRole('toolbar', { name: 'Bulk actions' });
    await user.click(within(bar).getByRole('button', { name: 'Change status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark 2 of 2 Completed' }));

    await waitFor(() => expect(applyManualClassStatus).toHaveBeenCalledTimes(2));
    expect(applyManualClassStatus).toHaveBeenCalledWith('c1', 'Completed');
    expect(applyManualClassStatus).toHaveBeenCalledWith('c2', 'Completed');
    expect(applyManualClassStatus).not.toHaveBeenCalledWith('c3', expect.anything());
  });

  it("selecting all on the other trial reaches only that trial's classes", async () => {
    const { user } = renderTab({ trialId: 't2', onTrialChange: vi.fn() });

    await user.click(screen.getByRole('checkbox', { name: 'Select all visible classes' }));

    expect(await screen.findByText('1 class selected')).toBeInTheDocument();
  });

  // Pending and "Con" both keep Class c1 on screen, so only the reset (not row pruning) can clear it.
  it('clears the selection when the view changes', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('checkbox', { name: 'Select Class c1' }));
    expect(await screen.findByText('1 class selected')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
    await user.click(await screen.findByRole('option', { name: /^Pending/ }));

    expect(screen.queryByText('1 class selected')).not.toBeInTheDocument();
  });

  it('clears the selection when the search narrows the list', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('checkbox', { name: 'Select Class c1' }));
    expect(await screen.findByText('1 class selected')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search classes...'), 'Con');

    expect(screen.queryByText('1 class selected')).not.toBeInTheDocument();
  });

  it('bulk delete asks first, then soft-deletes every selected class through the shared dialog', async () => {
    const { user } = renderTab();
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible classes' }));

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 classes?' });
    expect(deleteMocks.remove).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole('button', { name: 'Delete 2 classes' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => {
      expect(deleteMocks.remove).toHaveBeenCalledWith('class', 'c1', { override: false });
      expect(deleteMocks.remove).toHaveBeenCalledWith('class', 'c2', { override: false });
    });
    expect(deleteMocks.remove).toHaveBeenCalledTimes(2);
  });

  // The retry's "has anyone else changed it?" check reads the full class set, so classes the
  // secretary has since searched away from are still retried.
  it('"Retry failed" still retries a class a later search has hidden', async () => {
    toastError.mockClear();
    applyManualClassStatus.mockImplementation(async (classId: string) => {
      if (classId === 'c1' && applyManualClassStatus.mock.calls.length === 1) {
        throw new Error('offline');
      }
    });
    const { user } = renderTab();
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible classes' }));
    const bar = await screen.findByRole('toolbar', { name: 'Bulk actions' });
    await user.click(within(bar).getByRole('button', { name: 'Change status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark 2 of 2 Completed' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    await user.type(screen.getByPlaceholderText('Search classes...'), 'zzz');
    expect(screen.queryByText('Class c1')).not.toBeInTheDocument();
    const retry = toastError.mock.calls[0]![1].action.onClick as (e: unknown) => void;
    retry({ preventDefault: vi.fn() });

    await waitFor(() => expect(applyManualClassStatus).toHaveBeenCalledTimes(3));
    expect(applyManualClassStatus).toHaveBeenLastCalledWith('c1', 'Completed');
  });

  it('a bulk delete in flight cannot be sent twice', async () => {
    const resolvers: Array<() => void> = [];
    deleteMocks.remove.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolvers.push(resolve);
        })
    );
    const { user } = renderTab();
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible classes' }));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete 2 classes' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    expect(await within(dialog).findByRole('button', { name: /Deleting/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeDisabled();
    await waitFor(() => expect(deleteMocks.remove).toHaveBeenCalledTimes(2));

    resolvers.forEach(resolve => resolve());
    await waitFor(() => expect(screen.queryByText(/selected/i)).not.toBeInTheDocument());
  });

  it('hands each class its own trial to the delete, so Undo re-syncs the right trial', async () => {
    const { user } = renderTab();
    await user.click(screen.getByRole('checkbox', { name: 'Select all visible classes' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 classes?' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete 2 classes' })).toBeEnabled()
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2 classes' }));
    await waitFor(() => expect(deleteMocks.remove).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(deleteMocks.purge).toHaveBeenCalledTimes(2));
    expect(deleteMocks.purge).toHaveBeenCalledWith(
      'class',
      expect.objectContaining({
        id: 'c1',
        context: expect.objectContaining({ showId: 's1', trialId: 't1', classId: 'c1' }),
      })
    );
  });
});
