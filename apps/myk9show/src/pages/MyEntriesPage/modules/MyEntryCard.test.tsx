import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyEntryCard } from './MyEntryCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry, MyEntryDogGroup, EntryClass } from './my-entries-types';
import { PENDING_REVIEW_REASSURANCE } from './myShowsCopy';

/** Expand the collapsed "Show details" panel so its contents are queryable. */
function openDetails() {
  fireEvent.click(screen.getByRole('button', { name: /show details/i }));
}

/**
 * Builds a single-dog order. `dogs` defaults to one group mirroring the
 * top-level dog/class fields so single-dog rendering — the vast majority of
 * these cases — exercises the exact same code path as before grouped-order
 * cards existed. Pass `dogs` explicitly to build a multi-dog order.
 */
function makeEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  const { dogs, ...rest } = overrides;
  const base = {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Test Show',
    showDate: new Date('2026-09-01'),
    location: { venue: 'Test Venue', city: 'Denver', state: 'CO' },
    dogName: 'Rex',
    dogId: 'd1',
    classes: [],
    totalFee: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-08-01'),
    lastUpdated: new Date('2026-08-15'),
    ...rest,
  };
  return {
    ...base,
    dogs: dogs ?? [
      {
        id: base.id,
        dogId: base.dogId,
        dogName: base.dogName,
        armband: base.armband,
        classes: base.classes,
        entryStatus: base.entryStatus,
      },
    ],
  };
}

function makeDogGroup(overrides: Partial<MyEntryDogGroup> = {}): MyEntryDogGroup {
  return {
    id: 'e1',
    dogId: 'd1',
    dogName: 'Rex',
    classes: [],
    entryStatus: EntryStatus.ACCEPTED,
    ...overrides,
  };
}

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    name: 'Container Search',
    number: '101',
    fee: 25,
    status: 'entered',
    ...overrides,
  };
}

function renderCard(entry: MyEntry) {
  return render(
    <MemoryRouter>
      <MyEntryCard
        entry={entry}
        onCheckInClick={vi.fn()}
        onEditClick={vi.fn()}
        onReceiptClick={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('MyEntryCard current status summary', () => {
  it('does not render the four-step lifecycle strip for an accepted paid online entry', () => {
    const { container } = renderCard(makeEntry({ paymentStatus: PaymentStatus.PAID_ONLINE }));
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Test Show')).toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('does not render the four-step lifecycle strip when the entry is accepted and paid by check', () => {
    const { container } = renderCard(makeEntry({ paymentStatus: PaymentStatus.PAID_BY_CHECK }));
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
  });

  it('does not render the four-step lifecycle strip when the entry is accepted and paid by cash', () => {
    const { container } = renderCard(makeEntry({ paymentStatus: PaymentStatus.PAID_BY_CASH }));
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
  });

  it('uses direct status labels for pending payment without numbered lifecycle steps', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.ACCEPTED, paymentStatus: PaymentStatus.PENDING })
    );
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Payment Due')).toBeInTheDocument();
    expect(screen.queryByText('Submitted')).not.toBeInTheDocument();
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
  });

  it('uses direct status labels for pending review and payment due', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.PENDING, paymentStatus: PaymentStatus.PENDING })
    );
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
    expect(screen.getByText('Pending Secretary Approval')).toBeInTheDocument();
    expect(screen.getByText('Payment Due')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Finish Payment/i })).toHaveAttribute(
      'href',
      '/cart?showId=s1&entryIds=e1'
    );
  });

  it('uses the preserved day-of kind instead of pending copy', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.PENDING, entryStatusKind: 'in_ring' })
    );

    expect(screen.getByText('In Ring')).toBeInTheDocument();
    expect(screen.queryByText(/Pending/i)).not.toBeInTheDocument();
    expect(screen.queryByText(PENDING_REVIEW_REASSURANCE)).not.toBeInTheDocument();
    expect(container.querySelector('[data-status="in_ring"]')).toBeInTheDocument();
  });

  it('does not render the four-step lifecycle strip for a waitlisted entry', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.WAITLIST, paymentStatus: PaymentStatus.PENDING })
    );
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
    expect(screen.getByText('Waitlist')).toBeInTheDocument();
  });

  it('does not render the four-step lifecycle strip for a rejected entry', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.REJECTED, paymentStatus: PaymentStatus.PENDING })
    );
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });
});

describe('MyEntryCard payment recovery', () => {
  it('shows a Finish Payment action for pending paid-fee entries', () => {
    renderCard(
      makeEntry({
        showId: 'show-1',
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 85,
        classes: [makeClass({ id: 'entry-1' }), makeClass({ id: 'entry-2' })],
      })
    );

    expect(screen.getByRole('link', { name: /Finish Payment/i })).toHaveAttribute(
      'href',
      '/cart?showId=show-1&entryIds=entry-1%2Centry-2'
    );
  });

  it('offers a waiting affordance, not a cart, while the show relation is unreplicated', () => {
    // showId '' — no cart can name a show yet, but the exhibitor still owes
    // money, so the card must not go silent. This one resolves on its own.
    renderCard(
      makeEntry({
        showId: '',
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 85,
        classes: [makeClass({ id: 'entry-1' })],
      })
    );

    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Payment options loading/i })).toBeDisabled();
  });

  it('points at the secretary when the online balance can never resolve to a cart', () => {
    // Online-payable at the order level, but every replicated class row is
    // pay-at-show: a data inconsistency, not a timing window, so promising a
    // spinner would be a lie.
    renderCard(
      makeEntry({
        showId: 'show-1',
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'online',
        totalFee: 85,
        classes: [
          makeClass({ id: 'entry-1', paymentStatus: PaymentStatus.PENDING, paymentMethod: 'cash' }),
        ],
      })
    );

    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Contact the show secretary/i })).toBeDisabled();
  });

  it('does not show Finish Payment for paid entries', () => {
    renderCard(makeEntry({ paymentStatus: PaymentStatus.PAID_ONLINE, totalFee: 85 }));

    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
  });

  it('does not show Finish Payment for terminal pending-payment entries', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.REJECTED,
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 85,
      })
    );

    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
  });

  it('shows Finish Payment for an unpaid move-up request (payment split from edit eligibility)', () => {
    renderCard(
      makeEntry({
        showId: 'show-1',
        entryStatus: EntryStatus.MOVE_UP_REQUESTED,
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 30,
        classes: [makeClass({ id: 'entry-9' })],
      })
    );

    expect(screen.getByRole('link', { name: /Finish Payment/i })).toBeInTheDocument();
    // ...but a move-up request is NOT editable while awaiting approval.
    expect(screen.queryByRole('button', { name: /Edit Entry/i })).not.toBeInTheDocument();
  });

  it('does not show Finish Payment for an unpaid waitlisted entry (pay on promotion)', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.WAITLIST,
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 30,
      })
    );

    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
  });

  // exhibitor-money-clarity: the "Payment Due" chip must agree with the
  // dashboard/My Payments amount-due figure (both derive from
  // getEntryPaymentPrompt via summarizeEntryBalances). A raw PENDING
  // paymentStatus with no actionable online balance previously rendered
  // "Payment Due" anyway, contradicting a $0/"Paid in full" summary elsewhere.
  it('does not show Payment Due for a rejected entry with no actionable balance', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.REJECTED,
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 85,
      })
    );

    expect(screen.queryByText('Payment Due')).not.toBeInTheDocument();
  });

  it('does not show Payment Due for a waitlisted entry (pays on promotion, no debt yet)', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.WAITLIST,
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 30,
      })
    );

    expect(screen.queryByText('Payment Due')).not.toBeInTheDocument();
  });

  it('does not show Payment Due for a zero-fee entry (nothing is actually owed)', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 0,
      })
    );

    expect(screen.queryByText('Payment Due')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
  });
});

describe('MyEntryCard — cash/check is a status, not a debt (4.C)', () => {
  it('shows a calm "pay at show" status for a pending CASH entry — no Finish Payment, no Payment Due chip', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'cash',
        totalFee: 30,
      })
    );

    expect(screen.getByText('Bring $30.00 cash to check-in')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Payment Due')).not.toBeInTheDocument();
  });

  it('shows a "mail your check" status for a pending CHECK entry', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'check',
        totalFee: 30,
      })
    );

    expect(screen.getByText('Mail your $30.00 check to the club')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
  });

  it('still shows Finish Payment for a pending ONLINE entry', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'online',
        totalFee: 30,
      })
    );

    expect(screen.getByRole('link', { name: /Finish Payment/i })).toBeInTheDocument();
    expect(screen.queryByText(/cash to check-in/i)).not.toBeInTheDocument();
  });

  // Payment eligibility must be derived per class ROW, not the order's
  // dominant entryStatus — a completed sibling class can otherwise dominate
  // the order to COMPLETED and silently suppress a still-owed accepted
  // sibling's pay-at-show instruction, even though the balance/My Payments
  // still report that amount due.
  it('still shows a pay-at-show prompt for an accepted cash class when a completed sibling dominates the order status', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.COMPLETED,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'cash',
        totalFee: 30,
        classes: [
          makeClass({ id: 'completed-1', entryStatus: EntryStatus.COMPLETED, isScored: true }),
          makeClass({ id: 'accepted-1', entryStatus: EntryStatus.ACCEPTED, isScored: false }),
        ],
      })
    );

    expect(screen.getByText('Bring $30.00 cash to check-in')).toBeInTheDocument();
  });
});

describe('MyEntryCard history status clarity', () => {
  it('uses past-show labels for unresolved history cards instead of active workflow labels', () => {
    renderCard(
      makeEntry({
        showDate: new Date('2020-05-01T00:00:00'),
        showEndDate: new Date('2020-05-02T00:00:00'),
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 85,
      })
    );

    expect(screen.getByText('Review incomplete')).toBeInTheDocument();
    expect(screen.getByText('Payment unresolved')).toBeInTheDocument();
    expect(screen.queryByText('Pending Secretary Approval')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment Due')).not.toBeInTheDocument();
  });
});

describe('MyEntryCard placement — edge cases (beyond the #775 "scored result display" suite)', () => {
  it('shows the participation rank beyond 4th (intentionally not capped) for a qualifying entry', () => {
    // Only 1st–4th get official ribbons, but exhibitors still want to see where they
    // came in, so the rank renders for every qualifier (5th, 6th, …).
    renderCard(
      makeEntry({
        classes: [makeClass({ isScored: true, resultStatus: 'qualified', finalPlacement: 5 })],
      })
    );
    openDetails();

    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('5th')).toBeInTheDocument();
  });

  it('omits placement for the 0 default (un-ranked row) rather than rendering "0th"', () => {
    renderCard(
      makeEntry({
        classes: [makeClass({ isScored: true, resultStatus: 'qualified', finalPlacement: 0 })],
      })
    );
    openDetails();

    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.queryByText('0th')).not.toBeInTheDocument();
  });
});

describe('MyEntryCard post-deadline recovery', () => {
  it('links post-deadline blocked edits to the existing message route', () => {
    renderCard(
      makeEntry({
        showId: 'show-1',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        entryCloseDate: new Date('2026-01-01T00:00:00Z'),
      })
    );
    openDetails();

    expect(screen.getByRole('link', { name: /Message the show team/i })).toHaveAttribute(
      'href',
      '/messages/show-1'
    );
  });
});

describe('MyEntryCard result reveal prompt', () => {
  it('shows a New result button for a newly released qualifying result', () => {
    const onResultRevealClick = vi.fn();
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeEntry({
            classes: [
              makeClass({
                id: 'entry-1',
                isScored: true,
                resultStatus: 'qualified',
                finalPlacement: 1,
                resultsReleasedAt: '2026-09-14T20:00:00.000Z',
              }),
            ],
          })}
          onCheckInClick={vi.fn()}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
          onResultRevealClick={onResultRevealClick}
          seenResultReleaseKeys={new Set()}
        />
      </MemoryRouter>
    );
    openDetails();

    const resultButton = screen.getByRole('button', { name: /New result/i });
    expect(resultButton).toBeInTheDocument();
    expect(resultButton).toHaveClass('min-h-[44px]', 'w-full', 'sm:w-auto');
    expect(screen.getByText('Container Search #101')).toHaveClass('myk9-entries-class-name');
    expect(screen.getByText('Container Search #101')).toHaveAttribute(
      'title',
      'Container Search #101'
    );
  });

  it('shows a quieter Result card button after the reveal has been seen', () => {
    const onResultRevealClick = vi.fn();
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeEntry({
            classes: [
              makeClass({
                id: 'entry-1',
                isScored: true,
                resultStatus: 'qualified',
                finalPlacement: 1,
                resultsReleasedAt: '2026-09-14T20:00:00.000Z',
              }),
            ],
          })}
          onCheckInClick={vi.fn()}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
          onResultRevealClick={onResultRevealClick}
          seenResultReleaseKeys={new Set(['entry-1:2026-09-14T20:00:00.000Z:qualified:1'])}
        />
      </MemoryRouter>
    );
    openDetails();

    expect(screen.queryByRole('button', { name: /New result/i })).not.toBeInTheDocument();
    const resultCardButton = screen.getByRole('button', { name: /Result card/i });
    expect(resultCardButton).toBeInTheDocument();
    resultCardButton.click();
    expect(onResultRevealClick).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'entry-1' })
    );
  });

  it('does not show New result for non-qualifying results', () => {
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeEntry({
            classes: [
              makeClass({
                id: 'entry-1',
                isScored: true,
                resultStatus: 'nq',
                resultsReleasedAt: '2026-09-14T20:00:00.000Z',
              }),
            ],
          })}
          onCheckInClick={vi.fn()}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
          onResultRevealClick={vi.fn()}
          seenResultReleaseKeys={new Set()}
        />
      </MemoryRouter>
    );
    openDetails();

    expect(screen.queryByRole('button', { name: /New result/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Result card/i })).not.toBeInTheDocument();
  });
});

describe('MyEntryCard scored result display', () => {
  it('shows the placement pill for a placed qualifying entry alongside Q and search time', () => {
    renderCard(
      makeEntry({
        classes: [
          makeClass({
            isScored: true,
            resultStatus: 'qualified',
            finalPlacement: 2,
            searchTimeSeconds: 42.5,
          }),
        ],
      })
    );
    openDetails();

    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('42.5s')).toBeInTheDocument();
  });

  it('does not show a placement pill for an NQ entry even if a placement value leaks through', () => {
    renderCard(
      makeEntry({
        classes: [
          makeClass({
            isScored: true,
            resultStatus: 'nq',
            finalPlacement: 2,
            searchTimeSeconds: 50,
          }),
        ],
      })
    );
    openDetails();

    expect(screen.getByText('NQ')).toBeInTheDocument();
    expect(screen.queryByText('2nd')).not.toBeInTheDocument();
  });

  it('does not show a placement pill for a qualifying entry before the class is ranked (null placement)', () => {
    renderCard(
      makeEntry({
        classes: [
          makeClass({
            isScored: true,
            resultStatus: 'qualified',
            finalPlacement: undefined,
            searchTimeSeconds: 42.5,
          }),
        ],
      })
    );
    openDetails();

    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.queryByText(/\d(st|nd|rd|th)$/)).not.toBeInTheDocument();
  });
});

describe('MyEntryCard confirmation number fallback (P1-04w-1)', () => {
  it('shows "Pending" fallback for an active entry with no confirmation number', () => {
    renderCard(makeEntry({ confirmationNumber: undefined, entryStatus: EntryStatus.PENDING }));
    openDetails();
    expect(screen.getByText(/Confirmation # Pending/)).toBeInTheDocument();
  });

  it('shows "—" fallback for a withdrawn entry with no confirmation number', () => {
    renderCard(makeEntry({ confirmationNumber: undefined, entryStatus: EntryStatus.CANCELLED }));
    openDetails();
    expect(screen.getByText(/Confirmation # —/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirmation # Pending/)).not.toBeInTheDocument();
  });

  it('shows "—" fallback for a scratched entry with no confirmation number', () => {
    renderCard(makeEntry({ confirmationNumber: undefined, entryStatus: EntryStatus.SCRATCHED }));
    openDetails();
    expect(screen.getByText(/Confirmation # —/)).toBeInTheDocument();
  });

  it('always shows the enrollment confirmation number when present, regardless of status', () => {
    renderCard(makeEntry({ confirmationNumber: 'MK9-12345', entryStatus: EntryStatus.CANCELLED }));
    openDetails();
    expect(screen.getByText(/Confirmation # MK9-12345/)).toBeInTheDocument();
    expect(screen.queryByText(/Registration #/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Entry #/)).not.toBeInTheDocument();
  });
});

describe('MyEntryCard run order link', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the run order link for an upcoming accepted entry with run orders assigned', () => {
    renderCard(
      makeEntry({
        showId: 'show-1',
        showDate: new Date('2026-09-01'),
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [makeClass({ runOrder: 3 })],
      })
    );
    openDetails();

    expect(screen.getByRole('link', { name: /View run order/i })).toHaveAttribute(
      'href',
      '/shows/show-1?tab=classes'
    );
  });

  it('shows the run order link for an upcoming move-up-requested entry with run orders assigned', () => {
    renderCard(
      makeEntry({
        showId: 'show-2',
        showDate: new Date('2026-09-01'),
        entryStatus: EntryStatus.MOVE_UP_REQUESTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [makeClass({ runOrder: 7 })],
      })
    );
    openDetails();

    expect(screen.getByRole('link', { name: /View run order/i })).toHaveAttribute(
      'href',
      '/shows/show-2?tab=classes'
    );
  });

  it('does not show the run order link when no class has a run order assigned', () => {
    renderCard(
      makeEntry({
        showDate: new Date('2026-09-01'),
        entryStatus: EntryStatus.ACCEPTED,
        classes: [makeClass({ runOrder: undefined })],
      })
    );
    openDetails();

    expect(screen.queryByRole('link', { name: /View run order/i })).not.toBeInTheDocument();
  });

  it('does not show the run order link for a pending entry (no confirmed spot yet)', () => {
    renderCard(
      makeEntry({
        showDate: new Date('2026-09-01'),
        entryStatus: EntryStatus.PENDING,
        classes: [makeClass({ runOrder: 5 })],
      })
    );
    openDetails();

    expect(screen.queryByRole('link', { name: /View run order/i })).not.toBeInTheDocument();
  });

  it('does not show the run order link for a past show', () => {
    renderCard(
      makeEntry({
        showDate: new Date('2020-01-01'),
        showEndDate: new Date('2020-01-02'),
        entryStatus: EntryStatus.ACCEPTED,
        classes: [makeClass({ runOrder: 2 })],
      })
    );
    openDetails();

    expect(screen.queryByRole('link', { name: /View run order/i })).not.toBeInTheDocument();
  });
});

describe('MyEntryCard handler display', () => {
  it('shows handler name when a class has a handler set', () => {
    const entry = makeEntry({
      classes: [makeClass({ handler: 'Sarah M.' })],
    });
    renderCard(entry);
    openDetails();
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });

  it('shows no handler line when handler is not set', () => {
    const entry = makeEntry({
      classes: [makeClass({ handler: undefined })],
    });
    renderCard(entry);
    openDetails();
    expect(screen.queryByText('Sarah M.')).not.toBeInTheDocument();
  });

  it('shows different handlers for different classes in a grouped card', () => {
    const entry = makeEntry({
      classes: [
        makeClass({ id: 'c1', name: 'Container Search', handler: 'R. Beezley' }),
        makeClass({ id: 'c2', name: 'Exterior Search', handler: 'Sarah M.' }),
      ],
    });
    renderCard(entry);
    openDetails();
    expect(screen.getByText('R. Beezley')).toBeInTheDocument();
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });
});

describe('MyEntryCard run order link', () => {
  it('shows a "View run order" link when at least one class has a runOrder assigned', () => {
    renderCard(
      makeEntry({
        showId: 'show-1',
        classes: [makeClass({ runOrder: 3 }), makeClass({ id: 'c2', runOrder: undefined })],
      })
    );
    openDetails();

    expect(screen.getByRole('link', { name: /View run order/i })).toHaveAttribute(
      'href',
      '/shows/show-1?tab=classes'
    );
  });

  it('hides the "View run order" link when no class has a runOrder', () => {
    renderCard(
      makeEntry({
        showId: 'show-1',
        classes: [makeClass({ runOrder: undefined })],
      })
    );
    openDetails();

    expect(screen.queryByRole('link', { name: /View run order/i })).not.toBeInTheDocument();
  });
});

describe('MyEntryCard class detail display', () => {
  it('shows the dog armband before the dog name', () => {
    const { container } = renderCard(makeEntry({ armband: '142' }));

    const subtitle = container.querySelector('.myk9-entries-card-subtitle');
    expect(subtitle).not.toBeNull();
    expect(subtitle).toHaveTextContent('142');
    expect(subtitle).toHaveTextContent('Rex');

    const subtitleText = subtitle?.textContent ?? '';
    expect(subtitleText.indexOf('142')).toBeLessThan(subtitleText.indexOf('Rex'));
  });

  it('shows trial date and trial number on class cards without the class fee amount', () => {
    renderCard(
      makeEntry({
        classes: [
          makeClass({
            fee: 25,
            trialDate: new Date('2026-09-02T00:00:00'),
            trialNumber: '2',
          }),
        ],
      })
    );
    openDetails();

    expect(screen.getByText('Sep 2')).toBeInTheDocument();
    expect(screen.getByText('Trial 2')).toBeInTheDocument();
    expect(screen.queryByText('$25')).not.toBeInTheDocument();
  });

  it('renders multiple entered classes as compact rows with class context and check-in controls', () => {
    const { container } = renderCard(
      makeEntry({
        classes: [
          makeClass({
            id: 'c1',
            classId: 'class-1',
            name: 'Container Search',
            trialDate: new Date('2026-09-01T00:00:00'),
            trialNumber: '1',
          }),
          makeClass({
            id: 'c2',
            classId: 'class-2',
            name: 'Exterior Search',
            trialDate: new Date('2026-09-02T00:00:00'),
            trialNumber: '2',
          }),
          makeClass({
            id: 'c3',
            classId: 'class-3',
            name: 'Buried Search',
            trialDate: new Date('2026-09-03T00:00:00'),
            trialNumber: '3',
          }),
        ],
      })
    );
    openDetails();

    expect(container.querySelectorAll('.myk9-entries-class-row')).toHaveLength(3);
    expect(container.querySelector('.myk9-entries-classes-grid')).not.toBeInTheDocument();
    expect(screen.getByText('Container Search #101')).toBeInTheDocument();
    expect(screen.getByText('Exterior Search #101')).toBeInTheDocument();
    expect(screen.getByText('Buried Search #101')).toBeInTheDocument();
    expect(screen.getByText('Sep 1')).toBeInTheDocument();
    expect(screen.getByText('Trial 3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Update check-in for Rex in Container Search/i })
    ).toHaveClass('min-h-[44px]');
  });

  it('keeps long class names in a stable row without hiding the status control', () => {
    const longClassName =
      'Excellent Master Detective Container Search With An Extraordinarily Long Name';

    const { container } = renderCard(
      makeEntry({
        classes: [makeClass({ name: longClassName, jumpHeight: '24 in' })],
      })
    );
    openDetails();

    const className = screen.getByText(`${longClassName} #101 (24 in)`);
    expect(className).toHaveClass('myk9-entries-class-name');
    expect(className).toHaveAttribute('title', `${longClassName} #101 (24 in)`);
    expect(container.querySelector('.myk9-entries-class-row')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: new RegExp(`Update check-in for Rex in ${longClassName}`),
      })
    ).toBeInTheDocument();
  });
});

describe('MyEntryCard self-check-in gating', () => {
  function renderWithMap(entry: MyEntry, map: Record<string, boolean>, onCheckInClick = vi.fn()) {
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={entry}
          selfCheckinByClassId={map}
          onCheckInClick={onCheckInClick}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
        />
      </MemoryRouter>
    );
    return onCheckInClick;
  }

  const unscored = makeClass({ id: 'entry-1', classId: 'class-1', checkInStatus: 'no-status' });

  it('renders an interactive check-in control when self-check-in is enabled', () => {
    const onCheckInClick = renderWithMap(makeEntry({ classes: [unscored] }), { 'class-1': true });
    openDetails();
    const btn = screen.getByRole('button', {
      name: /update check-in for rex in container search/i,
    });
    fireEvent.click(btn);
    expect(onCheckInClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to enabled when the class id is missing from the map', () => {
    renderWithMap(makeEntry({ classes: [unscored] }), {});
    openDetails();
    expect(
      screen.getByRole('button', { name: /update check-in for rex in container search/i })
    ).toBeInTheDocument();
  });

  it('disables the check-in control with a reason when self-check-in is off', () => {
    const onCheckInClick = renderWithMap(makeEntry({ classes: [unscored] }), { 'class-1': false });
    openDetails();
    // No interactive button…
    expect(
      screen.queryByRole('button', { name: /update check-in for rex in container search/i })
    ).not.toBeInTheDocument();
    // …a non-interactive indicator with an explanatory label instead.
    expect(screen.getByLabelText('Self check-in not available')).toBeInTheDocument();
    expect(onCheckInClick).not.toHaveBeenCalled();
  });

  it('disables check-in for an unresolved placeholder row even with no class id in the map', () => {
    // classId is undefined here for the SAME reason the map is empty — the
    // class join hasn't replicated. `unresolved` must win over the "missing
    // class id defaults to enabled" rule, or a fake "Unknown Class" row gets
    // a tappable check-in control before it's real.
    const placeholder = makeClass({
      id: 'entry-1',
      classId: undefined,
      unresolved: true,
      name: 'Unknown Class',
      checkInStatus: 'no-status',
    });
    const onCheckInClick = renderWithMap(makeEntry({ classes: [placeholder] }), {});
    openDetails();

    expect(
      screen.queryByRole('button', { name: /update check-in for rex in unknown class/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Self check-in not available')).toBeInTheDocument();
    expect(onCheckInClick).not.toHaveBeenCalled();
  });

  it('does not render check-in for a completed-kind class with a legacy accepted status', () => {
    const completedKindClass = makeClass({
      id: 'entry-1',
      classId: 'class-1',
      entryStatus: EntryStatus.ACCEPTED,
      entryStatusKind: 'completed',
      isScored: false,
    });
    renderWithMap(
      makeEntry({
        entryStatus: EntryStatus.ACCEPTED,
        entryStatusKind: 'completed',
        classes: [completedKindClass],
      }),
      { 'class-1': true }
    );
    openDetails();

    expect(
      screen.queryByRole('button', { name: /update check-in for rex in container search/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Self check-in not available')).not.toBeInTheDocument();
  });
});

describe('MyEntryCard progressive disclosure (exhibitor-my-shows-elderly-ux-remediation 3.1-3.5)', () => {
  it('collapses the details panel by default on render — class rows and confirmation number are not in the document', () => {
    renderCard(
      makeEntry({
        confirmationNumber: 'MK9-99999',
        classes: [makeClass({ name: 'Container Search' })],
      })
    );

    const toggle = screen.getByRole('button', { name: /show details/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Container Search #101')).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirmation # MK9-99999/)).not.toBeInTheDocument();
  });

  it('expands the details panel on toggle click and flips aria-expanded', () => {
    renderCard(
      makeEntry({
        confirmationNumber: 'MK9-99999',
        classes: [makeClass({ name: 'Container Search' })],
      })
    );

    const toggle = screen.getByRole('button', { name: /show details/i });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Container Search #101')).toBeInTheDocument();
    expect(screen.getByText(/Confirmation # MK9-99999/)).toBeInTheDocument();

    // Toggling again collapses it — details drop back out of the document.
    fireEvent.click(screen.getByRole('button', { name: /hide details/i }));
    expect(screen.queryByText('Container Search #101')).not.toBeInTheDocument();
  });

  it('shows Finish Payment as the next action for an unpaid, still-payable entry', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'online',
        totalFee: 50,
        classes: [makeClass({ id: 'entry-1' })],
      })
    );

    expect(screen.getByRole('link', { name: /Finish Payment/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check In' })).not.toBeInTheDocument();
  });

  it('shows Check In as the next action for a paid entry with an eligible unscored class', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: false })],
      })
    );

    expect(screen.getByRole('button', { name: 'Check In' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
  });

  it('falls back to View Show as the next action when paid with no check-in-eligible class', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        classes: [makeClass({ id: 'entry-1', classId: 'class-1', isScored: true })],
      })
    );

    expect(screen.getByRole('link', { name: /^View Show$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check In' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
  });

  it('summary-band Check In calls the exact same handler with the same args as the per-class details control', () => {
    const onCheckInClick = vi.fn();
    const cls = makeClass({ id: 'entry-1', classId: 'class-1', isScored: false });
    const entry = makeEntry({
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      classes: [cls],
    });
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={entry}
          onCheckInClick={onCheckInClick}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check In' }));
    expect(onCheckInClick).toHaveBeenCalledWith(entry, cls);

    openDetails();
    onCheckInClick.mockClear();
    fireEvent.click(
      screen.getByRole('button', { name: /Update check-in for Rex in Container Search/i })
    );
    expect(onCheckInClick).toHaveBeenCalledWith(entry, cls);
  });

  it('shows "Entries close" in the summary band while editing is still possible', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.ACCEPTED,
        entryCloseDate: new Date('2099-01-01T00:00:00Z'),
      })
    );

    expect(screen.getByText('Entries close')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument();
  });

  it('moves "Entries close" into details once editing is no longer possible', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.ACCEPTED,
        entryCloseDate: new Date('2020-01-01T00:00:00Z'),
      })
    );

    expect(screen.queryByText('Entries close')).not.toBeInTheDocument();
    openDetails();
    expect(screen.getByText('Entries close')).toBeInTheDocument();
  });

  it('shows the pending-review reassurance line on the summary band', () => {
    renderCard(
      makeEntry({ entryStatus: EntryStatus.PENDING, paymentStatus: PaymentStatus.PENDING })
    );

    expect(screen.getByText(PENDING_REVIEW_REASSURANCE)).toBeInTheDocument();
  });

  it('does not show the pending-review reassurance line for a non-pending entry', () => {
    renderCard(
      makeEntry({ entryStatus: EntryStatus.ACCEPTED, paymentStatus: PaymentStatus.PAID_ONLINE })
    );

    expect(screen.queryByText(PENDING_REVIEW_REASSURANCE)).not.toBeInTheDocument();
  });
});

describe('MyEntryCard grouped-order dogs grid (task 8.2 — one card per online order)', () => {
  function makeTwoDogEntry(overrides: Partial<MyEntry> = {}): MyEntry {
    const rexClasses = [
      makeClass({
        id: 'entry-rex-1',
        classId: 'class-1',
        name: 'Container Search',
        isScored: true,
      }),
    ];
    const zivaClasses = [
      makeClass({
        id: 'entry-ziva-1',
        classId: 'class-2',
        name: 'Exterior Search',
        isScored: false,
      }),
    ];
    const dogs: MyEntryDogGroup[] = [
      makeDogGroup({
        id: 'entry-rex-1',
        dogId: 'd1',
        dogName: 'Rex',
        armband: '101',
        classes: rexClasses,
      }),
      makeDogGroup({
        id: 'entry-ziva-1',
        dogId: 'd2',
        dogName: 'Ziva',
        armband: '102',
        classes: zivaClasses,
      }),
    ];
    return makeEntry({
      dogName: 'Rex',
      dogId: 'd1',
      classes: [...rexClasses, ...zivaClasses],
      dogs,
      ...overrides,
    });
  }

  it('shows every dog identity (armband + name) on the summary band without expanding details', () => {
    const { container } = renderCard(makeTwoDogEntry());
    const subtitle = container.querySelector('.myk9-entries-card-subtitle');
    expect(subtitle).toHaveTextContent('101');
    expect(subtitle).toHaveTextContent('Rex');
    expect(subtitle).toHaveTextContent('102');
    expect(subtitle).toHaveTextContent('Ziva');
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Ziva')).toBeInTheDocument();
    // Details are still collapsed — the identities came from the summary band.
    expect(screen.getByRole('button', { name: /show details/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('single-dog orders never render the dogs grid — flat class list only', () => {
    const { container } = renderCard(makeEntry({ classes: [makeClass()] }));
    openDetails();
    expect(container.querySelector('.myk9-entries-dogs-grid')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.myk9-entries-class-row')).toHaveLength(1);
  });

  it('renders each dog with its own nested classes in a wrapping grid capped at 5 columns', () => {
    const { container } = renderCard(makeTwoDogEntry());
    openDetails();

    const grid = container.querySelector('.myk9-entries-dogs-grid');
    expect(grid).toHaveClass('xl:grid-cols-5');
    expect(container.querySelectorAll('.myk9-entries-dog-group')).toHaveLength(2);
    // Each name also appears once already in the summary-band identity list
    // (task 8.2 fix 4) — assert two occurrences (summary + this dog's group).
    expect(screen.getAllByText('Rex')).toHaveLength(2);
    expect(screen.getAllByText('Ziva')).toHaveLength(2);
    expect(screen.getByText('Container Search #101')).toBeInTheDocument();
    expect(screen.getByText('Exterior Search #101')).toBeInTheDocument();
    // Class count is conserved — the union of both dogs' classes.
    expect(screen.getByText('2 classes entered')).toBeInTheDocument();
  });

  it('scopes a per-dog check-in click to that dog, not the order lead dog', () => {
    const onCheckInClick = vi.fn();
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeTwoDogEntry()}
          onCheckInClick={onCheckInClick}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
        />
      </MemoryRouter>
    );
    openDetails();

    fireEvent.click(
      screen.getByRole('button', { name: /Update check-in for Ziva in Exterior Search/i })
    );
    expect(onCheckInClick).toHaveBeenCalledTimes(1);
    const [calledEntry, calledClass] = onCheckInClick.mock.calls[0];
    expect(calledEntry.dogName).toBe('Ziva');
    expect(calledEntry.dogId).toBe('d2');
    expect(calledClass.id).toBe('entry-ziva-1');
  });

  it('derives the order-level next action across dogs — check-in for the eligible class on the second dog', () => {
    const onCheckInClick = vi.fn();
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeTwoDogEntry()}
          onCheckInClick={onCheckInClick}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
        />
      </MemoryRouter>
    );

    // Rex's only class is already scored; Ziva's is the eligible one — the
    // summary band must still surface Check In, not fall through to View Show.
    const checkInButton = screen.getByRole('button', { name: 'Check In' });
    fireEvent.click(checkInButton);
    expect(onCheckInClick).toHaveBeenCalledTimes(1);
    const [calledEntry, calledClass] = onCheckInClick.mock.calls[0];
    expect(calledEntry.dogName).toBe('Ziva');
    expect(calledClass.id).toBe('entry-ziva-1');
  });

  it('passes a joined dog name (and no single armband) to onEditClick/onReceiptClick for a multi-dog order', () => {
    const onEditClick = vi.fn();
    const onReceiptClick = vi.fn();
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeTwoDogEntry({ confirmationNumber: 'MK9-55555' })}
          onCheckInClick={vi.fn()}
          onEditClick={onEditClick}
          onReceiptClick={onReceiptClick}
        />
      </MemoryRouter>
    );
    openDetails();

    fireEvent.click(screen.getByRole('button', { name: /Edit Entry/i }));
    expect(onEditClick).toHaveBeenCalledTimes(1);
    expect(onEditClick.mock.calls[0][0].dogName).toBe('Rex & Ziva');
    expect(onEditClick.mock.calls[0][0].armband).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: /Receipt/i }));
    expect(onReceiptClick).toHaveBeenCalledTimes(1);
    expect(onReceiptClick.mock.calls[0][0].dogName).toBe('Rex & Ziva');
  });

  it('passes the plain dog name to onEditClick/onReceiptClick for a single-dog order', () => {
    const onEditClick = vi.fn();
    const onReceiptClick = vi.fn();
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeEntry({ confirmationNumber: 'MK9-11111' })}
          onCheckInClick={vi.fn()}
          onEditClick={onEditClick}
          onReceiptClick={onReceiptClick}
        />
      </MemoryRouter>
    );
    openDetails();

    fireEvent.click(screen.getByRole('button', { name: /Edit Entry/i }));
    expect(onEditClick.mock.calls[0][0].dogName).toBe('Rex');

    fireEvent.click(screen.getByRole('button', { name: /Receipt/i }));
    expect(onReceiptClick.mock.calls[0][0].dogName).toBe('Rex');
  });
});

describe('MyEntryCard part-scored order badge', () => {
  const scoredClass = () =>
    makeClass({
      id: 'c-scored',
      name: 'Interior Search',
      number: '102',
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
    });
  const unrunClass = () =>
    makeClass({ entryStatus: EntryStatus.ACCEPTED, entryStatusKind: 'accepted' });

  /**
   * `groupEntriesByOrder` resolves an order's top-level status by highest
   * priority with COMPLETED at the top, so an order with one scored class
   * arrives here already reporting `completed` — the shape these cases pin.
   */
  function makePartScoredEntry(classes: EntryClass[]) {
    return makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes,
    });
  }

  it('reads "Partially scored" while a class is still to run', () => {
    renderCard(makePartScoredEntry([scoredClass(), unrunClass()]));

    expect(screen.getByText('Partially scored')).toBeInTheDocument();
    // The flat "Scored" must be gone from BOTH the badge and the status line —
    // one saying done while the other says otherwise is the original defect.
    expect(screen.queryByText('Scored')).not.toBeInTheDocument();
    expect(screen.getByText('1 class still to run')).toBeInTheDocument();
  });

  it('counts every class still to run', () => {
    renderCard(makePartScoredEntry([scoredClass(), unrunClass(), { ...unrunClass(), id: 'c2' }]));

    expect(screen.getByText('2 classes still to run')).toBeInTheDocument();
  });

  it('says "In ring" when a remaining class is running now', () => {
    renderCard(
      makePartScoredEntry([
        scoredClass(),
        makeClass({ entryStatus: EntryStatus.ACCEPTED, entryStatusKind: 'in_ring' }),
      ])
    );

    expect(screen.getByText('Partially scored')).toBeInTheDocument();
    expect(screen.getByText('In ring')).toBeInTheDocument();
  });

  it('reads "Scored" once every class has a result', () => {
    renderCard(
      makePartScoredEntry([scoredClass(), { ...scoredClass(), id: 'c-scored-2', number: '103' }])
    );

    expect(screen.getAllByText('Scored').length).toBeGreaterThan(0);
    expect(screen.queryByText('Partially scored')).not.toBeInTheDocument();
  });

  it('reads "Scored" when the only unrun class was scratched', () => {
    renderCard(makePartScoredEntry([scoredClass(), makeClass({ status: 'scratched' })]));

    expect(screen.getAllByText('Scored').length).toBeGreaterThan(0);
    expect(screen.queryByText('Partially scored')).not.toBeInTheDocument();
  });

  it('leaves an untouched accepted order alone', () => {
    renderCard(makeEntry({ classes: [unrunClass()] }));

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByText('Partially scored')).not.toBeInTheDocument();
  });
});
