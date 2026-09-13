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
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { parseShowDate } from './myEntriesStats.helpers';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import type { MyEntry } from './my-entries-types';

function renderRows(rows: MyEntry[], overrides: Partial<MyShowsListProps> = {}) {
  const props: MyShowsListProps = {
    filteredEntries: toOrders(rows),
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
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

beforeEach(() => localStorage.clear());

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

    const finish = screen.getByRole('link', { name: /Finish payment/ });
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
    expect(screen.queryByRole('link', { name: /Finish payment/ })).not.toBeInTheDocument();
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

  it('states the deadline in the meta line while editing is still possible', () => {
    renderRows([editableRow(day('2026-11-01'))]);

    expect(screen.getByText('Entries close Nov 1, 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit entry' })).toBeInTheDocument();
  });

  it('drops the deadline — and the edit control — once the close date has passed', () => {
    renderRows([editableRow(day('2026-01-01'))]);

    expect(screen.queryByText(/Entries close/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit entry' })).not.toBeInTheDocument();
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

  it('offers the control once the show id is known', () => {
    renderRows([calendarRow('show-flint')]);

    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
  });

  it('withholds it while the show relation is still replicating', () => {
    // The guard travels WITH the control: AddToCalendarDialog issues a
    // subscription for the id the moment it opens, so an empty showId must not
    // be reachable at all.
    renderRows([calendarRow('')]);

    expect(screen.queryByRole('button', { name: 'Add to calendar' })).not.toBeInTheDocument();
  });
});

describe('unresolved show id (Codex, PR #2198)', () => {
  it('offers no View show or Add to calendar link while the show relation is still replicating', () => {
    renderRows([futureShowRow({ id: 'e-unresolved', showId: '' })]);

    expect(screen.queryByRole('link', { name: /View show/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orders & receipts' })).toBeInTheDocument();
  });
});
