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
      'Add entry',
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

  // Round 1 (K P3-2 / L P3): this used to emit `/shows/:id`, the same href
  // `View show page` already had — two labels, one destination, in the menu
  // whose purpose is to stop scattering. It now points at the wizard's own
  // route, so the two items genuinely differ.
  it('links Add entry at the registration wizard, not the show page', async () => {
    renderRows([liveRow([aheadClass()])]);

    const menu = await openShowActions(userEvent.setup(), SHOW);
    const addEntry = menu.getByRole('menuitem', { name: /Add entry/ });
    const viewShow = menu.getByRole('menuitem', { name: /View the show page/ });
    expect(addEntry).toHaveAttribute('href', '/shows/show-flint/register');
    expect(viewShow).toHaveAttribute('href', '/shows/show-flint');
    expect(addEntry.getAttribute('href')).not.toBe(viewShow.getAttribute('href'));
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

    // The accessible name now carries the trial discriminator too, so match on
    // the class rather than the whole string.
    await user.click(
      screen.getByRole('button', {
        name: /^Leave class: withdraw or pull Juni from Exterior Excellent/,
      })
    );

    expect(props.onLeaveClass).toHaveBeenCalledTimes(1);
    expect(props.onLeaveClass).toHaveBeenCalledWith({
      classId: 'c-juni-2',
      className: 'Exterior Excellent',
      classWhen: expect.any(String),
      dogName: 'Juni',
      dogId: 'dog-juni',
      // MYK9-658: the card's own id, unique per rendered card.
      dogCardId: 'e-juni',
      showId: 'show-flint',
    });
  });

  // WCAG 2.5.3 Label in Name. Asserted as a RELATION between the two strings,
  // not as a hard-coded name: a future rewording of either has to keep them
  // consistent, which a literal expectation would not enforce.
  it('has an accessible name that starts with its visible label', () => {
    renderRows([liveRow([aheadClass()])]);

    const control = screen.getByRole('button', { name: /^Leave class/ });
    const visible = control.textContent?.replace(/\u2026$/, '').trim() ?? '';
    const accessible = control.getAttribute('aria-label') ?? '';

    expect(visible).toBe('Leave class');
    // Voice control matches on the visible words, so they must be present —
    // and at the front, so "click Leave class" is unambiguous.
    expect(accessible.toLowerCase()).toContain(visible.toLowerCase());
    expect(accessible.toLowerCase().startsWith(visible.toLowerCase())).toBe(true);
    // Still carries the disambiguators the destructive act needs.
    expect(accessible).toContain('Juni');
    expect(accessible).toContain('Interior Advanced');
  });

  it('offers the control on every live row, and never in the menu', async () => {
    renderRows([liveRow([aheadClass()])]);

    expect(
      screen.getByRole('button', { name: /Leave class: withdraw or pull Juni/ })
    ).toBeInTheDocument();
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
    expect(
      screen.queryByRole('button', { name: /Leave class: withdraw or pull/ })
    ).not.toBeInTheDocument();
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
      expect(
        screen.queryByRole('button', { name: /Leave class: withdraw or pull/ })
      ).not.toBeInTheDocument();
    }
  );

  // Round 1, lens K (P2-1). Every MENU item already carried this guard; the row
  // control did not, and the failure was worse than a dead link:
  // `useShowRegistryId('')` never resolves, so the chooser opened with Withdraw
  // disabled under "Checking the show's rules…" forever while Pull — the arm
  // with no refund path — stayed clickable.
  it('withholds it while the show relation is still replicating', () => {
    renderRows([liveRow([aheadClass()], { showId: '' })]);

    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Leave class: withdraw or pull/ })
    ).not.toBeInTheDocument();
  });

  // Round 1, lens K (P3-1). `pulled` is a `check_in_status`, not a lifecycle
  // state: the entry is still entered and the server admits it
  // (PRE_SHOW_CHECK_IN_STATUSES). Withholding the control meant a dog pulled at
  // the gate could never be converted into a RECORDED withdrawal, because the
  // "change" link beside it writes check-in alone.
  it('still offers it on a pre-show row already pulled at check-in', () => {
    renderRows([liveRow([aheadClass({ checkInStatus: 'pulled' })])]);

    expect(
      screen.getByRole('button', {
        name: /Leave class: withdraw or pull Juni from Interior Advanced/,
      })
    ).toBeInTheDocument();
    // And the check-in "change" link is still there — the two do different things.
    expect(screen.getByRole('button', { name: /Change Juni's check-in/ })).toBeInTheDocument();
  });

  // Round 1, lens K (P2-2) + the owner rule this PR states in its body and in
  // docs/plan-exhibitor-show-actions.md §4 Q9: the row control is deliberately
  // NOT gated on the entry-close deadline, unlike the Edit sheet it replaced.
  // MYK9-632 built Withdraw/Pull for exactly the post-close and day-of cases;
  // Withdraw's own cutoff is enforced by the registry policy inside the
  // chooser, not by hiding the control.
  it('is offered past entry close, while the class has not yet run', async () => {
    const { props } = renderRows([liveRow([aheadClass()], { entryCloseDate: day('2026-01-01') })]);

    // The sheet's own item is gone — nothing is editable any more...
    const menu = await openShowActions(userEvent.setup(), SHOW);
    expect(
      menu.queryByRole('menuitem', { name: 'Change handler or jump height' })
    ).not.toBeInTheDocument();

    // ...but leaving the class is still offered, and still routes to THAT row.
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: /Leave class: withdraw or pull Juni from Interior Advanced/,
      })
    );
    expect(props.onLeaveClass).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'c-juni-1', className: 'Interior Advanced' })
    );
  });

  // Round 1, lens L (P2). RemoveFromClassDialog keys its body on the class ID
  // precisely because two trials of one show can run a class with the same
  // display NAME — but the control and the chooser copy were naming it by that
  // ambiguous string alone, giving a screen-reader user two identical buttons.
  it('disambiguates two same-named classes in different trials', async () => {
    const { props } = renderRows([
      liveRow([
        aheadClass({ id: 'c-t1', name: 'Container Novice A', trialNumber: '1' }),
        aheadClass({
          id: 'c-t2',
          name: 'Container Novice A',
          trialNumber: '2',
          trialDate: day('2026-11-15'),
        }),
      ]),
    ]);

    const controls = screen.getAllByRole('button', { name: /^Leave class: withdraw or pull Juni/ });
    expect(controls).toHaveLength(2);
    const names = controls.map(c => c.getAttribute('aria-label'));
    // The whole point: the two accessible names differ.
    expect(new Set(names).size).toBe(2);
    for (const name of names) expect(name).toMatch(/Container Novice A, /);

    await userEvent.setup().click(controls[1]!);
    expect(props.onLeaveClass).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'c-t2', className: 'Container Novice A' })
    );
    // The discriminator travels with the target, so the chooser can print it.
    expect(props.onLeaveClass).toHaveBeenCalledWith(
      expect.objectContaining({ classWhen: expect.stringMatching(/Trial 2|Nov 15/) })
    );
  });

  it('withholds it once the show itself is over', () => {
    renderRows([
      liveRow([aheadClass({ trialDate: day('2026-08-01') })], {
        showDate: day('2026-08-01'),
        showEndDate: day('2026-08-02'),
      }),
    ]);

    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Leave class: withdraw or pull/ })
    ).not.toBeInTheDocument();
  });

  // MYK9-778: the secretary's closeout ends the show too, even before its last
  // calendar day is behind us — and the server refuses an owner from then on.
  // The positive control is `liveRow([aheadClass()])` above, which offers it.
  it('withholds it once the secretary has closed the show out', () => {
    renderRows([liveRow([aheadClass()], { isShowClosedOut: true })]);

    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Leave class: withdraw or pull/ })
    ).not.toBeInTheDocument();
  });
});
