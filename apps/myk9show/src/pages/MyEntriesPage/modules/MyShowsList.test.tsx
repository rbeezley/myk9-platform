/**
 * Render tests for the dog-first My Shows list (MYK9-482, task 2.5).
 *
 * Everything is asserted through roles and visible text, never class names:
 * the point of this redesign is what the exhibitor can read and reach, and a
 * class-name assertion passes on a card nobody can use.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry } from './my-entries-types';
import { heartlandRows, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { applyEntryScope } from './entryScopeFilter';
import { buildScopeMessage } from './entryScopeMessage';
import { MyShowsList, useMyShowGroups, type MyShowsListProps } from './MyShowsList';

function renderList(overrides: Partial<MyShowsListProps> = {}) {
  const props: MyShowsListProps = {
    filteredEntries: toOrders(heartlandRows()),
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MyShowsList {...props} />) };
}

/** Every dog card in the Heartland group, as list items. */
function dogCards(): HTMLElement[] {
  const region = screen.getByRole('region', { name: 'Heartland Scent Work Classic' });
  return within(region).getAllByRole('listitem');
}

/** The one dog card that names this dog. */
function dogCard(name: string): HTMLElement {
  const card = dogCards().find(item => within(item).queryByText(name) !== null);
  if (!card) throw new Error(`no dog card for ${name}`);
  return card;
}

describe('MyShowsList — a multi-order show renders once, dog-first', () => {
  beforeEach(() => localStorage.clear());

  it('renders one show header and one card per dog', () => {
    renderList();

    expect(screen.getAllByRole('heading', { name: 'Heartland Scent Work Classic' })).toHaveLength(
      1
    );
    expect(dogCards()).toHaveLength(4);
    for (const name of ['Juni', 'Willow', 'Scout', 'Ranger']) {
      expect(dogCard(name)).toBeInTheDocument();
    }
  });

  it('carries the money word in the meta line and no payment chip anywhere', () => {
    renderList();

    expect(screen.getByText('Paid')).toBeInTheDocument();
    for (const chip of ['Payment Due', 'Payment unresolved', 'Partial Refund', 'Refunded']) {
      expect(screen.queryByText(chip)).not.toBeInTheDocument();
    }
  });

  it('notes a partial refund under the dog it touched, quietly', () => {
    renderList();

    expect(
      within(dogCard('Ranger')).getByText('Partial refund of $15.00 issued Oct 8.')
    ).toBeInTheDocument();
    expect(within(dogCard('Willow')).queryByText(/refund/i)).not.toBeInTheDocument();
  });

  it('distinguishes two trials on the same calendar day', () => {
    renderList();
    const willow = within(dogCard('Willow'));

    expect(willow.getByText('Sat, Oct 24 · Trial 1')).toBeInTheDocument();
    expect(willow.getByText('Sat, Oct 24 · Trial 2')).toBeInTheDocument();
  });

  it('shows each class its own state without expanding anything', () => {
    renderList();

    expect(within(dogCard('Juni')).getByText('in the ring')).toBeInTheDocument();
    expect(within(dogCard('Willow')).getByText('at gate')).toBeInTheDocument();
    expect(within(dogCard('Ranger')).getByText('conflict')).toBeInTheDocument();
    expect(within(dogCard('Ranger')).getByText('preliminary')).toBeInTheDocument();
    expect(within(dogCard('Ranger')).getByText('56.8s')).toBeInTheDocument();
    expect(within(dogCard('Ranger')).getByText('2F')).toBeInTheDocument();
    expect(within(dogCard('Scout')).getByText('opens Sunday')).toBeInTheDocument();
  });

  it('rolls the dog chip up from its classes', () => {
    renderList();

    expect(within(dogCard('Juni')).getByText('In ring')).toBeInTheDocument();
    expect(within(dogCard('Ranger')).getByText('Conflict')).toBeInTheDocument();
  });

  /**
   * The chip's ICON must agree with its word. An accepted dog whose chip
   * resolved to the `pending` descriptor wore the warning-coloured
   * needs-attention glyph beside the word "Accepted".
   */
  it('paints an accepted dog\u2019s chip with the accepted descriptor, not pending', () => {
    renderList();
    // The glyph is decorative inside the badge, so it has no accessible name;
    // its `data-status` is the descriptor it actually resolved.
    const icon = dogCard('Scout').querySelector('[data-family="entry"]');

    expect(icon).toHaveAttribute('data-status', 'accepted');
    expect(icon).toHaveClass('text-info');
    expect(icon).not.toHaveClass('text-warning');
  });

  it('drops the class number from the row: the name alone is what is called', () => {
    renderList();

    expect(within(dogCard('Juni')).getByText('Exterior Excellent')).toBeInTheDocument();
    expect(within(dogCard('Juni')).queryByText(/#/)).not.toBeInTheDocument();
  });
});

describe('MyShowsList — check-in controls', () => {
  beforeEach(() => localStorage.clear());

  it("checks in exactly today's untouched classes from the day button", async () => {
    const user = userEvent.setup();
    const onCheckInDay = vi.fn();
    renderList({ onCheckInDay });

    await user.click(
      within(dogCard('Scout')).getByRole('button', { name: 'Check in for Saturday' })
    );

    expect(onCheckInDay).toHaveBeenCalledTimes(1);
    const [dog, classes] = onCheckInDay.mock.calls[0];
    expect(dog.dogName).toBe('Scout');
    expect(classes.map((cls: { id: string }) => cls.id)).toEqual(['c-scout-1']);
  });

  it('offers no day button to a dog whose classes already carry a state', () => {
    renderList();

    expect(
      within(dogCard('Willow')).queryByRole('button', { name: /^Check in for/ })
    ).not.toBeInTheDocument();
  });

  it('names the dog and the class on the row-level check-in link', async () => {
    const user = userEvent.setup();
    const onCheckInDay = vi.fn();
    renderList({ onCheckInDay });

    await user.click(screen.getByRole('button', { name: 'Check in Scout for Container Novice A' }));

    expect(onCheckInDay.mock.calls[0][1].map((cls: { id: string }) => cls.id)).toEqual([
      'c-scout-1',
    ]);
  });

  it('opens the existing check-in dialog from a row "change" link', async () => {
    const user = userEvent.setup();
    const onOpenCheckIn = vi.fn();
    renderList({ onOpenCheckIn });

    await user.click(screen.getByRole('button', { name: 'Change check-in for Interior Advanced' }));

    expect(onOpenCheckIn).toHaveBeenCalledTimes(1);
    const [order, cls] = onOpenCheckIn.mock.calls[0];
    expect(order.id).toBe(cls.orderId);
    expect(cls.id).toBe('c-willow-1');
  });
});

describe('MyShowsList — the self-check-in cascade and settled classes (task 3.3)', () => {
  beforeEach(() => localStorage.clear());

  /** One dog, two classes on the fixture's Saturday, distinct class ids. */
  function twoClassesTodayRows() {
    return [
      makeRow({
        id: 'e-pilot',
        registrationId: 'r-pilot',
        dogId: 'dog-pilot',
        dogName: 'Pilot',
        armband: '110',
        classes: [
          makeClass({ id: 'c-pilot-1', classId: 'class-open', name: 'Interior Novice A' }),
          makeClass({ id: 'c-pilot-2', classId: 'class-closed', name: 'Buried Novice A' }),
        ],
      }),
    ];
  }

  it('drops the closed class from the day button and hides only its row link', async () => {
    const user = userEvent.setup();
    // The secretary turned self check-in off for one class. The sibling class
    // is untouched, so the dog keeps its button — it just writes one class.
    const onCheckInDay = vi.fn();
    renderList({
      filteredEntries: toOrders(twoClassesTodayRows()),
      selfCheckinByClassId: { 'class-open': true, 'class-closed': false },
      onCheckInDay,
    });

    expect(
      screen.getByRole('button', { name: 'Check in Pilot for Interior Novice A' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Check in Pilot for Buried Novice A' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Check in for Saturday' }));
    expect(onCheckInDay.mock.calls[0][1].map((cls: { id: string }) => cls.id)).toEqual([
      'c-pilot-1',
    ]);
  });

  it('offers nothing at all when every class of the day is closed', () => {
    renderList({
      filteredEntries: toOrders(twoClassesTodayRows()),
      selfCheckinByClassId: { 'class-open': false, 'class-closed': false },
    });

    expect(screen.queryByRole('button', { name: /^Check in for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Check in Pilot/ })).not.toBeInTheDocument();
  });

  // MYK9-209: a class the secretary already settled absent or excused is
  // accounted for. Offering check-in on it invites a write the RPC will refuse
  // and tells the exhibitor their dog might still run.
  it.each(['absent', 'excused'] as const)(
    'offers no check-in control on a class already settled %s',
    resultStatus => {
      renderList({
        filteredEntries: toOrders([
          makeRow({
            id: 'e-settled',
            registrationId: 'r-settled',
            dogId: 'dog-settled',
            dogName: 'Maple',
            armband: '111',
            classes: [
              makeClass({
                id: 'c-settled-1',
                classId: 'class-settled',
                name: 'Interior Novice A',
                checkInStatus: 'no-status',
                isScored: false,
                resultStatus,
              }),
            ],
          }),
        ]),
      });

      expect(screen.queryByRole('button', { name: /^Check in for/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Check in Maple/ })).not.toBeInTheDocument();
      // The row still says what happened, so the absence of a control reads as
      // settled rather than broken.
      expect(screen.getByText(resultStatus === 'absent' ? 'ABS' : 'EX')).toBeInTheDocument();
    }
  );
});

describe('MyShowsList — a scoped ?entryIds= link narrows the group (task 4.3)', () => {
  beforeEach(() => localStorage.clear());

  const orders = toOrders(heartlandRows());
  /** The scope My Payments' Receipt link builds for Scout's order. */
  const scope = { showId: 'show-heartland', entryIds: ['c-scout-1', 'c-scout-2'] };

  it('renders only the named order’s dogs and rows', () => {
    const match = applyEntryScope(orders, scope);
    expect(match.kind).toBe('entries');

    renderList({ filteredEntries: match.entries });

    expect(dogCards()).toHaveLength(1);
    expect(within(dogCard('Scout')).getByText('Container Novice A')).toBeInTheDocument();
    expect(within(dogCard('Scout')).getByText('Interior Novice B')).toBeInTheDocument();
    for (const absent of ['Juni', 'Willow', 'Ranger']) {
      expect(screen.queryByText(absent)).not.toBeInTheDocument();
    }
  });

  it('groups the scoped orders without touching the banner copy', () => {
    const match = applyEntryScope(orders, scope);
    const { result } = renderHook(() => useMyShowGroups(match.entries));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].dogs.map(dog => dog.dogName)).toEqual(['Scout']);
    expect(result.current[0].orders.map(order => order.id)).toEqual(['e-scout']);
    // The same sentence entryScopeMessage.test.ts already pins for this kind —
    // grouping is a render-time view and must not change what the banner says.
    expect(buildScopeMessage(match, orders.length)).toBe(
      'Showing 1 of 3 entries — the ones your payment for Heartland Scent Work Classic covered.'
    );
  });
});

describe('MyShowsList — the status filter narrows DOGS, not just orders (Codex, PR #2198)', () => {
  beforeEach(() => localStorage.clear());

  /** ONE order holding a pending dog and an accepted dog. */
  function mixedOrderRows(): MyEntry[] {
    return [
      makeRow({
        id: 'mix-pending',
        registrationId: 'reg-mixed',
        dogId: 'dog-pending',
        dogName: 'Pepper',
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [
          makeClass({
            id: 'c-mix-1',
            entryStatus: EntryStatus.PENDING,
            paymentStatus: PaymentStatus.PAID_ONLINE,
          }),
        ],
      }),
      makeRow({
        id: 'mix-accepted',
        registrationId: 'reg-mixed',
        dogId: 'dog-accepted',
        dogName: 'Atlas',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [
          makeClass({
            id: 'c-mix-2',
            entryStatus: EntryStatus.ACCEPTED,
            paymentStatus: PaymentStatus.PAID_ONLINE,
          }),
        ],
      }),
    ];
  }

  it('renders only the pending dog under Pending, even though the order is one card', () => {
    // The order's dominant status is ACCEPTED, so the hook would keep it under
    // "Accepted" and drop it under "Pending"; the list must narrow by dog.
    const orders = toOrders(mixedOrderRows());
    expect(orders).toHaveLength(1);

    renderList({ filteredEntries: orders, selectedStatus: 'pending' });

    expect(screen.getByText('Pepper')).toBeInTheDocument();
    expect(screen.queryByText('Atlas')).not.toBeInTheDocument();
  });

  it('renders only the accepted dog under Accepted', () => {
    renderList({ filteredEntries: toOrders(mixedOrderRows()), selectedStatus: 'accepted' });

    expect(screen.getByText('Atlas')).toBeInTheDocument();
    expect(screen.queryByText('Pepper')).not.toBeInTheDocument();
  });

  it('renders both under Any status, and hides the show when no dog matches', () => {
    const { unmount } = renderList({ filteredEntries: toOrders(mixedOrderRows()) });
    expect(screen.getByText('Pepper')).toBeInTheDocument();
    expect(screen.getByText('Atlas')).toBeInTheDocument();
    unmount();

    renderList({ filteredEntries: toOrders(mixedOrderRows()), selectedStatus: 'waitlist' });
    expect(screen.queryByRole('heading', { name: 'Heartland Scent Work Classic' })).toBeNull();
  });
});
