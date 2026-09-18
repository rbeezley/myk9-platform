/**
 * MYK9-631 AC4: no id fragment anywhere an exhibitor reads.
 *
 * A grep is not enough. `order.id.slice(0, 8).toUpperCase()` had FOUR producers
 * and the data layer minted one before any component saw the row, so deleting
 * the call in one file left three behind — and a later refactor could
 * reintroduce the same shape under a different expression. These tests RENDER
 * the two surfaces with an order that carries no confirmation number (the
 * exact case the fallback existed for) and assert that no 8-character
 * uppercase-hex token appears in the DOM at all.
 *
 * Each absence assertion carries a positive control on the same tree and the
 * same collector, so a test that matched nothing because the component
 * rendered nothing fails instead of passing.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import { OrdersReceiptsList } from './OrdersReceiptsList';
import type { MyEntry } from './my-entries-types';

/**
 * An 8-character run of uppercase hex, standing alone.
 *
 * `[0-9A-F]{8}` is exactly the shape `id.slice(0, 8).toUpperCase()` produces
 * for a UUID. Word boundaries keep it off longer real strings, and the class
 * and dog names below deliberately contain no such run, so a hit is the
 * fragment and nothing else.
 */
const ID_FRAGMENT = /\b[0-9A-F]{8}\b/;

/** Every text node currently in the document, plus every accessible name. */
function readableText(): string {
  const labels = Array.from(document.querySelectorAll('[aria-label]'))
    .map(node => node.getAttribute('aria-label') ?? '')
    .join(' ');
  return `${document.body.textContent ?? ''} ${labels}`;
}

/** A real UUID, so the fragment a fallback would mint is genuinely 8 hex. */
const ORDER_ID = 'a1090000-c45b-4c5b-b10c-ec4c067e6a28';

function orderWithoutConfirmation(): MyEntry {
  return {
    id: ORDER_ID,
    registrationId: null,
    showId: 'show-1',
    showName: 'Flint Hills Fall Classic',
    showDate: new Date('2026-11-14T00:00:00'),
    location: { venue: 'Expo Hall', city: 'Tulsa', state: 'Oklahoma' },
    dogName: 'Juni',
    dogId: 'dog-juni',
    classes: [
      { id: 'c-1', name: 'Interior Advanced', number: '', fee: 25, status: 'entered' },
      { id: 'c-2', name: 'Exterior Excellent', number: '', fee: 25, status: 'entered' },
    ],
    dogs: [],
    totalFee: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    // The case the deleted fallback existed for: a secretary/mail-in entry with
    // no online registration, and therefore no confirmation number at all.
    confirmationNumber: undefined,
    submittedAt: new Date('2026-09-16T12:00:00'),
    lastUpdated: new Date('2026-09-16T12:00:00'),
  } as MyEntry;
}

describe('MYK9-631 AC4 — the orders chooser names dogs and classes, never an id', () => {
  it('prints no 8-hex fragment, and does print the dog', () => {
    render(
      <OrdersReceiptsList orders={[orderWithoutConfirmation()]} mode="edit" onSelect={vi.fn()} />
    );

    // Positive control on the SAME collector: the row rendered, and it is
    // named the way MYK9-631 specifies.
    expect(readableText()).toMatch(/Juni · Interior Advanced, Exterior Excellent · entered/);
    expect(readableText()).not.toMatch(ID_FRAGMENT);
  });

  it('reads the same way to a screen reader', () => {
    render(
      <OrdersReceiptsList orders={[orderWithoutConfirmation()]} mode="receipt" onSelect={vi.fn()} />
    );

    const name = screen.getByRole('button').getAttribute('aria-label') ?? '';
    expect(name).toContain('Juni');
    expect(name).toContain('Interior Advanced');
    expect(name).not.toMatch(ID_FRAGMENT);
  });
});

describe('MYK9-631 AC4/Q7 — the receipt carries one identifier or none', () => {
  const receiptEntry = {
    id: 'ff090774-c45b-4c5b-b10c-ec4c067e6a28',
    showName: 'Flint Hills Fall Classic',
    showDate: new Date('2026-11-14T00:00:00'),
    location: { venue: 'Expo Hall', city: 'Tulsa', state: 'Oklahoma' },
    dogName: 'Juni',
    classes: [
      {
        id: 'c-1',
        name: 'Interior Advanced',
        number: '',
        fee: 25,
        status: 'entered' as const,
      },
    ],
    totalFee: 25,
    submittedAt: new Date('2026-09-16T12:00:00'),
    paymentStatus: 'Paid',
  };

  // Round 1 (K P2-3) reversed half of this case. AC4 is about id FRAGMENTS an
  // exhibitor cannot recognise; it explicitly allows the receipt to carry a
  // reference, and says the confirmation number "appears on the receipt only".
  // A cash / check / mail-in order has no confirmation number at all, and the
  // first version left that receipt — the one path reconciled BY HAND — with
  // nothing unique on it at all. So the entry id prints here, labelled, on the
  // receipt and nowhere else.
  it('falls back to a labelled Reference when there is no confirmation number', () => {
    render(<EntryReceipt open onOpenChange={vi.fn()} entry={receiptEntry} />);

    // Positive control: the document rendered and names the dog and class.
    expect(readableText()).toContain('Juni');
    expect(readableText()).toContain('Interior Advanced');

    // No minted 8-hex fragment, and no unexplained second identifier.
    expect(readableText()).not.toMatch(ID_FRAGMENT);
    expect(screen.queryByText('Confirmation #')).not.toBeInTheDocument();
    expect(screen.queryByText('Order ID')).not.toBeInTheDocument();

    // But the document IS identifiable.
    expect(screen.getByText(`Reference: ${receiptEntry.id}`)).toBeInTheDocument();
  });

  it('still prints a REAL confirmation number when the order has one', () => {
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{ ...receiptEntry, confirmationNumber: 'MK9-000145' }}
      />
    );

    expect(screen.getByText('Confirmation #')).toBeInTheDocument();
    expect(screen.getByText('MK9-000145')).toBeInTheDocument();
    // And it is not an id fragment: it is what the exhibitor was actually sent.
    expect(readableText()).not.toMatch(ID_FRAGMENT);
    // One identifier, not two: the Reference is the FALLBACK, so a receipt that
    // has a real confirmation number does not also print a raw UUID.
    expect(screen.queryByText(/^Reference:/)).not.toBeInTheDocument();
    expect(readableText()).not.toContain(receiptEntry.id);
  });
});
