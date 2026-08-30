import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
    await user.click(
      await screen.findByRole('menuitem', { name: /mark 1 of 2 dogs retired/i })
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
    await user.click(
      await screen.findByRole('menuitem', { name: /mark 2 dogs retired/i })
    );

    // In flight: Clear is disabled so the selection can't be dropped mid-batch.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled());
    resolve();
  });

  it('does not offer bulk delete when the user cannot delete dogs', async () => {
    const { user } = setup([dog('1'), dog('2')], false);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    // Status change (dog:update) is still offered; Delete (dog:delete) is absent.
    expect(await screen.findByRole('menuitem', { name: /mark 2 dogs retired/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('dispatches one update per eligible dog when marking several at once', async () => {
    const { user } = setup([dog('1', 'active'), dog('2', 'active'), dog('3', 'active')]);
    await user.click(screen.getByRole('button', { name: /bulk actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /mark 3 dogs retired/i })
    );

    // Regression guard: a per-dog dispatch would trip the in-flight latch and
    // update only the first dog. All three must be updated.
    await waitFor(() => {
      expect(updateDogMutateAsync).toHaveBeenCalledTimes(3);
    });
  });
});
