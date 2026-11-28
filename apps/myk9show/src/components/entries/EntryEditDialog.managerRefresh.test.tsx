import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  canModifyEntry: vi.fn(),
  saveEntryEdits: vi.fn(),
  refreshShowEntriesForRead: vi.fn(),
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
vi.mock('./saveEntryEdits', () => ({ saveEntryEdits: mocks.saveEntryEdits }));
vi.mock('@/services/database/entries/refreshShowEntriesForRead', () => ({
  refreshShowEntriesForRead: mocks.refreshShowEntriesForRead,
}));

const entry = {
  id: 'entry-1',
  showId: 'show-1',
  showName: 'Throw Away Show',
  dogName: 'COCO',
  handler: 'Mariana Alexander',
  classes: [
    {
      id: 'class-1',
      name: 'Container Novice A',
      number: '101',
      fee: 30,
      trialType: 'Scent Work',
      status: 'entered' as const,
      handler: 'Mariana Alexander',
    },
  ],
};

async function changeHandlerAndSave(asShowManager: boolean, onUpdate: () => void) {
  const user = userEvent.setup();
  render(
    <EntryEditDialog
      open
      entry={entry}
      onOpenChange={vi.fn()}
      onUpdate={onUpdate}
      asShowManager={asShowManager}
    />
  );
  await screen.findByText(/Container Novice A/);
  const field = screen.getByDisplayValue('Mariana Alexander');
  await user.clear(field);
  await user.type(field, 'John Smoth');
  await user.click(screen.getByRole('button', { name: /save changes/i }));
}

describe('EntryEditDialog refreshes the show replica before the page re-reads (MYK9-2475)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
    mocks.canModifyEntry.mockResolvedValue({ canModify: true });
    mocks.saveEntryEdits.mockResolvedValue({ error: null });
    mocks.refreshShowEntriesForRead.mockImplementation(async () => {
      mocks.order.push('sync');
      return true;
    });
  });

  it('syncs the show, then calls onUpdate, after a manager saves a handler change', async () => {
    const onUpdate = vi.fn(() => {
      mocks.order.push('onUpdate');
    });
    await changeHandlerAndSave(true, onUpdate);

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(mocks.saveEntryEdits).toHaveBeenCalledWith(
      expect.objectContaining({
        classEdits: { 'class-1': expect.objectContaining({ handler: 'John Smoth' }) },
      })
    );
    expect(mocks.refreshShowEntriesForRead).toHaveBeenCalledWith('show-1');
    expect(mocks.order).toEqual(['sync', 'onUpdate']);
  });

  it('does not sync the show for the exhibitor tier', async () => {
    const onUpdate = vi.fn();
    await changeHandlerAndSave(false, onUpdate);

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(mocks.refreshShowEntriesForRead).not.toHaveBeenCalled();
  });
});
