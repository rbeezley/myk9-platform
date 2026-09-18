/**
 * MYK9-631: one actions menu per show card, and leaving a class from the row.
 *
 * Driven through the real `MyShowsList` on the real fixtures, so every
 * assertion is about the tree an exhibitor actually gets — the same reason
 * `MyShowGroup.test.tsx` renders the list rather than the card.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { getEntryStatusKindForDisplay } from '@/services/entryDisplay/entryDisplaySelectors';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import { render } from '@/test/utils/testUtils';
import {
  day,
  makeClass,
  makeRow,
  NOW,
  openShowActions,
  toOrders,
} from '@/test/fixtures/myShowsFixtures';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import type { EntryClass, MyEntry } from './my-entries-types';

const SHOW = 'Flint Hills Fall Classic';

function renderRows(rows: MyEntry[], overrides: Partial<MyShowsListProps> = {}) {
  const props: MyShowsListProps = {
    filteredEntries: toOrders(rows),
    source: 'confirmed',
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
    onLeaveClass: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MyShowsList {...props} />) };
}

/** An accepted, still-editable order at a show a fortnight out. */
function liveRow(classes: EntryClass[], overrides: Partial<MyEntry> = {}): MyEntry {
  return makeRow({
    id: 'e-juni',
    showId: 'show-flint',
    showName: SHOW,
    showDate: day('2026-11-14'),
    showEndDate: day('2026-11-15'),
    entryCloseDate: day('2026-11-01'),
    dogId: 'dog-juni',
    dogName: 'Juni',
    armband: '102',
    entryStatus: EntryStatus.ACCEPTED,
    classes,
    ...overrides,
  });
}

/** A class whose trial day is still ahead of `NOW`. */
function aheadClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return makeClass({
    id: 'c-juni-1',
    classId: 'class-int-adv',
    name: 'Interior Advanced',
    trialDate: day('2026-11-14'),
    ...overrides,
  });
}

beforeEach(() => localStorage.clear());

describe('MYK9-631 AC2 — the show card carries ONE actions trigger', () => {
  it('replaces the four-link row with a labelled Actions button', () => {
    renderRows([liveRow([aheadClass()])]);

    expect(screen.getByRole('button', { name: `Actions for ${SHOW}` })).toBeInTheDocument();
    // The link row is gone. These four were the header's controls before
    // MYK9-631; none of them may survive as a bare control on the card.
    expect(screen.queryByRole('button', { name: 'Orders & receipts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit entry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^View show/ })).not.toBeInTheDocument();
  });

  it('holds exactly the applicable items, in order', async () => {
    renderRows([liveRow([aheadClass()])]);

    const menu = await openShowActions(userEvent.setup(), SHOW);
    expect(menu.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Add classes',
      'Change handler or jump height',
      'Receipts',
      'Add to calendar',
      'Message the show team',
      'View show page',
    ]);
  });

  it('drops the two edit-window items once the show can no longer be changed', async () => {
    renderRows([liveRow([aheadClass()], { entryCloseDate: day('2026-01-01') })]);

    const menu = await openShowActions(userEvent.setup(), SHOW);
    expect(menu.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Receipts',
      'Add to calendar',
      'Message the show team',
      'View show page',
    ]);
  });

  it('keeps the pay button on the money strip and OUT of the menu', async () => {
    renderRows([
      liveRow(
        [
          aheadClass({
            fee: 45,
            paymentStatus: PaymentStatus.PENDING,
            paymentMethod: 'online',
          }),
        ],
        { totalFee: 45, paymentStatus: PaymentStatus.PENDING, paymentMethod: 'online' }
      ),
    ]);

    // On the strip, titled with the amount it will collect.
    const pay = screen.getByRole('link', { name: 'Pay $45.00' });
    expect(pay).toHaveAttribute('href', '/cart?showId=show-flint&entryIds=c-juni-1');

    // And NOT repeated in the menu: a status banner keeps its own verb.
    const menu = await openShowActions(userEvent.setup(), SHOW);
    expect(menu.queryByRole('menuitem', { name: /Pay/ })).not.toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: /payment/i })).not.toBeInTheDocument();
  });

  it('routes Receipts and the edit item to the page handlers, not to new UI', async () => {
    const user = userEvent.setup();
    const { props } = renderRows([liveRow([aheadClass()])]);

    await user.click(
      (await openShowActions(user, SHOW)).getByRole('menuitem', { name: 'Receipts' })
    );
    expect(props.onOpenReceipts).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-flint' }),
      'settled'
    );

    await user.click(
      (await openShowActions(user, SHOW)).getByRole('menuitem', {
        name: 'Change handler or jump height',
      })
    );
    expect(props.onOpenEdit).toHaveBeenCalledWith([expect.objectContaining({ id: 'e-juni' })]);
  });

  it('links Add classes at the show page rather than reimplementing the wizard', async () => {
    renderRows([liveRow([aheadClass()])]);

    const menu = await openShowActions(userEvent.setup(), SHOW);
    expect(menu.getByRole('menuitem', { name: /Add classes/ })).toHaveAttribute(
      'href',
      '/shows/show-flint'
    );
  });
});

describe('MYK9-631 AC3 — leaving a class is a ROW verb', () => {
  it('opens the chooser for THAT class id, with no order picker in between', async () => {
    const user = userEvent.setup();
    const { props } = renderRows([
      liveRow([
        aheadClass(),
        aheadClass({ id: 'c-juni-2', classId: 'class-ext-exc', name: 'Exterior Excellent' }),
      ]),
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Withdraw or pull Juni from Exterior Excellent' })
    );

    expect(props.onLeaveClass).toHaveBeenCalledTimes(1);
    expect(props.onLeaveClass).toHaveBeenCalledWith({
      classId: 'c-juni-2',
      className: 'Exterior Excellent',
      dogName: 'Juni',
      showId: 'show-flint',
    });
  });

  it('offers the control on every live row, and never in the menu', async () => {
    renderRows([liveRow([aheadClass()])]);

    expect(screen.getByRole('button', { name: /Withdraw or pull Juni/ })).toBeInTheDocument();
    const menu = await openShowActions(userEvent.setup(), SHOW);
    expect(menu.queryByRole('menuitem', { name: /Withdraw/i })).not.toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: /Leave/i })).not.toBeInTheDocument();
  });

  it('withholds it once the class has run', () => {
    renderRows([
      liveRow([aheadClass({ isScored: true, resultStatus: 'qualified' })], {
        showDate: day('2026-10-24'),
        showEndDate: day('2026-10-24'),
      }),
    ]);

    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Withdraw or pull/ })).not.toBeInTheDocument();
  });

  // The row kind is derived from the LOSSLESS `entryStatusKind`, so the
  // fixture is projected exactly as `useMyEntriesData` projects a raw
  // `entry_status` — a hand-set UI enum would not reach the branch at all.
  it.each(['withdrawn', 'scratched', 'moved', 'not_accepted'])(
    'withholds it once the entry is %s',
    rawStatus => {
      const kind = getEntryStatusKindForDisplay(rawStatus, null);
      renderRows([
        liveRow(
          [
            aheadClass({
              entryStatus: mapEntryStatus(rawStatus),
              entryStatusKind: kind,
              status: mapClassEntryStatus(rawStatus),
            }),
          ],
          { entryStatus: mapEntryStatus(rawStatus), entryStatusKind: kind }
        ),
      ]);

      // Positive control: the row IS on screen, so the absence above is the
      // control being withheld rather than nothing having rendered.
      expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Withdraw or pull/ })).not.toBeInTheDocument();
    }
  );

  it('withholds it once the show itself is over', () => {
    renderRows([
      liveRow([aheadClass({ trialDate: day('2026-08-01') })], {
        showDate: day('2026-08-01'),
        showEndDate: day('2026-08-02'),
      }),
    ]);

    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Withdraw or pull/ })).not.toBeInTheDocument();
  });
});
