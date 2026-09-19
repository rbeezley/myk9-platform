/**
 * MYK9-659: the card-derived receipt's one identifier is the ORDER's
 * confirmation number — never the enrollment's UUID.
 *
 * `enrollments.confirmation_number` is NOT NULL and `submit_show_entries`
 * always links an enrollment, so every order the app creates has a reference an
 * exhibitor and a club treasurer can both quote. Before this change the
 * component ALSO passed `entry.registrationId` as the receipt's `reference`,
 * which meant the one moment that branch could fire — the offline replica path,
 * where the confirmation number had not replicated — printed
 * `Reference: cdc232e8-6d0a-408b-8e14-2f4be11adc36` for an order that says
 * `Confirmation #: MK9-000146` online. Two identifiers for one order, and the
 * raw-UUID-as-label shape MYK9-631 Q7 removed.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CardDerivedReceipt } from './CardDerivedReceipt';
import type { MyEntry } from './my-entries-types';

const ENROLLMENT_ID = 'cdc232e8-6d0a-408b-8e14-2f4be11adc36';
const CONFIRMATION_NUMBER = 'MK9-000146';

function mailInOrder(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'ff090774-c45b-4c5b-b10c-ec4c067e6a28',
    registrationId: ENROLLMENT_ID,
    showId: 'show-1',
    showName: 'Flint Hills Fall Classic',
    showDate: new Date('2026-11-14T00:00:00'),
    location: { venue: 'Expo Hall', city: 'Tulsa', state: 'Oklahoma' },
    dogName: 'Juni',
    dogId: 'dog-juni',
    classes: [{ id: 'c-1', name: 'Interior Advanced', number: '', fee: 25, status: 'entered' }],
    dogs: [],
    totalFee: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_BY_CHECK,
    confirmationNumber: CONFIRMATION_NUMBER,
    submittedAt: new Date('2026-09-16T12:00:00'),
    lastUpdated: new Date('2026-09-16T12:00:00'),
    ...overrides,
  } as MyEntry;
}

function renderReceipt(entry: MyEntry) {
  render(
    <CardDerivedReceipt
      dialog={{ open: true, entry }}
      entry={entry}
      user={{ email: 'exhibitor@example.com' }}
      onClose={vi.fn()}
    />
  );
}

describe('MYK9-659 — the mail-in receipt prints the order reference', () => {
  it('prints the confirmation number, and only that identifier', () => {
    renderReceipt(mailInOrder());

    expect(screen.getByText(CONFIRMATION_NUMBER)).toBeInTheDocument();
    // Positive control on the same tree: the document rendered.
    expect(screen.getByText('Juni')).toBeInTheDocument();
    // One identifier, not two — and never the enrollment's UUID.
    expect(screen.queryByText(/^Reference:/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(ENROLLMENT_ID);
  });

  it('prints no reference at all when the confirmation number has not replicated', () => {
    // The offline replica path on a build or database that predates migration
    // 20260919130100. The UUID is not a reference anyone can quote, so nothing
    // prints — the pinned MYK9-631 behaviour.
    renderReceipt(mailInOrder({ confirmationNumber: undefined }));

    expect(screen.getByText('Juni')).toBeInTheDocument();
    expect(screen.queryByText(/^Reference:/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(ENROLLMENT_ID);
  });
});
