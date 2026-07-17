import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ClassBulkActionsBar } from '../ClassBulkActionsBar';
import type { ClassActionItem } from '../classActions';

function cls(id: string, status: string, name = `Class ${id}`): ClassActionItem {
  return { id, name, status };
}

function setup(selectedClasses: ClassActionItem[], bulkBusy = false) {
  const onBulkStatusChange = vi.fn().mockResolvedValue(true);
  const onBulkDelete = vi.fn().mockResolvedValue(true);
  const onClear = vi.fn();
  const utils = render(
    <ClassBulkActionsBar
      selectedClasses={selectedClasses}
      bulkBusy={bulkBusy}
      onBulkStatusChange={onBulkStatusChange}
      onBulkDelete={onBulkDelete}
      onClear={onClear}
    />
  );
  return { ...utils, onBulkStatusChange, onBulkDelete, onClear };
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

  it('a status action calls onBulkStatusChange with eligible ids + status, then clears (no window.confirm)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { user, onBulkStatusChange, onClear } = setup([
      cls('1', 'Scheduled'),
      cls('2', 'Completed'), // ineligible for "Set to Scheduled"
    ]);

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /set to scheduled — 1 of 2 selected/i })
    );

    expect(onBulkStatusChange).toHaveBeenCalledWith(['2'], 'Scheduled');
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('keeps selection when a bulk status action reports failure', async () => {
    const { user, onBulkStatusChange, onClear } = setup([cls('1', 'Completed')]);
    onBulkStatusChange.mockResolvedValue(false);

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /set to scheduled — 1 of 1 selected/i })
    );

    expect(onBulkStatusChange).toHaveBeenCalledWith(['1'], 'Scheduled');
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

    expect(onBulkDelete).toHaveBeenCalledWith(['1']);
  });

  it('disables the bulk menu trigger while busy', () => {
    setup([cls('1', 'Scheduled')], true);
    expect(screen.getByRole('button', { name: /bulk class actions/i })).toBeDisabled();
  });
});
