/**
 * The entry sheet's footer Delete with the REAL shared dialog (only the server and
 * device halves are mocked): Escape on the delete dialog leaves the sheet open
 * (MYK9-910), and a refused delete keeps it open with the reason.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';

const mocks = vi.hoisted(() => ({
  canModifyEntry: vi.fn(),
  preview: vi.fn(),
  remove: vi.fn(),
  purge: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/database/entries', () => ({
  canModifyEntry: mocks.canModifyEntry,
  updateEntryDetails: vi.fn(),
  updateEntryHandler: vi.fn(),
  withdrawEntry: vi.fn(),
}));
vi.mock('./saveEntryEdits', () => ({ saveEntryEdits: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: mocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: mocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({ reconcileLocalDeletion: mocks.purge }));

const NOTHING = {
  trials: 0,
  classes: 0,
  entries: 0,
  shows: 0,
  dogs: 0,
  paid: 0,
  scored: 0,
  blocking: 0,
};

const entry = {
  id: 'entry-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  dogName: 'Ace',
  handler: 'Pat',
  classes: [
    {
      id: 'class-1',
      name: 'Container Novice A',
      number: '101',
      fee: 30,
      trialType: 'Scent Work',
      status: 'entered' as const,
      handler: 'Pat',
    },
  ],
};

async function openDeleteDialog() {
  const onOpenChange = vi.fn();
  const onDeleted = vi.fn();
  const rendered = render(
    <EntryEditDialog
      open
      entry={entry}
      onOpenChange={onOpenChange}
      onUpdate={vi.fn()}
      asShowManager
      canDelete
      onDeleted={onDeleted}
    />
  );
  await screen.findByText(/Container Novice A/);
  await rendered.user.click(screen.getByRole('button', { name: 'Delete entry' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete the entry for Ace?' });
  return { ...rendered, dialog, onOpenChange, onDeleted };
}

describe('EntryEditDialog footer Delete with the real dialog', () => {
  beforeEach(() => {
    mocks.canModifyEntry.mockResolvedValue({ canModify: true });
    mocks.preview.mockReset().mockResolvedValue(NOTHING);
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.purge.mockReset().mockResolvedValue(undefined);
  });

  it('Escape closes only the delete dialog; the sheet stays open (MYK9-910)', async () => {
    const { user, onOpenChange } = await openDeleteDialog();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: /^Delete the entry/ })
      ).not.toBeInTheDocument()
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('a refused delete keeps the sheet open, shows the reason, and reports nothing', async () => {
    mocks.remove.mockRejectedValue(new Error('boom'));
    const { user, dialog, onOpenChange, onDeleted } = await openDeleteDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Delete entry' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/couldn't delete/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('a successful delete closes the sheet and reports the entry id', async () => {
    const { user, dialog, onOpenChange, onDeleted } = await openDeleteDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Delete entry' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(['entry-1']));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
