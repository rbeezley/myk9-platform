/**
 * Money and status variants of a My Shows show group (MYK9-482, task 2.5).
 *
 * Money is only allowed to speak when it needs something: exactly one strip
 * per show, no chips, and a paid confirmation that retires on Dismiss.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { render } from '@/test/utils/testUtils';
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
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
      // Two days before NOW, inside the 14-day confirmation window.
      lastUpdated: new Date('2026-10-22T12:00:00Z'),
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
