/**
 * Money and status variants of a My Shows show group (MYK9-482, task 2.5).
 *
 * Money is only allowed to speak when it needs something: exactly one strip
 * per show, no chips, and a paid confirmation that retires on Dismiss.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { render } from '@/test/utils/testUtils';
import {
  day,
  makeClass,
  makeRow,
  NOW,
  openShowActions,
  toOrders,
} from '@/test/fixtures/myShowsFixtures';
import { parseShowDate } from './myEntriesStats.helpers';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import type { MyEntry } from './my-entries-types';

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
  return render(<MyShowsList {...props} />);
}

/** A show still ahead of `NOW`, so nothing is judged as past. */
function futureShowRow(overrides: Partial<MyEntry> = {}): MyEntry {
  return makeRow({
    showId: 'show-flint',
    showName: 'Flint Hills Fall Classic',
    showDate: day('2026-11-14'),
    showEndDate: day('2026-11-15'),
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
});

const FLINT = 'Flint Hills Fall Classic';

/** The card's one Actions menu, opened (MYK9-631 AC2). */
async function flintMenu() {
  return openShowActions(userEvent.setup(), FLINT);
}

describe('balance due', () => {
  const rows = [
    futureShowRow({
      id: 'e-scout',
      dogId: 'dog-scout',
      dogName: 'Scout',
      totalFee: 45,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'online',
      classes: [
        makeClass({
          id: 'c-scout-1',
          fee: 45,
          trialDate: day('2026-11-14'),
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: 'online',
        }),
      ],
    }),
  ];

  it('renders exactly one warm strip naming the dog, the amount, and the cart link', () => {
    renderRows(rows);

    expect(screen.getByText("Scout's entry is waiting on payment")).toBeInTheDocument();
    expect(
      screen.getByText('$45.00 due · the secretary will review it once it is paid.')
    ).toBeInTheDocument();

    // MYK9-631: the strip keeps its own button — a status banner does not
    // hand its verb to the menu — but it is titled with the amount now, so it
    // cannot read as a duplicate of the page header's "Finish Payment".
    const finish = screen.getByRole('link', { name: 'Pay $45.00' });
    expect(finish).toHaveAttribute('href', '/cart?showId=show-flint&entryIds=c-scout-1');
  });

  it('drops the money word from the meta line while a balance is owed', () => {
    renderRows(rows);

    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Pay at show')).not.toBeInTheDocument();
  });
});

describe('pay at show', () => {
  it('says so in the meta line and renders no strip', () => {
    renderRows([
      futureShowRow({
        id: 'e-check',
        dogId: 'dog-scout',
        dogName: 'Scout',
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'check',
        classes: [
          makeClass({
            id: 'c-check-1',
            trialDate: day('2026-11-14'),
            paymentStatus: PaymentStatus.PENDING,
            paymentMethod: 'check',
          }),
        ],
      }),
    ]);

    expect(screen.getByText('Pay at show')).toBeInTheDocument();
    expect(screen.queryByText(/waiting on payment/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Pay \$/ })).not.toBeInTheDocument();
  });
});

describe('pending review', () => {
  it('reassures the exhibitor beneath the class rows', () => {
    renderRows([
      futureShowRow({
        id: 'e-pending',
        dogId: 'dog-willow',
        dogName: 'Willow',
        entryStatus: EntryStatus.PENDING,
        classes: [
          makeClass({
            id: 'c-pending-1',
            trialDate: day('2026-11-14'),
            entryStatus: EntryStatus.PENDING,
          }),
        ],
      }),
    ]);

    expect(screen.getByText('The show secretary is reviewing this entry.')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });
});

describe('unassigned armband', () => {
  it('shows a muted dash rather than a filled pill', () => {
    renderRows([
      futureShowRow({
        id: 'e-noband',
        dogId: 'dog-willow',
        dogName: 'Willow',
        armband: undefined,
        classes: [makeClass({ id: 'c-noband-1', trialDate: day('2026-11-14') })],
      }),
    ]);

    const region = screen.getByRole('region', { name: 'Flint Hills Fall Classic' });
    const dash = within(region).getByText('—');
    expect(dash).toHaveClass('text-muted-foreground');
    expect(dash.className).not.toMatch(/bg-primary/);
  });
});

describe('paid confirmation', () => {
  const paidRows = [
    futureShowRow({
      id: 'e-paid',
      dogId: 'dog-willow',
      dogName: 'Willow',
      totalFee: 45,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      paymentMethod: 'online',
      // Paid (submitted) two days before NOW, inside the 14-day confirmation
      // window. `lastUpdated` is deliberately OLDER: the window keys on the
      // checkout moment, and a later unrelated write must not matter.
      submittedAt: new Date('2026-10-22T12:00:00Z'),
      lastUpdated: new Date('2026-09-02T00:00:00Z'),
      classes: [
        makeClass({
          id: 'c-paid-1',
          fee: 45,
          trialDate: day('2026-11-14'),
          paymentStatus: PaymentStatus.PAID_ONLINE,
          paymentMethod: 'online',
        }),
      ],
    }),
  ];

  it('shows one green strip with the dog, amount and date', () => {
    renderRows(paidRows);

    expect(screen.getByText(/Willow's entry is paid — \$45\.00 on/)).toBeInTheDocument();
    expect(
      screen.getByText('The secretary will review it next. Receipt sent to your email.')
    ).toBeInTheDocument();
  });

  it('retires on Dismiss and stays retired on the next render', async () => {
    const user = userEvent.setup();
    const { unmount } = renderRows(paidRows);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/entry is paid/)).not.toBeInTheDocument();

    unmount();
    renderRows(paidRows);
    expect(screen.queryByText(/entry is paid/)).not.toBeInTheDocument();
  });
});

// MYK9-804: the "entries are paid" banner must state the show's real paid
// total, independent of the page's own When/Status filters, and must not
// drop a dog's paid class just because a sibling on the same order still
// owes money.
describe('paid confirmation states the real total (MYK9-804)', () => {
  it("confirms a dog's paid class even though a sibling on the same order is still pending", () => {
    renderRows([
      futureShowRow({
        id: 'e-ranger',
        registrationId: 'reg-mixed',
        dogId: 'dog-ranger',
        dogName: 'Ranger',
        totalFee: 30,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paymentMethod: 'online',
        submittedAt: new Date('2026-10-22T12:00:00Z'),
        classes: [
          makeClass({
            id: 'c-ranger-1',
            fee: 30,
            trialDate: day('2026-11-14'),
            paymentStatus: PaymentStatus.PAID_ONLINE,
            paymentMethod: 'online',
          }),
        ],
      }),
      futureShowRow({
        id: 'e-juni',
        registrationId: 'reg-mixed',
        dogId: 'dog-juni',
        dogName: 'Juni',
        totalFee: 30,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'online',
        // Same submission moment as Ranger's row: `groupEntriesByOrder` merges
        // the two into ONE order and keeps the EARLIEST `submittedAt` across
        // its rows, so leaving this at the fixture's older default would push
        // the merged order's date outside the paid strip's 14-day window.
        submittedAt: new Date('2026-10-22T12:00:00Z'),
        classes: [
          makeClass({
            id: 'c-juni-1',
            fee: 30,
            trialDate: day('2026-11-14'),
            paymentStatus: PaymentStatus.PENDING,
            paymentMethod: 'online',
          }),
        ],
      }),
    ]);

    // The waiting-on-payment strip still names Juni for the sibling's due row…
    expect(screen.getByText(/Juni's entry is waiting on payment/)).toBeInTheDocument();
    // …and the paid strip still confirms Ranger's own paid row, rather than
    // being suppressed because the shared order's reconciled status is PENDING.
    expect(screen.getByText(/Ranger's entry is paid — \$30\.00 on/)).toBeInTheDocument();
  });

  it('states the same paid total whether or not the active filter would have dropped an order', () => {
    const rows = [
      // Willow's order is already scored — the kind an "Upcoming" filter
      // narrows away — but it is still paid and still today's money fact.
      futureShowRow({
        id: 'e-scored',
        registrationId: 'reg-scored',
        dogId: 'dog-willow',
        dogName: 'Willow',
        totalFee: 30,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paymentMethod: 'online',
        submittedAt: new Date('2026-10-22T12:00:00Z'),
        classes: [
          makeClass({
            id: 'c-scored-1',
            fee: 30,
            trialDate: day('2026-11-14'),
            paymentStatus: PaymentStatus.PAID_ONLINE,
            paymentMethod: 'online',
            isScored: true,
            resultStatus: 'qualified',
          }),
        ],
      }),
      futureShowRow({
        id: 'e-upcoming',
        registrationId: 'reg-upcoming',
        dogId: 'dog-scout',
        dogName: 'Scout',
        totalFee: 30,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paymentMethod: 'online',
        submittedAt: new Date('2026-10-22T12:00:00Z'),
        classes: [
          makeClass({
            id: 'c-upcoming-1',
            fee: 30,
            trialDate: day('2026-11-14'),
            paymentStatus: PaymentStatus.PAID_ONLINE,
            paymentMethod: 'online',
          }),
        ],
      }),
    ];
    const allEntries = toOrders(rows);
    // Simulate the "Upcoming" tab dropping the already-scored order out of the
    // filtered view — the banner must not follow it down.
    const upcomingOnly = allEntries.filter(order => order.id !== 'e-scored');

    renderRows(rows, { filteredEntries: upcomingOnly, allEntries });

    expect(
      screen.getByText(/Willow and Scout's entries are paid — \$60\.00 on/)
    ).toBeInTheDocument();
    // The narrowed filter still hid Willow's own dog card — only the banner
    // reads from the unfiltered total.
    expect(screen.queryByText('Willow')).not.toBeInTheDocument();
  });

  // Codex review (correctness/data-flow lens) on PR #2548: the paid strip now
  // reads from `allOrders`, not `group.orders`, so its own money-confirmed
  // gate must cover the SAME set — `moneyUnknown` alone only inspects
  // `group.orders` and would miss an unresolved order the active filter hid.
  it('withholds the paid strip when an order outside the filtered view has an unresolved money root', () => {
    // A completed order the current filter hides, carrying a paid class —
    // but its balance still marks the partial-replication `moneyRootUnresolved`
    // window `deriveShowMoneyState`'s own gate exists to withhold money for.
    const unresolvedOrder = futureShowRow({
      id: 'e-unresolved',
      registrationId: 'reg-unresolved',
      dogId: 'dog-hidden',
      dogName: 'Hidden',
      totalFee: 30,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      paymentMethod: 'online',
      // Inside the 14-day paid-strip window (NOW is 2026-10-24) — the
      // fixture default is 2026-09-01, which `derivePaidStrip`'s OWN window
      // check would already exclude regardless of this test's fix, making
      // the scenario a false negative for the money-root gate specifically.
      submittedAt: new Date('2026-10-22T12:00:00Z'),
      dogs: [
        {
          id: 'c-hidden-1',
          dogId: 'dog-hidden',
          dogName: 'Hidden',
          entryStatus: EntryStatus.ACCEPTED,
          classes: [
            makeClass({ id: 'c-hidden-1', fee: 30, paymentStatus: PaymentStatus.PAID_ONLINE }),
          ],
        },
      ],
      balance: {
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paymentMethod: 'online',
        amountDueCents: 0,
        onlineDueCents: 0,
        payAtShowDueCents: 0,
        payAtShowMethod: null,
        dueEntryIds: [],
        moneyRootUnresolved: true,
      },
    });

    const visibleOrders = toOrders([
      futureShowRow({
        id: 'e-visible',
        registrationId: 'reg-visible',
        dogId: 'dog-visible',
        dogName: 'Visible',
        totalFee: 30,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        paymentMethod: 'online',
        classes: [
          makeClass({ id: 'c-visible-1', fee: 30, paymentStatus: PaymentStatus.PAID_ONLINE }),
        ],
      }),
    ]);

    renderRows([], {
      filteredEntries: visibleOrders,
      allEntries: [...visibleOrders, unresolvedOrder],
    });

    expect(screen.queryByText(/entry is paid|entries are paid/)).not.toBeInTheDocument();
  });
});

describe('entries-close deadline', () => {
  /** An editable (accepted, still-open) order, so the header may state a deadline. */
  function editableRow(entryCloseDate: Date | undefined): MyEntry {
    return futureShowRow({
      id: 'e-close',
      dogId: 'dog-scout',
      dogName: 'Scout',
      entryStatus: EntryStatus.ACCEPTED,
      entryCloseDate,
      classes: [makeClass({ id: 'c-close-1', trialDate: day('2026-11-14') })],
    });
  }

  it('states the deadline in the meta line while editing is still possible', async () => {
    renderRows([editableRow(day('2026-11-01'))]);

    expect(screen.getByText('Entries close Nov 1, 2026')).toBeInTheDocument();
    const menu = await flintMenu();
    expect(
      menu.getByRole('menuitem', { name: 'Change handler or jump height' })
    ).toBeInTheDocument();
  });

  it('drops the deadline — and the edit control — once the close date has passed', async () => {
    renderRows([editableRow(day('2026-01-01'))]);

    // A trailing space keeps this off "Entries closed", the post-deadline
    // state MYK9-502 added; what must be gone is the stated DATE.
    expect(screen.queryByText(/Entries close /)).not.toBeInTheDocument();
    const menu = await flintMenu();
    expect(
      menu.queryByRole('menuitem', { name: 'Change handler or jump height' })
    ).not.toBeInTheDocument();
  });

  it('says nothing about a deadline the show never set', () => {
    renderRows([editableRow(undefined)]);

    expect(screen.queryByText(/Entries close/)).not.toBeInTheDocument();
  });

  // MYK9-384 (E28): the DATE column reaches the page through `parseShowDate`.
  // Rendering it through `new Date()` dated a Jan 2 deadline to Jan 1 west of
  // UTC, so My Shows disagreed with the show detail page and with the server
  // guard, which keeps the show open through the END of Jan 2.
  describe('renders the deadline on its written calendar day', () => {
    const originalTimezone = process.env.TZ;

    afterEach(() => {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    });

    it.each(['America/Chicago', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati'])(
      'shows "Jan 2, 2027" for entry_close_date 2027-01-02T00:00:00+00:00 in %s',
      timezone => {
        process.env.TZ = timezone;

        // Exactly what useMyEntriesData builds from the DB column.
        renderRows([editableRow(parseShowDate('2027-01-02T00:00:00+00:00'))]);

        expect(screen.getByText('Entries close Jan 2, 2027')).toBeInTheDocument();
      }
    );
  });
});

describe('post-deadline help (MYK9-502)', () => {
  /** An order past its close date whose status is still editable. */
  function closedRow(overrides: Partial<MyEntry> = {}): MyEntry {
    return futureShowRow({
      id: 'e-closed',
      dogId: 'dog-scout',
      dogName: 'Scout',
      entryStatus: EntryStatus.ACCEPTED,
      entryCloseDate: day('2026-01-01'),
      classes: [makeClass({ id: 'c-closed-1', trialDate: day('2026-11-14') })],
      ...overrides,
    });
  }

  it('offers the show team once nothing is editable any more', async () => {
    renderRows([closedRow()]);

    expect(screen.getByText('Entries closed')).toBeInTheDocument();
    const menu = await flintMenu();
    const link = menu.getByRole('menuitem', {
      name: 'Message the show team about Flint Hills Fall Classic',
    });
    expect(link).toHaveAttribute('href', '/messages/show-flint');
    expect(
      menu.queryByRole('menuitem', { name: 'Change handler or jump height' })
    ).not.toBeInTheDocument();
  });

  // Codex, PR #2201: the close date is inclusive. NOW is midday Central on
  // 24 Oct 2026, so a show closing THAT day is still open — reading the
  // instant instead of the calendar day retired the controls a day early.
  it('offers the edit item through the whole close date', async () => {
    renderRows([closedRow({ entryCloseDate: day('2026-10-24') })]);

    // Codex P1: the exhibitor must never be left with neither control.
    const menu = await flintMenu();
    expect(
      menu.getByRole('menuitem', { name: 'Change handler or jump height' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Entries closed')).not.toBeInTheDocument();
  });

  // MYK9-631: "Message the show team" used to appear ONLY after entries
  // closed, so an exhibitor with a question before the deadline had nowhere to
  // ask it. It is now offered on every card that knows its show.
  it('offers the show team BEFORE the deadline too', async () => {
    renderRows([closedRow({ entryCloseDate: day('2026-10-24') })]);

    const menu = await flintMenu();
    expect(menu.getByRole('menuitem', { name: /Message the show team/ })).toHaveAttribute(
      'href',
      '/messages/show-flint'
    );
  });

  it('speaks the day AFTER the close date', () => {
    renderRows([closedRow({ entryCloseDate: day('2026-10-23') })]);

    expect(screen.getByText('Entries closed')).toBeInTheDocument();
  });

  it('stays silent while any order can still be edited', async () => {
    renderRows([
      closedRow(),
      futureShowRow({
        id: 'e-open',
        registrationId: 'r2',
        dogId: 'dog-willow',
        dogName: 'Willow',
        entryStatus: EntryStatus.ACCEPTED,
        entryCloseDate: day('2026-11-01'),
        classes: [makeClass({ id: 'c-open-1', trialDate: day('2026-11-14') })],
      }),
    ]);

    const menu = await flintMenu();
    expect(
      menu.getByRole('menuitem', { name: 'Change handler or jump height' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Entries closed')).not.toBeInTheDocument();
  });

  it('says nothing once the show itself is over', () => {
    renderRows([
      closedRow({
        showDate: day('2026-08-01'),
        showEndDate: day('2026-08-02'),
        entryCloseDate: day('2026-07-01'),
      }),
    ]);

    expect(screen.queryByText('Entries closed')).not.toBeInTheDocument();
  });

  it('withholds the link while the show relation is still replicating', async () => {
    renderRows([closedRow({ showId: '' })]);

    const menu = await flintMenu();
    expect(menu.queryByRole('menuitem', { name: /Message the show team/ })).not.toBeInTheDocument();
  });
});

describe('venue directions', () => {
  it('links the place label at a Google Maps route built from venue, city and state', () => {
    renderRows([
      futureShowRow({
        id: 'e-venue',
        dogId: 'dog-scout',
        dogName: 'Scout',
        location: { venue: 'Test Venue', city: 'Portland', state: 'OR' },
        classes: [makeClass({ id: 'c-venue-1', trialDate: day('2026-11-14') })],
      }),
    ]);

    const link = screen.getByRole('link', { name: 'Get directions to Test Venue, Portland, OR' });
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Test%20Venue%2C%20Portland%2C%20OR'
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The visible label stays the short "city, state" form.
    expect(link).toHaveTextContent('Portland, OR');
  });

  it('falls back to plain text when no address part is known', () => {
    renderRows([
      futureShowRow({
        id: 'e-novenue',
        dogId: 'dog-scout',
        dogName: 'Scout',
        location: { venue: '', city: '', state: '' },
        classes: [makeClass({ id: 'c-novenue-1', trialDate: day('2026-11-14') })],
      }),
    ]);

    expect(screen.queryByRole('link', { name: /Get directions/ })).not.toBeInTheDocument();
  });
});

describe('add to calendar', () => {
  function calendarRow(showId: string): MyEntry {
    return futureShowRow({
      id: 'e-cal',
      showId,
      dogId: 'dog-scout',
      dogName: 'Scout',
      classes: [makeClass({ id: 'c-cal-1', trialDate: day('2026-11-14') })],
    });
  }

  it('offers the control once the show id is known', async () => {
    renderRows([calendarRow('show-flint')]);

    const menu = await flintMenu();
    expect(menu.getByRole('menuitem', { name: 'Add to calendar' })).toBeInTheDocument();
  });

  it('withholds it while the show relation is still replicating', async () => {
    // The guard travels WITH the control: AddToCalendarDialog issues a
    // subscription for the id the moment it opens, so an empty showId must not
    // be reachable at all.
    renderRows([calendarRow('')]);

    const menu = await flintMenu();
    expect(menu.queryByRole('menuitem', { name: 'Add to calendar' })).not.toBeInTheDocument();
  });
});

describe('unresolved show id (Codex, PR #2198)', () => {
  // The positive control for the absence assertions below: the same fixture
  // WITH a show id offers all three, so a renamed item cannot turn this into a
  // test that passes on an empty menu.
  it('offers every show-bound item once the show id is known', async () => {
    renderRows([futureShowRow({ id: 'e-resolved' })]);

    const menu = await flintMenu();
    expect(menu.getByRole('menuitem', { name: /View the show page/ })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: 'Add to calendar' })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: /Add entry/ })).toBeInTheDocument();
  });

  it('offers no show-bound item while the show relation is still replicating', async () => {
    renderRows([futureShowRow({ id: 'e-unresolved', showId: '' })]);

    const menu = await flintMenu();
    expect(menu.queryByRole('menuitem', { name: /View the show page/ })).not.toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: 'Add to calendar' })).not.toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: /Add entry/ })).not.toBeInTheDocument();
    // Receipts needs only an order, so it survives the replication window —
    // withholding a receipt for a payment already taken is the one thing that
    // makes a real payment look lost.
    expect(menu.getByRole('menuitem', { name: 'Receipts' })).toBeInTheDocument();
  });
});
