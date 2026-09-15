import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { DogsBulkActionsBar } from '../DogsBulkActionsBar';

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

function setup(dogs: Dog[], canDelete = true, canForceDelete = false) {
  const onClear = vi.fn();
  const utils = render(
    <DogsBulkActionsBar
      selectedDogs={dogs}
      onClear={onClear}
      canDelete={canDelete}
      canForceDelete={canForceDelete}
    />
  );
  return { ...utils, onClear };
}

/** The server's MK002 refusal, as it reaches the client. */
function blockedError() {
  return {
    name: 'DatabaseError',
    code: 'MK002',
    message: 'This dog has paid or scored entries. Scratch or refund them before deleting.',
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

/**
 * jsdom reports 0 for every box, so the bar's measured height has to be
 * stubbed — otherwise the spacer assertion below passes on a 0px spacer, i.e.
 * on the bug.
 */
const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

function stubBarHeight(px: number) {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: px, width: 100, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 }),
  });
}

describe('DogsBulkActionsBar', () => {
  beforeEach(() => {
    updateDogMutateAsync.mockReset().mockResolvedValue(undefined);
    deleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
    forceDeleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  // Restore unconditionally: a prototype stub left in place is exactly the
  // cross-test leak CI's shuffled run turns into a random failure.
  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: realGetBoundingClientRect,
    });
  });

  it('renders nothing when no dogs are selected', () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  // The bar is `fixed`, so without an in-flow spacer it lands on top of the
  // last thing on the page — on /dogs that is the pagination control, which
  // becomes unreachable the moment one checkbox is ticked.
  it('reserves its own measured height in normal flow', () => {
    stubBarHeight(72);
    const { container } = setup([dog('1')]);

    const spacer = container.querySelector('[aria-hidden="true"]');
    expect(spacer).not.toBeNull();
    expect((spacer as HTMLElement).style.height).toBe('72px');
  });

  it('reserves nothing when no dogs are selected', () => {
    stubBarHeight(72);
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled());
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
});

/**
 * The paid/scored refusal used to land in a partial-failure toast: a list of
 * names and reasons that disappears in a few seconds and cannot be reopened.
 * These pin the replacement — a persistent dialog that names the blocked dogs
 * and, for an admin, offers the override.
 */
describe('DogsBulkActionsBar blocked deletes', () => {
  beforeEach(() => {
    updateDogMutateAsync.mockReset().mockResolvedValue(undefined);
    deleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
    forceDeleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  it('opens a persistent dialog naming every blocked dog', async () => {
    deleteDogMutateAsync.mockRejectedValue(blockedError());
    const { user } = setup([dog('1'), dog('2')]);

    await bulkDelete(user, 2);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/could not be deleted/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Dog 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Dog 2')).toBeInTheDocument();
  });

  it('does not offer the override to a non-admin', async () => {
    deleteDogMutateAsync.mockRejectedValue(blockedError());
    const { user } = setup([dog('1')], true, false);

    await bulkDelete(user, 1);

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).queryByRole('checkbox', { name: /I understand/i })
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /delete anyway/i })).toBeDisabled();
  });

  it('keeps Delete anyway disabled until an admin ticks the acknowledgement', async () => {
    deleteDogMutateAsync.mockRejectedValue(blockedError());
    const { user } = setup([dog('1')], true, true);

    await bulkDelete(user, 1);
    const dialog = await screen.findByRole('dialog');

    const confirm = within(dialog).getByRole('button', { name: /delete anyway/i });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: /I understand/i }));
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it('routes the override to the force-delete mutation, never the ordinary one', async () => {
    deleteDogMutateAsync.mockRejectedValue(blockedError());
    const { user } = setup([dog('1'), dog('2')], true, true);

    await bulkDelete(user, 2);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /I understand/i }));
    deleteDogMutateAsync.mockClear();
    await user.click(within(dialog).getByRole('button', { name: /delete anyway/i }));

    await waitFor(() => {
      expect(forceDeleteDogMutateAsync).toHaveBeenCalledWith({ id: '1' });
      expect(forceDeleteDogMutateAsync).toHaveBeenCalledWith({ id: '2' });
    });
    expect(forceDeleteDogMutateAsync).toHaveBeenCalledTimes(2);
    expect(deleteDogMutateAsync).not.toHaveBeenCalled();
  });

  it('does not open the dialog for an ordinary failure', async () => {
    deleteDogMutateAsync.mockRejectedValue(new Error('Network down'));
    const { user } = setup([dog('1')], true, true);

    await bulkDelete(user, 1);

    await waitFor(() => expect(deleteDogMutateAsync).toHaveBeenCalled());
    expect(screen.queryByText(/could not be deleted/i)).not.toBeInTheDocument();
  });

  it('only lists the blocked dogs when a batch is mixed', async () => {
    deleteDogMutateAsync.mockImplementation(({ id }: { id: string }) =>
      id === '2' ? Promise.reject(blockedError()) : Promise.resolve(undefined)
    );
    const { user } = setup([dog('1'), dog('2')], true, true);

    await bulkDelete(user, 2);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Dog 2')).toBeInTheDocument();
    expect(within(dialog).queryByText('Dog 1')).not.toBeInTheDocument();
  });
});

describe('DogsBulkActionsBar override re-arms', () => {
  beforeEach(() => {
    updateDogMutateAsync.mockReset().mockResolvedValue(undefined);
    deleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
    forceDeleteDogMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  // The acknowledgement is reset by MOUNTING rather than an effect, which is
  // only true while the dialog is rendered conditionally. If someone renders it
  // unconditionally with `open={...}`, the tick survives and the next batch is
  // one click from a force delete on a dialog nobody read. This is that guard.
  it('starts unticked again after the dialog is dismissed and reopened', async () => {
    deleteDogMutateAsync.mockRejectedValue(blockedError());
    const { user } = setup([dog('1')], true, true);

    await bulkDelete(user, 1);
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /I understand/i }));
    await waitFor(() =>
      expect(within(dialog).getByRole('checkbox', { name: /I understand/i })).toBeChecked()
    );

    // Dismiss without overriding.
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Same dogs, same refusal, second attempt.
    await bulkDelete(user, 1);
    dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('checkbox', { name: /I understand/i })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: /delete anyway/i })).toBeDisabled();
  });
});
