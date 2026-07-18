import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ClassBulkActionsBar } from '../ClassBulkActionsBar';
import type { ClassActionItem } from '../classActions';

function cls(id: string, status: string, name = `Class ${id}`): ClassActionItem {
  return { id, name, status };
}

function setup(selectedClasses: ClassActionItem[], bulkBusy = false) {
  const onBulkDelete = vi.fn().mockResolvedValue(true);
  const onClear = vi.fn();
  const utils = render(
    <ClassBulkActionsBar
      selectedClasses={selectedClasses}
      bulkBusy={bulkBusy}
      onBulkDelete={onBulkDelete}
      onClear={onClear}
    />
  );
  return { ...utils, onBulkDelete, onClear };
}

describe('ClassBulkActionsBar', () => {
  it('renders nothing when no classes are selected', () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count', () => {
    setup([cls('1', 'Scheduled'), cls('2', 'Scheduled')]);
    expect(screen.getByText('2 classes selected')).toBeInTheDocument();
  });

  it('offers only Delete in bulk — status change is per-row only (descoped, MYK9-59)', async () => {
    const { user } = setup([cls('1', 'Scheduled'), cls('2', 'Scheduled')]);
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    expect(
      await screen.findByRole('menuitem', { name: /delete 2 of 2 selected/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /set to/i })).not.toBeInTheDocument();
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
