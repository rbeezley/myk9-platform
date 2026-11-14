import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { SecretaryEntry } from '@/services/database/entries';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';
import { EntryFocusedRegistration } from '../EntryFocusedRegistration';
import { paidInFullDollars } from '../enrollmentPayment';
import { entryAttentionReasons } from '../showRegistrationProjection';
import { entryAmountOwed } from '@/utils/entryAmountOwed';

vi.mock('@/features/messages/hooks/useCanSendTargetedShowMessages', () => ({
  useCanSendTargetedShowMessages: () => false,
}));

/**
 * MYK9-1961, the owner's two decisions (2026-11-13), on every figure the entry form shows:
 * the footer, the checklist, the add-on's own row and the Paid in Full quote. The rows are
 * the database rows as the server leaves them (migration 20261114013900; the server half is
 * supabase/tests/myk9_1961_refunded_fee_not_owed_test.sql), read through the page's own
 * mapper, so this is the form the secretary sees.
 */
type Registration = NonNullable<SecretaryEntry['registration']>;

function form(money: Partial<Registration>): Registration {
  return {
    id: 'enr-1961',
    confirmation_number: 'MYK9-1961',
    payment_status: 'pending',
    payment_reference: null,
    total_amount: 0,
    paid_amount: 0,
    card_covered_cents: 0,
    refund_amount: null,
    refund_notes: null,
    refunded_at: null,
    ...money,
  };
}

function row(
  id: string,
  callName: string,
  paymentStatus: string,
  fee: number,
  registration: Registration
) {
  return mapSecretaryEntryToEntryManagementEntry({
    id,
    show_id: 'show-1961',
    dog_id: `dog-${id}`,
    class_id: `class-${id}`,
    registration_id: registration.id,
    entry_status: 'accepted',
    payment_status: paymentStatus,
    payment_method: 'cash',
    entry_fee: fee,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-13T00:00:00Z',
    dog: { call_name: callName, name: null, owner: null },
    registration,
  } as unknown as SecretaryEntry);
}

function renderForm(entries: ReturnType<typeof row>[]) {
  const registration = groupEntriesByShowRegistration(entries)[0]!;
  render(
    <EntryFocusedRegistration
      registration={registration}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      onBulkStatusChange={vi.fn()}
      paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-11-13' }}
      showCheckInStatus={false}
    />
  );
  return registration;
}

/** The money line of one entry's own row on the form, found by its dog's name. */
function rowMoney(dogName: string) {
  const name = screen.getByText(dogName, { selector: 'span.font-semibold' });
  const card = name.parentElement?.parentElement;
  expect(card).toBeTruthy();
  return within(card as HTMLElement).getByText(/^Fee: /).textContent;
}

/** What the Paid in Full dialog says it will record ("Balance due"). */
function paidInFullQuote() {
  fireEvent.click(screen.getByRole('button', { name: 'Change payment' }));
  fireEvent.click(screen.getByText('Paid in Full: Cash…'));
  return within(screen.getByRole('dialog')).getByText(/^\$\d/).textContent;
}

describe('owner case 1: money still held covers a later add-on (MYK9-1961)', () => {
  // $50 paid, $10 refunded at the desk ($40 held), then a $30 class. The server settles the
  // add-on with the held money: the form is 'paid', the add-on 'paid', the two refunded.
  const held = form({
    payment_status: 'paid',
    total_amount: 3000,
    paid_amount: 50,
    refund_amount: 10,
  });
  const entries = () => [
    row('b1', 'Bravo', 'refunded', 25, held),
    row('b2', 'Comet', 'refunded', 25, held),
    row('b3', 'Addie', 'paid', 30, held),
  ];

  it('reads Paid in full in the footer', () => {
    renderForm(entries());
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Paid in full');
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent(/due/);
  });

  it('lists no payment item, never "Entries still marked unpaid"', () => {
    renderForm(entries());
    expect(screen.queryByText('Entries still marked unpaid')).toBeNull();
    expect(screen.queryByText(/\$\d+\.\d{2} due/)).toBeNull();
  });

  it("shows the add-on's own row as paid, not $30 owed", () => {
    const registration = renderForm(entries());
    expect(rowMoney('Addie')).toBe('Fee: $30 (Paid: $30)');
    const addOn = registration.entries.find(entry => entry.id === 'b3')!;
    expect(entryAmountOwed(addOn)).toBe(0);
    expect(entryAttentionReasons(addOn)).not.toContain('payment_due');
  });

  it('quotes $0.00 for Paid in Full', () => {
    const registration = renderForm(entries());
    expect(paidInFullDollars(registration)).toBe(0);
    expect(paidInFullQuote()).toBe('$0.00');
  });
});

describe('owner case 2: a payment covers only what it is for (MYK9-1961)', () => {
  // $50 paid, all of it refunded, then a $30 class. The form owes the add-on and nothing else.
  const refunded = form({
    payment_status: 'pending',
    total_amount: 3000,
    paid_amount: 50,
    refund_amount: 50,
  });
  const entries = () => [
    row('f1', 'Bravo', 'refunded', 25, refunded),
    row('f2', 'Comet', 'refunded', 25, refunded),
    row('f3', 'Addie', 'pending', 30, refunded),
  ];

  it('reads $30.00 due in the footer', () => {
    renderForm(entries());
    expect(screen.getByRole('contentinfo')).toHaveTextContent('$30.00 due');
  });

  it('lists $30.00 due on the checklist', () => {
    renderForm(entries());
    expect(screen.getByText('1 of 3 entries unpaid')).toBeInTheDocument();
    expect(screen.queryByText('Entries still marked unpaid')).toBeNull();
  });

  it("shows the add-on's own row owing $30, and the refunded rows owing nothing", () => {
    const registration = renderForm(entries());
    expect(rowMoney('Addie')).toBe('Fee: $30 (Paid: $0)');
    const owed = Object.fromEntries(
      registration.entries.map(entry => [entry.id, entryAmountOwed(entry)])
    );
    expect(owed).toEqual({ f1: 0, f2: 0, f3: 30 });
  });

  it('quotes $30.00 for Paid in Full: the refunded entries are never charged again', () => {
    const registration = renderForm(entries());
    expect(paidInFullDollars(registration)).toBe(30);
    expect(paidInFullQuote()).toBe('$30.00');
  });

  it('reads Paid in full once $30 is recorded, the refunded entries still refunded', () => {
    // What the server leaves after Paid in Full or a $30 payment by amount (test 9b / 9c).
    const paid = form({
      payment_status: 'paid_by_cash',
      total_amount: 3000,
      paid_amount: 80,
      refund_amount: 50,
    });
    const registration = renderForm([
      row('f1', 'Bravo', 'refunded', 25, paid),
      row('f2', 'Comet', 'refunded', 25, paid),
      row('f3', 'Addie', 'paid', 30, paid),
    ]);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Paid in full');
    expect(screen.queryByText('Entries still marked unpaid')).toBeNull();
    expect(rowMoney('Addie')).toBe('Fee: $30 (Paid: $30)');
    expect(registration.entries.map(entry => entry.rawPaymentStatus)).toEqual([
      'refunded',
      'refunded',
      'paid',
    ]);
    expect(paidInFullDollars(registration)).toBe(0);
  });
});
