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
const forceDeleteDogMutateAsync = vi.fn().mockResolvedValue(undefined);
const deleteDogMutateAsync = vi.fn();

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useUpdateDogMutation: () => ({
    mutateAsync: (...args: unknown[]) => updateDogMutateAsync(...args),
  }),
  useDeleteDogMutation: () => ({
    mutateAsync: (...args: unknown[]) => deleteDogMutateAsync(...args),
  }),
  useForceDeleteDogMutation: () => ({
    mutateAsync: (...args: unknown[]) => forceDeleteDogMutateAsync(...args),
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

/** The server's MK002 refusal, as it reaches the client. */
function blockedError() {
  return {
    name: 'DatabaseError',
    code: 'MK002',
    message: 'This dog has paid or scored entries. Pull or refund them before deleting.',
  };
}

/** Runs a bulk delete over `dogs` and confirms it. */
async function bulkDelete(user: ReturnType<typeof setup>['user'], count: number) {
  await user.click(screen.getByRole('button', { name: /bulk actions/i }));
  await user.click(
    await screen.findByRole('menuitem', { name: new RegExp(`delete ${count} dogs?`, 'i') })
  );
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
}

describe('DogsBulkActionsBar', () => {
  beforeEach(() => {
    updateDogMutateAsync.mockReset().mockResolvedValue(undefined);
    deleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
    forceDeleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
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

  it('delete opens a confirmation dialog and only dispatches after confirming', async () => {
    const { user } = setup([dog('1'), dog('2')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 2 dogs/i }));

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
 * MYK9-584: the bar's only job with a blocked delete is to REPORT it upward.
 * It must not own the dialog — the optimistic delete prunes the selection and
 * the page unmounts this component, so a dialog owned here never renders. The
 * dialog's own behaviour is covered in blockedDeleteSurvivesUnmount.test.tsx.
 */
describe('DogsBulkActionsBar blocked deletes', () => {
  beforeEach(() => {
    updateDogMutateAsync.mockReset().mockResolvedValue(undefined);
    deleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
    forceDeleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  function setupWithReport(dogs: Dog[]) {
    const onBlockedDogs = vi.fn();
    const onClear = vi.fn();
    const utils = render(
      <DogsBulkActionsBar
        selectedDogs={dogs}
        onClear={onClear}
        canDelete
        onBlockedDogs={onBlockedDogs}
      />
    );
    return { ...utils, onBlockedDogs, onClear };
  }

  it('reports every blocked dog upward', async () => {
    deleteDogMutateAsync.mockRejectedValue(blockedError());
    const { user, onBlockedDogs } = setupWithReport([dog('1'), dog('2')]);

    await bulkDelete(user, 2);

    await waitFor(() => expect(onBlockedDogs).toHaveBeenCalledTimes(1));
    expect(onBlockedDogs.mock.calls[0]?.[0].map((d: Dog) => d.id)).toEqual(['1', '2']);
  });

  it('reports only the blocked subset when a batch is mixed', async () => {
    deleteDogMutateAsync.mockImplementation(({ id }: { id: string }) =>
      id === '2' ? Promise.reject(blockedError()) : Promise.resolve(undefined)
    );
    const { user, onBlockedDogs } = setupWithReport([dog('1'), dog('2')]);

    await bulkDelete(user, 2);

    await waitFor(() => expect(onBlockedDogs).toHaveBeenCalledTimes(1));
    expect(onBlockedDogs.mock.calls[0]?.[0].map((d: Dog) => d.id)).toEqual(['2']);
  });

  it('does not report an ordinary failure as blocked', async () => {
    deleteDogMutateAsync.mockRejectedValue(new Error('Network down'));
    const { user, onBlockedDogs } = setupWithReport([dog('1')]);

    await bulkDelete(user, 1);

    await waitFor(() => expect(deleteDogMutateAsync).toHaveBeenCalled());
    expect(onBlockedDogs).not.toHaveBeenCalled();
  });

  // The regression that started MYK9-584: suppressing the toast left the user
  // with nothing when the dialog could not render. The toast must always fire.
  it('still shows a toast when every dog was blocked', async () => {
    deleteDogMutateAsync.mockRejectedValue(blockedError());
    const { user } = setupWithReport([dog('1'), dog('2')]);

    await bulkDelete(user, 2);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
