import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyEntryCard } from './MyEntryCard';
import { groupEntriesByShowAndDog } from './useMyEntriesData';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry, EntryClass } from './my-entries-types';

function makeEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
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

describe('MyEntryCard stepper visibility', () => {
  it('hides the stepper when the entry is accepted and paid online', () => {
    const { container } = renderCard(makeEntry({ paymentStatus: PaymentStatus.PAID_ONLINE }));
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
  });

  it('hides the stepper when the entry is accepted and paid by check', () => {
    const { container } = renderCard(makeEntry({ paymentStatus: PaymentStatus.PAID_BY_CHECK }));
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
  });

  it('hides the stepper when the entry is accepted and paid by cash', () => {
    const { container } = renderCard(makeEntry({ paymentStatus: PaymentStatus.PAID_BY_CASH }));
    expect(container.querySelector('.entry-status-stepper')).not.toBeInTheDocument();
  });

  it('shows the stepper when accepted but payment is pending', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.ACCEPTED, paymentStatus: PaymentStatus.PENDING })
    );
    expect(container.querySelector('.entry-status-stepper')).toBeInTheDocument();
  });

  it('shows the stepper for a pending entry', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.PENDING, paymentStatus: PaymentStatus.PENDING })
    );
    expect(container.querySelector('.entry-status-stepper')).toBeInTheDocument();
  });

  it('shows the stepper for a waitlisted entry', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.WAITLIST, paymentStatus: PaymentStatus.PENDING })
    );
    expect(container.querySelector('.entry-status-stepper')).toBeInTheDocument();
  });

  it('shows the stepper for a rejected entry', () => {
    const { container } = renderCard(
      makeEntry({ entryStatus: EntryStatus.REJECTED, paymentStatus: PaymentStatus.PENDING })
    );
    expect(container.querySelector('.entry-status-stepper')).toBeInTheDocument();
  });

  it('still renders the show name and status badges when stepper is hidden', () => {
    renderCard(makeEntry({ paymentStatus: PaymentStatus.PAID_ONLINE }));
    expect(screen.getByText('Test Show')).toBeInTheDocument();
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

  it('still shows Finish Payment (and the balance chip) for a pending ONLINE-card entry', () => {
    renderCard(
      makeEntry({
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'credit_card',
        totalFee: 30,
      })
    );

    expect(screen.getByRole('link', { name: /Finish Payment/i })).toBeInTheDocument();
    expect(screen.queryByText(/cash to check-in/i)).not.toBeInTheDocument();
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
    expect(screen.queryByText('Pending Review')).not.toBeInTheDocument();
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

    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('5th')).toBeInTheDocument();
  });

  it('omits placement for the 0 default (un-ranked row) rather than rendering "0th"', () => {
    renderCard(
      makeEntry({
        classes: [makeClass({ isScored: true, resultStatus: 'qualified', finalPlacement: 0 })],
      })
    );

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

    expect(screen.queryByRole('button', { name: /New result/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Result card/i })).not.toBeInTheDocument();
  });
});

describe('groupEntriesByShowAndDog', () => {
  it('returns a single entry unchanged when there is only one class', () => {
    const entry = makeEntry({ classes: [makeClass()] });
    const result = groupEntriesByShowAndDog([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].classes).toHaveLength(1);
  });

  it('merges two class rows for the same dog and registration into one card', () => {
    const classA = makeClass({ id: 'c1', name: 'Container Search', fee: 25 });
    const classB = makeClass({ id: 'c2', name: 'Exterior Search', fee: 30 });
    const rowA = makeEntry({
      id: 'c1',
      registrationId: 'r1',
      dogId: 'd1',
      classes: [classA],
      totalFee: 25,
    });
    const rowB = makeEntry({
      id: 'c2',
      registrationId: 'r1',
      dogId: 'd1',
      classes: [classB],
      totalFee: 30,
    });

    const result = groupEntriesByShowAndDog([rowA, rowB]);

    expect(result).toHaveLength(1);
    expect(result[0].classes).toHaveLength(2);
    expect(result[0].totalFee).toBe(55);
  });

  it('keeps separate cards for different dogs at the same show', () => {
    const rowA = makeEntry({
      id: 'e1',
      registrationId: 'r1',
      dogId: 'd1',
      dogName: 'Rex',
      classes: [makeClass({ id: 'c1' })],
    });
    const rowB = makeEntry({
      id: 'e2',
      registrationId: 'r2',
      dogId: 'd2',
      dogName: 'Ziva',
      classes: [makeClass({ id: 'c2' })],
    });

    const result = groupEntriesByShowAndDog([rowA, rowB]);

    expect(result).toHaveLength(2);
  });

  it('keeps separate cards for the same dog at different shows', () => {
    const rowA = makeEntry({
      id: 'e1',
      registrationId: 'r1',
      dogId: 'd1',
      showId: 's1',
      classes: [makeClass({ id: 'c1' })],
    });
    const rowB = makeEntry({
      id: 'e2',
      registrationId: 'r2',
      dogId: 'd1',
      showId: 's2',
      classes: [makeClass({ id: 'c2' })],
    });

    const result = groupEntriesByShowAndDog([rowA, rowB]);

    expect(result).toHaveLength(2);
  });

  it('returns an empty array for empty input', () => {
    expect(groupEntriesByShowAndDog([])).toEqual([]);
  });

  it('uses the highest-priority status when merging — ACCEPTED beats PENDING seed', () => {
    const seed = makeEntry({
      entryStatus: EntryStatus.PENDING,
      classes: [makeClass({ id: 'c1' })],
    });
    const second = makeEntry({
      entryStatus: EntryStatus.ACCEPTED,
      classes: [makeClass({ id: 'c2' })],
    });
    const result = groupEntriesByShowAndDog([seed, second]);
    expect(result[0].entryStatus).toBe(EntryStatus.ACCEPTED);
  });

  it('uses the highest-priority status — ACCEPTED seed is not downgraded by SCRATCHED row', () => {
    const seed = makeEntry({
      entryStatus: EntryStatus.ACCEPTED,
      classes: [makeClass({ id: 'c1', status: 'entered' })],
    });
    const scratched = makeEntry({
      entryStatus: EntryStatus.SCRATCHED,
      classes: [makeClass({ id: 'c2', status: 'scratched' })],
    });
    const result = groupEntriesByShowAndDog([seed, scratched]);
    expect(result[0].entryStatus).toBe(EntryStatus.ACCEPTED);
  });

  it('keeps an armband from a later row when the seed row has none', () => {
    const seed = makeEntry({
      armband: undefined,
      classes: [makeClass({ id: 'c1' })],
    });
    const second = makeEntry({
      armband: '142',
      classes: [makeClass({ id: 'c2' })],
    });

    const result = groupEntriesByShowAndDog([seed, second]);

    expect(result).toHaveLength(1);
    expect(result[0].armband).toBe('142');
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

    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.queryByText(/\d(st|nd|rd|th)$/)).not.toBeInTheDocument();
  });
});

describe('MyEntryCard confirmation number fallback (P1-04w-1)', () => {
  it('shows "Pending" fallback for an active entry with no confirmation number', () => {
    renderCard(makeEntry({ confirmationNumber: undefined, entryStatus: EntryStatus.PENDING }));
    expect(screen.getByText(/Confirmation # Pending/)).toBeInTheDocument();
  });

  it('shows "—" fallback for a withdrawn entry with no confirmation number', () => {
    renderCard(makeEntry({ confirmationNumber: undefined, entryStatus: EntryStatus.CANCELLED }));
    expect(screen.getByText(/Confirmation # —/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirmation # Pending/)).not.toBeInTheDocument();
  });

  it('shows "—" fallback for a scratched entry with no confirmation number', () => {
    renderCard(makeEntry({ confirmationNumber: undefined, entryStatus: EntryStatus.SCRATCHED }));
    expect(screen.getByText(/Confirmation # —/)).toBeInTheDocument();
  });

  it('always shows the enrollment confirmation number when present, regardless of status', () => {
    renderCard(makeEntry({ confirmationNumber: 'MK9-12345', entryStatus: EntryStatus.CANCELLED }));
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

    expect(screen.queryByRole('link', { name: /View run order/i })).not.toBeInTheDocument();
  });
});

describe('MyEntryCard handler display', () => {
  it('shows handler name when a class has a handler set', () => {
    const entry = makeEntry({
      classes: [makeClass({ handler: 'Sarah M.' })],
    });
    renderCard(entry);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });

  it('shows no handler line when handler is not set', () => {
    const entry = makeEntry({
      classes: [makeClass({ handler: undefined })],
    });
    renderCard(entry);
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

    expect(screen.queryByRole('link', { name: /View run order/i })).not.toBeInTheDocument();
  });
});

describe('MyEntryCard class detail display', () => {
  it('shows the dog armband before the dog name', () => {
    renderCard(makeEntry({ armband: '142' }));

    const subtitle = screen.getByText(/Confirmation #/).parentElement;
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

    expect(screen.getByText('Sep 2')).toBeInTheDocument();
    expect(screen.getByText('Trial 2')).toBeInTheDocument();
    expect(screen.queryByText('$25')).not.toBeInTheDocument();
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
    const btn = screen.getByRole('button', {
      name: /update check-in for rex in container search/i,
    });
    fireEvent.click(btn);
    expect(onCheckInClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to enabled when the class id is missing from the map', () => {
    renderWithMap(makeEntry({ classes: [unscored] }), {});
    expect(
      screen.getByRole('button', { name: /update check-in for rex in container search/i })
    ).toBeInTheDocument();
  });

  it('disables the check-in control with a reason when self-check-in is off', () => {
    const onCheckInClick = renderWithMap(makeEntry({ classes: [unscored] }), { 'class-1': false });
    // No interactive button…
    expect(
      screen.queryByRole('button', { name: /update check-in for rex in container search/i })
    ).not.toBeInTheDocument();
    // …a non-interactive indicator with an explanatory label instead.
    expect(screen.getByLabelText('Self check-in not available')).toBeInTheDocument();
    expect(onCheckInClick).not.toHaveBeenCalled();
  });
});
