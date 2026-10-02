import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  canModifyEntry: vi.fn(),
  saveEntryEdits: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/database/entries', () => ({
  canModifyEntry: mocks.canModifyEntry,
  updateEntryDetails: vi.fn(),
  updateEntryHandler: vi.fn(),
  withdrawEntry: vi.fn(),
}));
vi.mock('./saveEntryEdits', () => ({ saveEntryEdits: mocks.saveEntryEdits }));

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

async function renderAndEdit(onOpenChange = vi.fn(), onUpdate = vi.fn()) {
  const user = userEvent.setup();
  render(<EntryEditDialog open entry={entry} onOpenChange={onOpenChange} onUpdate={onUpdate} />);
  await screen.findByText(/Container Novice A/);
  const handler = screen.getByDisplayValue('Pat');
  await user.type(handler, 'ty');
  return { user, onOpenChange, onUpdate };
}

describe('EntryEditDialog feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canModifyEntry.mockResolvedValue({ canModify: true });
    mocks.saveEntryEdits.mockResolvedValue({ error: null });
  });

  it('asks before Cancel discards edits, and keeps editing on request', async () => {
    const { user, onOpenChange } = await renderAndEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes straight away when nothing changed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EntryEditDialog open entry={entry} onOpenChange={onOpenChange} onUpdate={vi.fn()} />);
    await screen.findByText(/Container Novice A/);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it('confirms a saved edit with a toast naming the dog', async () => {
    const { user, onUpdate, onOpenChange } = await renderAndEdit();
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Ace's entry saved"));
    expect(onUpdate).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows friendly copy when the save throws and keeps the edits on screen', async () => {
    mocks.saveEntryEdits.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "entries_pkey"')
    );
    const { user, onOpenChange } = await renderAndEdit();
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(
      await screen.findByText(/Your changes are still here\. Try again\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/entries_pkey/)).not.toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByDisplayValue('Patty')).toBeInTheDocument();
  });

  it('ignores Escape and Cancel while the save is in flight', async () => {
    mocks.saveEntryEdits.mockReturnValue(new Promise(() => {}));
    const { user, onOpenChange } = await renderAndEdit();
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText('Saving...');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });
});
