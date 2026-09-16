/**
 * MYK9-561: the dialog must SHOW the refusal, and must stay open so the
 * exhibitor can act on it.
 *
 * Round-1 review found no component-level coverage of this at all: all three
 * existing `EntryEditDialog*` suites mock `updateEntryDetails` to
 * `{ error: null }`, so every sentence `jumpHeightErrorMessage` owns was
 * unreachable from a rendered dialog. One case per refusal class the dialog can
 * actually produce.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { EntryEditDialog } from './EntryEditDialog';

const entryServiceMocks = vi.hoisted(() => ({
  canModifyEntry: vi.fn(),
  updateEntryDetails: vi.fn(),
  updateEntryHandler: vi.fn(),
  withdrawEntry: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  canModifyEntry: entryServiceMocks.canModifyEntry,
  updateEntryDetails: entryServiceMocks.updateEntryDetails,
  updateEntryHandler: entryServiceMocks.updateEntryHandler,
  withdrawEntry: entryServiceMocks.withdrawEntry,
}));

const entry = {
  id: 'entry-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  dogName: 'Ace',
  classes: [
    {
      id: 'entry-1',
      name: 'Standard Novice A',
      number: '101',
      fee: 30,
      // Agility, so the jump-height Select renders (scent work hides it).
      trialType: 'Agility',
      jumpHeight: '8"',
      status: 'entered' as const,
    },
  ],
};

/**
 * Pick a DIFFERENT height and save. Different on purpose: an unchanged height no
 * longer reaches the RPC at all (the guard in `saveEntryEdits`), so a test that
 * re-picked 8" would assert the error path while never calling it.
 */
async function changeHeightAndSave() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('combobox'));
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: '16"' }));
  await user.click(screen.getByRole('button', { name: /save changes/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  entryServiceMocks.canModifyEntry.mockResolvedValue({ canModify: true });
  entryServiceMocks.updateEntryHandler.mockResolvedValue({ error: null });
  entryServiceMocks.withdrawEntry.mockResolvedValue({ error: null });
  entryServiceMocks.updateEntryDetails.mockResolvedValue({ error: null });
});

describe('EntryEditDialog — jump-height refusals reach the exhibitor', () => {
  it.each([
    [
      'a 42501 owner-tier refusal (entries closed, checked in, scored, withdrawn)',
      { code: '42501', message: 'Entry 22eb47a9-0000-0000-0000-000000000000 is checked in' },
      'This jump height can no longer be changed — ask the secretary to change it.',
    ],
    [
      'a 40001 version conflict',
      { code: '40001', message: 'Version conflict updating entry 22eb47a9-…' },
      'Someone else changed this entry — reopen it and try again.',
    ],
    [
      'an offline transport failure',
      {
        code: 'unavailable',
        message: "We couldn't reach the server — try saving again when you're connected.",
      },
      "We couldn't reach the server — try saving again when you're connected.",
    ],
    [
      'an unclassified failure',
      { message: 'boom' },
      "We couldn't update the jump height. Please try again.",
    ],
  ])('shows the sentence for %s and keeps the dialog open', async (_label, error, sentence) => {
    const onOpenChange = vi.fn();
    entryServiceMocks.updateEntryDetails.mockResolvedValue({ error });

    render(<EntryEditDialog open entry={entry} onOpenChange={onOpenChange} onUpdate={vi.fn()} />);
    await changeHeightAndSave();

    expect(await screen.findByText(sentence)).toBeInTheDocument();
    // The raw Postgres text — row UUID and all — never reaches the exhibitor.
    expect(screen.queryByText(/22eb47a9/)).not.toBeInTheDocument();
    // Still open: closing would throw away the edit the exhibitor must retry.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('closes on success, and only then', async () => {
    const onOpenChange = vi.fn();
    const onUpdate = vi.fn();

    render(<EntryEditDialog open entry={entry} onOpenChange={onOpenChange} onUpdate={onUpdate} />);
    await changeHeightAndSave();

    expect(entryServiceMocks.updateEntryDetails).toHaveBeenCalledWith({
      entryId: 'entry-1',
      jumpHeight: '16"',
    });
    expect(onUpdate).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
