import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import type { DeleteObjectKind, DeletePreview, DeleteTarget } from './deleteTypes';
import type { DeleteRecordsResult } from './deleteRecords';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  purge: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  unsaved: vi.fn(),
}));

vi.mock('./deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('./deletePreview')>()),
  fetchDeletePreview: mocks.preview,
}));
vi.mock('./deleteServer', () => ({
  softDeleteOnServer: mocks.remove,
  restoreOnServer: mocks.restore,
}));
vi.mock('./deleteLocalState', () => ({
  reconcileLocalDeletion: mocks.purge,
  reconcileLocalRestore: mocks.refresh,
}));
vi.mock('./deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('./deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: mocks.unsaved,
}));
vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
    warning: vi.fn(),
  },
}));

import { DeleteObjectDialog } from './DeleteObjectDialog';

const counts = (over: Partial<DeletePreview> = {}): DeletePreview => ({
  trials: 0,
  classes: 0,
  entries: 0,
  shows: 0,
  dogs: 0,
  paid: 0,
  scored: 0,
  blocking: 0,
  ...over,
});

function renderDialog(
  kind: DeleteObjectKind,
  targets: DeleteTarget[],
  extra: {
    onDeleted?: (result: DeleteRecordsResult) => void;
    onOpenChange?: (open: boolean) => void;
  } = {}
) {
  return render(
    <DeleteObjectDialog
      open
      onOpenChange={extra.onOpenChange ?? vi.fn()}
      kind={kind}
      targets={targets}
      onDeleted={extra.onDeleted}
    />
  );
}

const ctx = { showId: 's1', trialId: 't1', classId: 'c1' };

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.remove.mockResolvedValue(undefined);
  mocks.restore.mockResolvedValue(undefined);
  mocks.purge.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.unsaved.mockResolvedValue({ total: 0, failed: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteObjectDialog names the item, its detail, what goes with it, and the buttons', () => {
  const cases: Array<{
    kind: DeleteObjectKind;
    target: DeleteTarget;
    preview: DeletePreview;
    title: string;
    cascade: string | null;
    button: string;
  }> = [
    {
      kind: 'show',
      target: {
        id: 's1',
        name: 'Heartland Classic',
        detail: 'Oct 10–11, 2026 · Heartland KC',
        context: ctx,
      },
      preview: counts({ trials: 2, classes: 10, entries: 14 }),
      title: 'Delete the show Heartland Classic?',
      cascade: 'This also removes its 2 trials, 10 classes and 14 entries.',
      button: 'Delete show',
    },
    {
      kind: 'trial',
      target: { id: 't1', name: 'Saturday T1', detail: 'Saturday T1 · Oct 10, 2026', context: ctx },
      preview: counts({ classes: 5, entries: 7 }),
      title: 'Delete the trial Saturday T1?',
      cascade: 'This also removes its 5 classes and 7 entries.',
      button: 'Delete trial',
    },
    {
      kind: 'class',
      target: {
        id: 'c1',
        name: 'Interior Novice A',
        detail: 'Novice Interior · Saturday T1',
        context: ctx,
      },
      preview: counts({ entries: 1 }),
      title: 'Delete the class Interior Novice A?',
      cascade: 'This also removes its 1 entry.',
      button: 'Delete class',
    },
    {
      kind: 'entry',
      target: {
        id: 'e1',
        name: 'Biscuit',
        detail: 'Biscuit · handled by Jane · Novice A',
        context: ctx,
      },
      preview: counts(),
      title: 'Delete the entry for Biscuit?',
      cascade: null,
      button: 'Delete entry',
    },
    {
      kind: 'dog',
      target: { id: 'd1', name: 'Biscuit', detail: 'Biscuit · owned by Jane Smith' },
      preview: counts({ entries: 3 }),
      title: 'Delete the dog Biscuit?',
      cascade: 'This also removes its 3 entries.',
      button: 'Delete dog',
    },
    {
      kind: 'person',
      target: { id: 'p1', name: 'Jane Smith', detail: 'jane@example.test' },
      preview: counts(),
      title: 'Delete the person Jane Smith?',
      cascade: 'Their myK9 roles are switched off too.',
      button: 'Delete person',
    },
    {
      kind: 'club',
      target: { id: 'k1', name: 'Heartland KC', detail: 'Heartland KC · Omaha' },
      preview: counts(),
      title: 'Delete the club Heartland KC?',
      cascade: null,
      button: 'Delete club',
    },
  ];

  it.each(cases)('$kind', async ({ kind, target, preview, title, cascade, button }) => {
    mocks.preview.mockResolvedValue(preview);
    renderDialog(kind, [target]);

    const dialog = await screen.findByRole('alertdialog', { name: title });
    expect(within(dialog).getByText(target.detail ?? '')).toBeVisible();
    const confirm = within(dialog).getByRole('button', { name: button });
    await waitFor(() => expect(confirm).toBeEnabled());
    if (cascade) expect(within(dialog).getByText(cascade)).toBeVisible();
    expect(
      within(dialog).getByText(
        'You can undo this for 10 minutes. After that, ask a myK9 administrator to restore it.'
      )
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeEnabled();
    expect(dialog).not.toHaveTextContent(/cannot be undone|permanently/i);
    expect(mocks.preview).toHaveBeenCalledWith(kind, target.id);
  });
});

describe('DeleteObjectDialog always asks first', () => {
  it('does not delete until Delete is pressed, and Keep it deletes nothing', async () => {
    mocks.preview.mockResolvedValue(counts());
    const onOpenChange = vi.fn();
    const { user } = renderDialog('show', [{ id: 's1', name: 'Heartland Classic' }], {
      onOpenChange,
    });

    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete show' })).toBeEnabled()
    );
    expect(mocks.remove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('Delete is a destructive outline, not a solid red button beside Keep it', async () => {
    mocks.preview.mockResolvedValue(counts());
    renderDialog('show', [{ id: 's1', name: 'Heartland Classic' }]);
    const button = await screen.findByRole('button', { name: 'Delete show' });
    expect(button.className).toMatch(/border-destructive/);
    expect(button.className).not.toMatch(/(^|\s)bg-destructive(\s|$)/);
  });
});

describe('DeleteObjectDialog three states', () => {
  it('unknown while the counts load: Delete off, and it says so', async () => {
    mocks.preview.mockReturnValue(new Promise(() => undefined));
    renderDialog('show', [{ id: 's1', name: 'Heartland Classic' }]);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Checking what goes with this show…')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete show' })).toBeDisabled();
  });

  it('unknown when the read fails (for example, the RPC is not deployed): Delete off, with Try again', async () => {
    mocks.preview.mockRejectedValueOnce({
      code: 'PGRST202',
      message: 'Could not find the function',
    });
    mocks.preview.mockResolvedValueOnce(counts());
    const { user } = renderDialog('trial', [{ id: 't1', name: 'Saturday T1', context: ctx }]);

    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByText(
        "We couldn't check what goes with this trial, so Delete is off. Try again."
      )
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete trial' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: /try again/i }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete trial' })).toBeEnabled()
    );
  });

  it('a transient transport failure while the browser is online offers Try again, not the offline state', async () => {
    mocks.preview.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mocks.preview.mockResolvedValueOnce(counts());
    const { user } = renderDialog('trial', [{ id: 't1', name: 'Saturday T1', context: ctx }]);

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByRole('button', { name: /try again/i })).toBeVisible();
    expect(within(dialog).queryByText(/^You're offline\./)).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: /try again/i }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete trial' })).toBeEnabled()
    );
  });

  it('unknown offline: no read is made, Delete is off, and it says why', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderDialog('dog', [{ id: 'd1', name: 'Biscuit' }]);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/^You're offline\./)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete dog' })).toBeDisabled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('blocked show: names the paid work and links to Cancel show', async () => {
    mocks.preview.mockResolvedValue(counts({ trials: 1, entries: 5, paid: 3, blocking: 3 }));
    renderDialog('show', [{ id: 's1', name: 'Heartland Classic', context: ctx }]);

    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByText('3 entries are paid. Cancel the show instead of deleting it.')
    ).toBeVisible();
    expect(within(dialog).getByRole('link', { name: 'Cancel show' })).toHaveAttribute(
      'href',
      '/shows?tab=managing'
    );
    expect(within(dialog).getByRole('button', { name: 'Delete show' })).toBeDisabled();
  });

  it.each(['trial', 'class', 'entry'] as const)(
    'blocked %s: links to Withdraw / Pull on the entries page',
    async kind => {
      mocks.preview.mockResolvedValue(counts({ entries: 2, scored: 1, blocking: 1 }));
      renderDialog(kind, [{ id: `${kind}-1`, name: 'X', context: ctx }]);

      const dialog = await screen.findByRole('alertdialog');
      const link = await within(dialog).findByRole('link', { name: 'Withdraw / Pull entries' });
      expect(link).toHaveAttribute(
        'href',
        kind === 'entry' ? '/shows/s1/entries?queue=all&entry=entry-1' : '/shows/s1/entries'
      );
      expect(within(dialog).getByRole('button', { name: `Delete ${kind}` })).toBeDisabled();
    }
  );

  it('following the blocked-action link closes the dialog (the target page may already be open)', async () => {
    mocks.preview.mockResolvedValue(counts({ entries: 2, scored: 1, blocking: 1 }));
    const onOpenChange = vi.fn();
    renderDialog('entry', [{ id: 'e1', name: 'X', context: ctx }], { onOpenChange });

    const dialog = await screen.findByRole('alertdialog');
    const link = await within(dialog).findByRole('link', { name: 'Withdraw / Pull entries' });
    expect(link).toHaveAttribute('href', '/shows/s1/entries?queue=all&entry=e1');
    await userEvent.click(link);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocked club and person: say what is in the way, with Delete off', async () => {
    mocks.preview.mockResolvedValue(counts({ shows: 2, blocking: 2 }));
    renderDialog('club', [{ id: 'k1', name: 'Heartland KC' }]);
    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByText(
        'This club still has 2 shows. Delete or move its shows first.'
      )
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete club' })).toBeDisabled();
  });

  it('allowed: Delete is on', async () => {
    mocks.preview.mockResolvedValue(counts({ entries: 1 }));
    renderDialog('class', [{ id: 'c1', name: 'Novice A', context: ctx }]);
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete class' })).toBeEnabled()
    );
    expect(within(dialog).getByTestId('delete-object-body')).toHaveAttribute(
      'data-gate',
      'allowed'
    );
  });
});

describe('DeleteObjectDialog delete, Undo and refusals', () => {
  async function confirmDelete(user: ReturnType<typeof render>['user'], button: string) {
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: button });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    return dialog;
  }

  it('deletes, purges, closes and offers Undo, which restores the item', async () => {
    mocks.preview.mockResolvedValue(counts({ trials: 1 }));
    const onDeleted = vi.fn();
    const target = { id: 's1', name: 'Heartland Classic', context: ctx };
    const { user } = renderDialog('show', [target], { onDeleted });

    await confirmDelete(user, 'Delete show');

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledWith('show', 's1', { override: false });
    expect(mocks.purge).toHaveBeenCalledWith('show', target);
    const [message, options] = mocks.toastSuccess.mock.calls[0] ?? [];
    expect(message).toBe('Show deleted: Heartland Classic');
    expect(options.action.label).toBe('Undo');

    options.action.onClick();
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith('show', 's1'));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith('show', target));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Show restored'));
  });

  it('a server refusal stays in the dialog in plain language, with nothing purged', async () => {
    mocks.preview.mockResolvedValue(counts());
    mocks.remove.mockRejectedValue({ code: 'MK010', message: 'P0001: raw database text' });
    const onDeleted = vi.fn();
    const { user } = renderDialog('entry', [{ id: 'e1', name: 'Biscuit', context: ctx }], {
      onDeleted,
    });

    const dialog = await confirmDelete(user, 'Delete entry');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This entry has been paid for or scored. Use Withdraw or Pull instead of deleting it.'
    );
    expect(dialog).not.toHaveTextContent('raw database text');
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it.each([
    ['club', 'MK011', 'This club still has shows. Delete or move its shows first.'],
    ['show', '42501', "You don't have permission to delete this show."],
  ] as const)('%s refused with %s says so plainly', async (kind, code, text) => {
    mocks.preview.mockResolvedValue(counts());
    mocks.remove.mockRejectedValue({ code, message: 'Permission denied' });
    const { user } = renderDialog(kind, [{ id: 'x1', name: 'X' }]);

    const dialog = await confirmDelete(user, `Delete ${kind}`);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
  });
});

describe('DeleteObjectDialog with items already deleted elsewhere (MYK9-922)', () => {
  // delete_preview answers P0002 for a missing or already-deleted row, 42501
  // only for a live row the caller may not delete. The dialog reads the code.
  const gone = { code: 'P0002', message: 'Dog not found or already deleted' };
  const dogs = [
    { id: 'd1', name: 'Biscuit' },
    { id: 'd2', name: 'Pepper' },
    { id: 'd3', name: 'Scout' },
  ];

  it('opening the dialog changes nothing locally: a stale item is named, not counted, and Delete stays on', async () => {
    mocks.preview.mockImplementation(async (_kind: string, id: string) => {
      if (id === 'd2') throw gone;
      return counts();
    });
    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    renderDialog('dog', dogs, { onDeleted, onOpenChange });

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 dogs?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete 2 dogs' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(within(dialog).getByTestId('delete-already-gone')).toHaveTextContent(
      'Already deleted: Pepper'
    );
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('one stale item in a bulk selection is reconciled only on confirm; the rest are deleted', async () => {
    mocks.preview.mockImplementation(async (_kind: string, id: string) => {
      if (id === 'd2') throw gone;
      return counts();
    });
    const onDeleted = vi.fn();
    const { user } = renderDialog('dog', dogs, { onDeleted });

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 dogs?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete 2 dogs' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(mocks.purge).not.toHaveBeenCalled();

    await user.click(confirm);

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocks.purge).toHaveBeenCalledWith('dog', dogs[1]);
    expect(mocks.remove.mock.calls.map(call => call[1])).toEqual(['d1', 'd3']);
    const result = onDeleted.mock.calls[0]?.[0] as DeleteRecordsResult;
    expect(result.deleted.map(t => t.id)).toEqual(['d1', 'd3']);
    expect(result.alreadyGone.map(t => t.id)).toEqual(['d2']);
    expect(mocks.toastSuccess.mock.calls[0]?.[0]).toBe('2 dogs deleted');
  });

  it('when every item is already gone: stays open and untouched until confirm, then reconciled and reported', async () => {
    mocks.preview.mockRejectedValue({
      code: 'P0002',
      message: 'Show not found or already deleted',
    });
    const onDeleted = vi.fn();
    const onOpenChange = vi.fn();
    const target = { id: 's1', name: 'Heartland Classic', context: ctx };
    const { user } = renderDialog('show', [target], { onDeleted, onOpenChange });

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete show' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(confirm);

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocks.purge).toHaveBeenCalledWith('show', target);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDeleted.mock.calls[0]?.[0]).toMatchObject({ deleted: [], alreadyGone: [target] });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastInfo.mock.calls[0]?.[0]).toBe('Show was already deleted: Heartland Classic');
  });

  it('a gone show while the device has unsaved work: Delete is off, nothing is purged', async () => {
    mocks.preview.mockRejectedValue({
      code: 'P0002',
      message: 'Show not found or already deleted',
    });
    mocks.unsaved.mockResolvedValue({ total: 1, failed: 0 });
    const onDeleted = vi.fn();
    const target = { id: 's-local', name: 'Draft Show', context: ctx };
    renderDialog('show', [target], { onDeleted });

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByTestId('delete-unsaved-work')).toHaveTextContent(
      "Finish saving first: 1 change on this device hasn't uploaded yet."
    );
    expect(within(dialog).getByRole('button', { name: 'Delete show' })).toBeDisabled();
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('a permission refusal (42501) is never read as gone, whatever its message says', async () => {
    mocks.preview.mockRejectedValue({ code: '42501', message: 'Show not found' });
    const onDeleted = vi.fn();
    renderDialog('show', [{ id: 's1', name: 'Heartland Classic' }], { onDeleted });

    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByText("You don't have permission to delete this show.")
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete show' })).toBeDisabled();
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe('DeleteObjectDialog: one device-wide unsaved-work check', () => {
  const syncedClass = { id: 'c1', name: 'Novice Container', context: ctx };

  it('a synced class with an unsynced local entry: Delete is off, nothing is purged', async () => {
    // The class itself has nothing queued; its entry was created here and has not uploaded.
    mocks.preview.mockResolvedValue(counts({ entries: 1 }));
    mocks.unsaved.mockResolvedValue({ total: 1, failed: 0 });
    renderDialog('class', [syncedClass]);

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByTestId('delete-unsaved-work')).toHaveTextContent(
      'Finish saving first'
    );
    expect(within(dialog).getByRole('button', { name: 'Delete class' })).toBeDisabled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();
  });

  it('a failed upload names that it failed and keeps Delete off', async () => {
    mocks.preview.mockResolvedValue(counts());
    mocks.unsaved.mockResolvedValue({ total: 1, failed: 1 });
    renderDialog('class', [syncedClass]);

    const dialog = await screen.findByRole('alertdialog');
    const notice = await within(dialog).findByTestId('delete-unsaved-work');
    expect(notice).toHaveTextContent(/failed to upload/);
    expect(notice).toHaveTextContent(/Retry or Discard/);
    expect(within(dialog).getByRole('button', { name: 'Delete class' })).toBeDisabled();
  });

  it('an unreadable queue keeps Delete off and offers Check again', async () => {
    mocks.preview.mockResolvedValue(counts());
    mocks.unsaved.mockRejectedValue(new Error('queue unavailable'));
    renderDialog('class', [syncedClass]);

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByTestId('delete-unsaved-work')).toHaveTextContent(
      "couldn't check"
    );
    expect(within(dialog).getByRole('button', { name: 'Delete class' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeVisible();
  });

  it('a clean queue: Delete is enabled and deletes', async () => {
    mocks.preview.mockResolvedValue(counts());
    const onDeleted = vi.fn();
    const { user } = renderDialog('class', [syncedClass], { onDeleted });

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(within(dialog).queryByTestId('delete-unsaved-work')).toBeNull();
    await user.click(confirm);
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith('class', 'c1', expect.anything())
    );
  });

  it('Check again lets Delete through once the work has uploaded', async () => {
    mocks.preview.mockResolvedValue(counts());
    mocks.unsaved.mockResolvedValue({ total: 2, failed: 0 });
    const { user } = renderDialog('class', [syncedClass]);

    const dialog = await screen.findByRole('alertdialog');
    await within(dialog).findByTestId('delete-unsaved-work');
    mocks.unsaved.mockResolvedValue({ total: 0, failed: 0 });
    await user.click(within(dialog).getByRole('button', { name: 'Check again' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete class' })).toBeEnabled()
    );
  });

  it('work queued after the dialog opened is caught again at confirm', async () => {
    mocks.preview.mockResolvedValue(counts());
    const onDeleted = vi.fn();
    const { user } = renderDialog('class', [syncedClass], { onDeleted });

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    mocks.unsaved.mockResolvedValue({ total: 1, failed: 0 });
    await user.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Finish saving first');
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe('DeleteObjectDialog: the confirm is in flight while the unsaved-work recheck runs', () => {
  const syncedClass = { id: 'c1', name: 'Novice Container', context: ctx };

  function slowRecheck() {
    let release: (work: { total: number; failed: number }) => void = () => undefined;
    // Only the recheck is slow; the delete service's own later reads answer at once.
    mocks.unsaved.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    return (work = { total: 0, failed: 0 }) => release(work);
  }

  it('Keep it and Escape cannot dismiss mid-recheck, so the delete is never an orphan', async () => {
    mocks.preview.mockResolvedValue(counts());
    const onOpenChange = vi.fn();
    const { user } = renderDialog('class', [syncedClass], { onOpenChange });

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    const release = slowRecheck();
    await user.click(confirm);

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeDisabled()
    );
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
  });

  it('a dialog unmounted mid-recheck never deletes', async () => {
    mocks.preview.mockResolvedValue(counts());
    const { user, unmount } = renderDialog('class', [syncedClass]);

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    const release = slowRecheck();
    await user.click(confirm);
    unmount();
    release();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('a blocked recheck re-enables Keep it', async () => {
    mocks.preview.mockResolvedValue(counts());
    const { user } = renderDialog('class', [syncedClass]);

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    mocks.unsaved.mockResolvedValue({ total: 1, failed: 0 });
    await user.click(confirm);

    await within(dialog).findByRole('alert');
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeEnabled();
  });
});
