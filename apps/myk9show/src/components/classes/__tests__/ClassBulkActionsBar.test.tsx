import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ClassBulkActionsBar } from '../ClassBulkActionsBar';
import type { ClassActionItem } from '../classActions';

// The shared delete dialog's server and device halves (features/delete).
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
}));

function cls(id: string, status: string, name = `Class ${id}`): ClassActionItem {
  return { id, name, status };
}

function setup(selectedClasses: ClassActionItem[], bulkBusy = false) {
  const onBulkStatusChange = vi.fn().mockResolvedValue(true);
  const onClear = vi.fn();
  const utils = render(
    <ClassBulkActionsBar
      selectedClasses={selectedClasses}
      bulkBusy={bulkBusy}
      onBulkStatusChange={onBulkStatusChange}
      onClear={onClear}
      trialLabel="Saturday Trial 1"
      context={{ showId: 's1', trialId: 't1' }}
    />
  );
  return { ...utils, onBulkStatusChange, onClear };
}

describe('ClassBulkActionsBar', () => {
  // FloatingBulkBar is `fixed`, so without an in-flow spacer it covers the
  // bottom of the class list — the kit's own spacer (`h-24`) replaces the
  // previous measured-height bar.
  it('reserves a spacer in normal flow so the bar does not cover the last rows', () => {
    const { container } = setup([cls('1', 'Scheduled')]);

    const spacer = container.querySelector('[aria-hidden="true"]');
    expect(spacer).not.toBeNull();
    expect(spacer).toHaveClass('h-24');
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
    expect(screen.getByRole('menuitem', { name: /mark 2 of 2 in progress/i })).toBeInTheDocument();
    // Both selected classes are already Scheduled, so that bulk action has 0
    // eligible items and falls back to its unavailable-reason label.
    expect(screen.getByRole('menuitem', { name: /^mark scheduled/i })).toBeInTheDocument();
  });

  it('dispatches bulk status change with the eligible ids and target status', async () => {
    const { user, onBulkStatusChange } = setup([cls('1', 'Scheduled'), cls('2', 'Scheduled')]);
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 2 of 2 in progress/i }));

    expect(onBulkStatusChange).toHaveBeenCalledWith(
      ['1', '2'],
      'In Progress',
      expect.any(Function)
    );
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
        onBulkStatusChange={onBulkStatusChange}
        onClear={onClear}
      />
    );
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark 1 of 1 in progress/i }));

    expect(onBulkStatusChange).toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('delete opens the shared dialog instead of dispatching immediately', async () => {
    deleteMocks.preview.mockReset().mockResolvedValue({
      trials: 0,
      classes: 0,
      entries: 3,
      shows: 0,
      dogs: 0,
      paid: 0,
      scored: 0,
      blocking: 0,
    });
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    const { user } = setup([cls('1', 'Scheduled'), cls('2', 'Scheduled')]);

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 2 of 2 selected/i }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 classes?' });
    expect(within(dialog).getByText('Class 1 and Class 2')).toBeInTheDocument();
    expect(deleteMocks.remove).not.toHaveBeenCalled();
    // Counts are summed across the selection, in words.
    expect(await within(dialog).findByText('This also removes their 6 entries.')).toBeVisible();
  });

  it('deletes only after the dialog is confirmed, then clears the selection', async () => {
    deleteMocks.preview.mockReset().mockResolvedValue({
      trials: 0,
      classes: 0,
      entries: 0,
      shows: 0,
      dogs: 0,
      paid: 0,
      scored: 0,
      blocking: 0,
    });
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    const { user, onClear } = setup([cls('1', 'Scheduled')]);

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 1 of 1 selected/i }));

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(deleteMocks.remove).toHaveBeenCalledWith('class', '1', { override: false })
    );
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it('disables the bulk menu trigger while busy', () => {
    setup([cls('1', 'Scheduled')], true);
    expect(screen.getByRole('button', { name: /bulk class actions/i })).toBeDisabled();
  });

  it('disables the Clear button while a bulk operation is running', () => {
    setup([cls('1', 'Scheduled')], true);
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeDisabled();
  });
});
