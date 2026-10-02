/**
 * The footer Delete with the REAL shared dialog inside the REAL panel and dialog
 * variants (only the server and device halves are mocked). Pins what a stand-in
 * dialog cannot: Escape on the delete dialog must not close the panel behind it
 * (MYK9-910), and a refused delete must leave the panel open with the reason.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { z } from 'zod';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
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
const schema = z.object({ name: z.string().min(1) });

function Fields() {
  const { form } = useEditPanel<{ name: string }>();
  if (!form) return null;
  return (
    <input
      aria-label="Name"
      value={form.data.name}
      onChange={e => form.setValue('name', e.target.value)}
    />
  );
}

function renderPanel(variant: 'panel' | 'dialog') {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  const rendered = render(
    <EditPanelWrapper
      open
      onClose={onClose}
      title="Edit Show"
      initialData={{ name: 'Rex' }}
      schema={schema}
      onSave={vi.fn()}
      variant={variant}
      onDelete={{
        kind: 'show',
        objectLabel: 'show',
        targets: [{ id: 's1', name: 'Heartland Classic', context: { showId: 's1' } }],
        onDeleted,
      }}
    >
      <Fields />
    </EditPanelWrapper>
  );
  return { ...rendered, onClose, onDeleted };
}

describe.each(['panel', 'dialog'] as const)('real delete dialog in the %s variant', variant => {
  beforeEach(() => {
    mocks.preview.mockReset().mockResolvedValue(NOTHING);
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.purge.mockReset().mockResolvedValue(undefined);
  });

  it('Escape closes only the delete dialog; the panel and its edits stay (MYK9-910)', async () => {
    const { user, onClose } = renderPanel(variant);
    await user.type(screen.getByLabelText('Name'), 'y');
    await user.click(screen.getByRole('button', { name: 'Delete show' }));
    await screen.findByRole('alertdialog', { name: 'Delete the show Heartland Classic?' });

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: /^Delete the show/ })
      ).not.toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Rexy')).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('Escape on the delete dialog does not close a CLEAN panel either (MYK9-910)', async () => {
    // No edits, so nothing but the delete guard stands between Escape and onClose.
    const { user, onClose } = renderPanel(variant);
    await user.click(screen.getByRole('button', { name: 'Delete show' }));
    await screen.findByRole('alertdialog', { name: 'Delete the show Heartland Classic?' });

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: /^Delete the show/ })
      ).not.toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('edit-panel-action-row')).toBeInTheDocument();
  });

  it('a refused delete keeps the panel open, shows the reason, and never closes it', async () => {
    mocks.remove.mockRejectedValue(new Error('boom'));
    const { user, onClose, onDeleted } = renderPanel(variant);
    await user.click(screen.getByRole('button', { name: 'Delete show' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete the show Heartland Classic?',
    });
    const confirm = within(dialog).getByRole('button', { name: 'Delete show' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/couldn't delete/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    // Keep it brings the panel back to life.
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
  });

  it('a successful delete closes the panel once and reports it', async () => {
    const { user, onClose, onDeleted } = renderPanel(variant);
    await user.click(screen.getByRole('button', { name: 'Delete show' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete the show Heartland Classic?',
    });
    const confirm = within(dialog).getByRole('button', { name: 'Delete show' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
