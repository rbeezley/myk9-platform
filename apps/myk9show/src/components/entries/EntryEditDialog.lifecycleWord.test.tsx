/**
 * MYK9-623 — one word per lifecycle state across the Edit Entry sheet and the
 * My Shows card.
 *
 * The sheet's badge word for a removed class comes from the entry status
 * grammar (`statusIconGrammar`), the same descriptor the rest of the app
 * reads, and never from a literal of its own. The word for a stored
 * `scratched` is "Pulled" (docs/INTENT.md, "Say Which Act Happened": scratch
 * and pull are one act and no surface says "scratch"); the day-of
 * `check_in_status = 'pulled'` row keeps its own "pulled at the show".
 *
 * Both surfaces are rendered from ONE raw stored status, side by side, and
 * must agree with each other and with the grammar.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { getStatusDescriptor } from '@/components/status';
import { getEntryStatusKindForDisplay } from '@/services/entryDisplay/entryDisplaySelectors';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList } from '@/pages/MyEntriesPage/modules/MyShowsList';
import { EntryEditDialog } from './EntryEditDialog';

const mocks = vi.hoisted(() => ({
  canModifyEntry: vi.fn(),
  getRemoveFromClassEligibilityForEntries: vi.fn(),
  getTrialsByShow: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  canModifyEntry: mocks.canModifyEntry,
  updateEntryDetails: vi.fn(),
  updateEntryHandler: vi.fn(),
  withdrawEntry: vi.fn(),
}));

vi.mock('@/services/database/entries/withdrawOwnEntry', () => ({
  getRemoveFromClassEligibilityForEntries: mocks.getRemoveFromClassEligibilityForEntries,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: mocks.getTrialsByShow },
}));

const noop = () => {};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.canModifyEntry.mockResolvedValue({ canModify: true });
  mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1', registryId: 'AKC' }]);
  mocks.getRemoveFromClassEligibilityForEntries.mockImplementation(async (ids: string[]) =>
    Object.fromEntries(
      ids.map(id => [id, { withdraw: { allowed: true }, pull: { allowed: true } }])
    )
  );
});

/** The sheet and the card for Maple's one class, stored at `rawStatus`. */
function renderSideBySide(rawStatus: string) {
  const kind = getEntryStatusKindForDisplay(rawStatus, null);
  const status = mapClassEntryStatus(rawStatus);
  const row = makeRow({
    id: 'e-maple',
    dogId: 'dog-maple',
    dogName: 'Maple',
    entryStatus: mapEntryStatus(rawStatus),
    entryStatusKind: kind,
    classes: [
      makeClass({
        id: 'c-maple',
        name: 'Container Novice',
        entryStatus: mapEntryStatus(rawStatus),
        entryStatusKind: kind,
        status,
      }),
    ],
  });
  render(
    <>
      <MyShowsList
        filteredEntries={toOrders([row])}
        source="confirmed"
        seenResultReleaseKeys={new Set<string>()}
        now={NOW}
        onCheckInDay={vi.fn()}
        onOpenCheckIn={vi.fn()}
        onOpenEdit={vi.fn()}
        onOpenReceipts={vi.fn()}
        onLeaveClass={vi.fn()}
      />
      <EntryEditDialog
        open
        entry={{
          id: 'e-maple',
          showId: 'show-heartland',
          showName: 'Heartland Scent Work Classic',
          dogName: 'Maple',
          classes: [{ id: 'c-maple', name: 'Container Novice', number: '', fee: 25, status }],
        }}
        onOpenChange={noop}
        onUpdate={noop}
      />
    </>
  );
}

/**
 * The open modal marks the page behind it `aria-hidden`, so the card is found
 * with `hidden: true` — it is still the card the exhibitor sees behind the sheet.
 */
function myShowsCard(): HTMLElement {
  const region = screen.getByRole('region', {
    name: 'Heartland Scent Work Classic',
    hidden: true,
  });
  return within(region).getByRole('listitem', { hidden: true });
}

describe('EntryEditDialog and My Shows name a lifecycle state with one word (MYK9-623)', () => {
  it.each([
    ['scratched', 'Pulled'],
    ['withdrawn', 'Withdrawn'],
  ])('a stored %s reads "%s" on both surfaces, from the grammar', async (rawStatus, word) => {
    const grammarWord = getStatusDescriptor('entry', rawStatus).label;
    expect(grammarWord).toBe(word);

    renderSideBySide(rawStatus);

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(grammarWord)).toBeInTheDocument();
    expect(within(myShowsCard()).getByText(grammarWord)).toBeInTheDocument();
    // "Scratched" is never rendered to anyone (docs/INTENT.md).
    expect(screen.queryByText(/scratch/i)).not.toBeInTheDocument();
  });
});
