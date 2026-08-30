import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ClassBulkActionsBar } from '../ClassBulkActionsBar';
import type { ClassActionItem } from '../classActions';

function cls(id: string, status: string, name = `Class ${id}`): ClassActionItem {
  return { id, name, status };
}

function setup(selectedClasses: ClassActionItem[], bulkBusy = false) {
  const onBulkDelete = vi.fn().mockResolvedValue(true);
  const onBulkStatusChange = vi.fn().mockResolvedValue(true);
  const onClear = vi.fn();
  const utils = render(
    <ClassBulkActionsBar
      selectedClasses={selectedClasses}
      bulkBusy={bulkBusy}
      onBulkDelete={onBulkDelete}
      onBulkStatusChange={onBulkStatusChange}
      onClear={onClear}
    />
  );
  return { ...utils, onBulkDelete, onBulkStatusChange, onClear };
}

const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

/** jsdom reports 0 for every box, so an unstubbed spacer assertion is vacuous. */
function stubBarHeight(px: number) {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: px, width: 100, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 }),
  });
}

describe('ClassBulkActionsBar', () => {
  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: realGetBoundingClientRect,
    });
  });

  // Fixed bar, so without an in-flow spacer it covers the bottom of the class list.
  it('reserves its own measured height in normal flow', () => {
    stubBarHeight(64);
    const { container } = setup([cls('1', 'Scheduled')]);

    const spacer = container.querySelector('[aria-hidden="true"]');
    expect(spacer).not.toBeNull();
    expect((spacer as HTMLElement).style.height).toBe('64px');
  });

  it('renders nothing when no classes are selected', () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count', () => {
    setup([cls('1', 'Scheduled'), cls('2', 'Scheduled')]);
    expect(screen.getByText('2 classes selected')).toBeInTheDocument();
  });

  it('offers bulk status change alongside Delete (MYK9-59)', async () => {
    const { user } = setup([cls('1', 'Scheduled'), cls('2', 'Scheduled')]);
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    expect(
      await screen.findByRole('menuitem', { name: /delete 2 of 2 selected/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /mark 2 of 2 in progress/i })
    ).toBeInTheDocument();
    // Both selected classes are already Scheduled, so that bulk action has 0
    // eligible items and falls back to its unavailable-reason label.
    expect(screen.getByRole('menuitem', { name: /^mark scheduled/i })).toBeInTheDocument();
  });

  it('dispatches bulk status change with the eligible ids and target status', async () => {
    const { user, onBulkStatusChange } = setup([cls('1', 'Scheduled'), cls('2', 'Scheduled')]);
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 2 of 2 in progress/i }));

    expect(onBulkStatusChange).toHaveBeenCalledWith(['1', '2'], 'In Progress', expect.any(Function));
  });

  it('clears the selection after a fully successful bulk status change', async () => {
    const { user, onClear } = setup([cls('1', 'Scheduled')]);
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 1 of 1 in progress/i }));

    await screen.findByRole('button', { name: /bulk class actions/i });
    expect(onClear).toHaveBeenCalled();
  });

  it('does not clear the selection when bulk status change reports partial failure', async () => {
    const onBulkStatusChange = vi.fn().mockResolvedValue(false);
    const onClear = vi.fn();
    const { user } = render(
      <ClassBulkActionsBar
        selectedClasses={[cls('1', 'Scheduled')]}
        bulkBusy={false}
        onBulkDelete={vi.fn()}
        onBulkStatusChange={onBulkStatusChange}
        onClear={onClear}
      />
    );
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 1 of 1 in progress/i }));

    expect(onBulkStatusChange).toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('delete opens a confirmation dialog instead of dispatching immediately', async () => {
    const { user, onBulkDelete } = setup([cls('1', 'Scheduled'), cls('2', 'Scheduled')]);

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 2 of 2 selected/i }));

    expect(onBulkDelete).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('delete dispatches onBulkDelete only after the dialog is confirmed', async () => {
    const { user, onBulkDelete } = setup([cls('1', 'Scheduled')]);

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 1 of 1 selected/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    expect(onBulkDelete).toHaveBeenCalledWith(['1'], expect.any(Function));
  });

  it('disables the bulk menu trigger while busy', () => {
    setup([cls('1', 'Scheduled')], true);
    expect(screen.getByRole('button', { name: /bulk class actions/i })).toBeDisabled();
  });
});
