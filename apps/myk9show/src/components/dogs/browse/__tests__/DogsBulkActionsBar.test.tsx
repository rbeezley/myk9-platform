import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { DogsBulkActionsBar } from '../DogsBulkActionsBar';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const updateDogMutateAsync = vi.fn();

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useUpdateDogMutation: () => ({
    mutateAsync: (...args: unknown[]) => updateDogMutateAsync(...args),
  }),
}));

let mockIsSiteAdmin = false;
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'staff-1' }, hasRole: () => mockIsSiteAdmin }),
}));

// The shared delete dialog's server and device halves (features/delete).
const deleteMocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  hasUnsyncedWork: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
}));
const preview = (paid: number) => ({
  trials: 0,
  classes: 0,
  entries: paid + 1,
  shows: 0,
  dogs: 0,
  paid,
  scored: 0,
  blocking: paid,
});

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

/** Opens the bulk delete for `count` dogs; returns the shared dialog. */
async function openBulkDelete(user: ReturnType<typeof setup>['user'], count: number) {
  await user.click(screen.getByRole('button', { name: /bulk actions/i }));
  await user.click(
    await screen.findByRole('menuitem', { name: new RegExp(`delete ${count} dogs?`, 'i') })
  );
  return screen.findByRole('dialog');
}

describe('DogsBulkActionsBar', () => {
  beforeEach(() => {
    updateDogMutateAsync.mockReset().mockResolvedValue(undefined);
    deleteMocks.preview.mockReset().mockResolvedValue(preview(0));
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);
    mockIsSiteAdmin = false;
  });

  it('renders nothing when no dogs are selected', () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  // The bar floats (list-toolkit `FloatingBulkBar`), so without an in-flow
  // spacer it lands on top of the last thing on the page — on /dogs that is
  // the pagination control, which becomes unreachable the moment one
  // checkbox is ticked.
  it('reserves room in normal flow so nothing on the page sits underneath it', () => {
    const { container } = setup([dog('1')]);

    const spacer = container.querySelector('[aria-hidden="true"]');
    expect(spacer).not.toBeNull();
  });

  it('reserves nothing when no dogs are selected', () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count', () => {
    setup([dog('1'), dog('2')]);
    expect(screen.getByText('2 dogs selected')).toBeInTheDocument();
  });

  it('clicking Clear calls onClear', async () => {
    const { user, onClear } = setup([dog('1')]);
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('mark retired dispatches useUpdateDogMutation for eligible dogs and clears selection', async () => {
    const { user, onClear } = setup([dog('1', 'active'), dog('2', 'retired')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 1 of 2 dogs retired/i }));

    await waitFor(() => {
      expect(updateDogMutateAsync).toHaveBeenCalledWith({
        id: '1',
        updates: { status: 'retired' },
      });
    });
    expect(updateDogMutateAsync).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalled();
  });

  it('delete opens the shared dialog and only deletes after confirming', async () => {
    const { user, onClear } = setup([dog('1'), dog('2')]);
    const dialog = await openBulkDelete(user, 2);

    // Dialog is open; nothing deleted yet.
    expect(dialog).toHaveAccessibleName('Delete 2 dogs?');
    expect(deleteMocks.remove).not.toHaveBeenCalled();

    const confirm = within(dialog).getByRole('button', { name: 'Delete 2 dogs' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => {
      expect(deleteMocks.remove).toHaveBeenCalledWith('dog', '1', { override: false });
      expect(deleteMocks.remove).toHaveBeenCalledWith('dog', '2', { override: false });
    });
    expect(deleteMocks.remove).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it('disables Clear while a bulk mutation is in flight so failed items stay selectable', async () => {
    let resolve!: () => void;
    updateDogMutateAsync.mockImplementation(() => new Promise<void>(r => (resolve = r)));
    const { user } = setup([dog('1', 'active'), dog('2', 'active')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 2 dogs retired/i }));

    // In flight: Clear is disabled so the selection can't be dropped mid-batch.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled()
    );
    resolve();
  });

  it('does not offer bulk delete when the user cannot delete dogs', async () => {
    const { user } = setup([dog('1'), dog('2')], false);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    // Status change (dog:update) is still offered; Delete (dog:delete) is absent.
    expect(
      await screen.findByRole('menuitem', { name: /mark 2 dogs retired/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('dispatches one update per eligible dog when marking several at once', async () => {
    const { user } = setup([dog('1', 'active'), dog('2', 'active'), dog('3', 'active')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 3 dogs retired/i }));

    // Regression guard: a per-dog dispatch would trip the in-flight latch and
    // update only the first dog. All three must be updated.
    await waitFor(() => {
      expect(updateDogMutateAsync).toHaveBeenCalledTimes(3);
    });
  });

  // The dogs and classes bulk actions share the same shared-hook retry
  // mechanism useBulkAccountActions now relies on (MYK9-835): a toast retry
  // re-checks the FRESH status through `selectedDogsRef`, not the status the
  // batch was first dispatched with. Mirrors
  // useClassBulkActions.test.ts's "retry skips a class whose fresh status no
  // longer matches" — this bar had the ref+applicableWhen mechanism already,
  // but no test proving it.
  it('retry skips a dog whose fresh status no longer matches its status at first dispatch', async () => {
    updateDogMutateAsync.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));
    const { user, rerender } = setup([dog('1', 'active'), dog('2', 'active')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 2 dogs retired/i }));

    await waitFor(() => expect(updateDogMutateAsync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // Another actor already retired dog "2" before the retry fires.
    rerender(
      <DogsBulkActionsBar
        selectedDogs={[dog('1', 'retired'), dog('2', 'retired')]}
        onClear={vi.fn()}
        canDelete
      />
    );

    updateDogMutateAsync.mockClear();
    const retryCall = vi.mocked(toast.error).mock.calls.at(-1);
    const retry = (retryCall?.[1] as { action?: { onClick: () => void } } | undefined)?.action;
    if (!retry) throw new Error('toast.error was not called with a retry action');
    retry.onClick();

    // "2" is no longer eligible (already retired) — skipped, not re-attempted.
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(updateDogMutateAsync).not.toHaveBeenCalled();
  });
});

/**
 * A dog with paid or scored entries is named in the dialog BEFORE anyone presses
 * Delete (delete_preview), instead of after a server refusal (MYK9-584's report).
 */
describe('DogsBulkActionsBar blocked deletes', () => {
  beforeEach(() => {
    deleteMocks.preview
      .mockReset()
      .mockImplementation(async (_kind: string, id: string) => preview(id === '2' ? 1 : 0));
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);
    mockIsSiteAdmin = false;
  });

  it('names the blocked dog and keeps Delete off for a secretary', async () => {
    const { user } = setup([dog('1'), dog('2')]);
    const dialog = await openBulkDelete(user, 2);

    expect(
      await within(dialog).findByText(
        'Dog 2 has paid or scored entries. Withdraw or Pull those entries first. Leave it out of the selection to delete the rest.'
      )
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete 2 dogs' })).toBeDisabled();
    expect(deleteMocks.remove).not.toHaveBeenCalled();
  });

  it('lets a site admin delete anyway only after ticking the override', async () => {
    mockIsSiteAdmin = true;
    const { user } = setup([dog('1'), dog('2')]);
    const dialog = await openBulkDelete(user, 2);

    const confirm = within(dialog).getByRole('button', { name: 'Delete 2 dogs' });
    await within(dialog).findByText(/Dog 2 has paid or scored entries/);
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: /delete anyway/i }));
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(deleteMocks.remove).toHaveBeenCalledWith('dog', '2', { override: true })
    );
  });
});
