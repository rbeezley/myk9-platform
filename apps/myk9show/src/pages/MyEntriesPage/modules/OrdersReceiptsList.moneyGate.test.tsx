/**
 * MYK9-629 round 1 — the orders chooser is reached FROM the notice that says
 * amounts are hidden, and it was printing the exact figure they withheld
 * ("$45.00 · $45.00 due").
 *
 * The receipt DOCUMENT stays reachable on every source (decision (a)); this
 * list is not that document, it is a money-bearing chooser in front of it.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { OrdersReceiptsList } from './OrdersReceiptsList';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry } from './my-entries-types';

function order(id: string): MyEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    showId: 'show-1',
    showName: 'Heartland Classic',
    showDate: new Date('2099-10-10T00:00:00'),
    showEndDate: new Date('2099-10-11T00:00:00'),
    location: { venue: '', city: '', state: '' },
    dogName: 'Rex',
    dogId: 'dog-1',
    armband: undefined,
    classes: [{ id: `c-${id}`, name: 'Interior Advanced' } as MyEntry['classes'][number]],
    dogs: [],
    totalFee: 45,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    confirmationNumber: 'MK9-RANGER',
    submittedAt: new Date('2026-09-01T00:00:00'),
    lastUpdated: new Date('2026-09-02T00:00:00'),
  } as MyEntry;
}

describe('OrdersReceiptsList — money under the one gate', () => {
  it.each(['unknown'] as const)('prints no figure and no money word when %s', kind => {
    render(
      <OrdersReceiptsList
        orders={[order('a')]}
        mode="receipt"
        moneyKind={kind}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/due/i)).not.toBeInTheDocument();
    // The order itself is still listed and still selectable — the receipt is
    // reachable, only its money is withheld. MYK9-631 AC4: the row is named by
    // its dog and class, never by an id fragment or a confirmation number.
    expect(screen.getByRole('button', { name: /Rex · Interior Advanced/ })).toBeEnabled();
  });

  it('prints the figure and the money word on a confirmed balance', () => {
    render(
      <OrdersReceiptsList
        orders={[order('a')]}
        mode="receipt"
        moneyKind="balance-due"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByText(/\$45\.00 due/)).toBeInTheDocument();
  });

  // MYK9-804 findability walk (2026-09-27): a mixed order — one class paid
  // online, a sibling class still due, both on the same registration, exactly
  // Ranger's Heartland order in the reported walk — read as a bare "$X due"
  // for the WHOLE order, with no word anywhere that part of it had already
  // cleared. Receipts is the one surface `MyShowGroupCard`'s INTENT comment
  // names as reachable once the once-only paid strip retires (past show,
  // dismissed, or past its 14-day window), so an exhibitor re-verifying a
  // past payment through it saw only the due half.
  //
  // Codex review on PR #2578 (P1): the first fix derived "paid" as
  // `order.totalFee - dueCents`. A class can be excluded from `dueCents` for
  // reasons that have nothing to do with payment — withdrawn, moved — and
  // that subtraction mislabeled such a row's fee as "paid". This fixture adds
  // exactly that third row: withdrawn, excluded from `dueEntryIds`, never
  // marked paid. The naive subtraction would read $35.00 paid (65 - 30); the
  // correct figure is $20.00, the paid row alone.
  it('states both halves of a mixed order, never counting a withdrawn class as paid', () => {
    const mixed: MyEntry = {
      ...order('ranger'),
      totalFee: 65,
      classes: [
        {
          id: 'c-ranger-paid',
          name: 'Interior Advanced',
          fee: 20,
          status: 'entered',
          rawPaymentStatus: PaymentStatus.PAID_ONLINE,
        } as MyEntry['classes'][number],
        {
          id: 'c-ranger-due',
          name: 'Exterior Excellent',
          fee: 30,
          status: 'entered',
          rawPaymentStatus: PaymentStatus.PENDING,
        } as MyEntry['classes'][number],
        {
          id: 'c-ranger-withdrawn',
          name: 'Container Novice',
          fee: 15,
          status: 'withdrawn',
          rawPaymentStatus: PaymentStatus.PENDING,
        } as MyEntry['classes'][number],
      ],
      balance: {
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'credit_card',
        amountDueCents: 3000,
        onlineDueCents: 3000,
        payAtShowDueCents: 0,
        payAtShowMethod: null,
        dueEntryIds: ['c-ranger-due'],
      },
    };

    render(
      <OrdersReceiptsList
        orders={[mixed]}
        mode="receipt"
        moneyKind="balance-due"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('$65.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00 paid · $30.00 due')).toBeInTheDocument();
    // The naive `totalFee - dueCents` derivation this replaces would have
    // read $35.00 paid (65 - 30), folding the withdrawn class's $15 fee in.
    expect(screen.queryByText(/\$35\.00 paid/)).not.toBeInTheDocument();
  });

  it('still states a bare "due" for an order with no balance recorded (fully-due fallback)', () => {
    render(
      <OrdersReceiptsList
        orders={[order('a')]}
        mode="receipt"
        moneyKind="balance-due"
        onSelect={vi.fn()}
      />
    );

    // No `balance`, so `dueCents` falls back to the full order total — nothing
    // paid, and the wording must not claim otherwise.
    expect(screen.queryByText(/paid ·/)).not.toBeInTheDocument();
    expect(screen.getByText('$45.00 due')).toBeInTheDocument();
  });

  // A caller that forgets the prop must withhold, not leak. This is the whole
  // reason the default is `'unknown'` rather than `'settled'`.
  it('defaults to withholding when no money kind is passed', () => {
    render(<OrdersReceiptsList orders={[order('a')]} mode="receipt" onSelect={vi.fn()} />);

    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });
});
