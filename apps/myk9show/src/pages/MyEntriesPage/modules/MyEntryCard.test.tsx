import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const rowA = makeEntry({ id: 'c1', registrationId: 'r1', dogId: 'd1', classes: [classA], totalFee: 25 });
    const rowB = makeEntry({ id: 'c2', registrationId: 'r1', dogId: 'd1', classes: [classB], totalFee: 30 });

    const result = groupEntriesByShowAndDog([rowA, rowB]);

    expect(result).toHaveLength(1);
    expect(result[0].classes).toHaveLength(2);
    expect(result[0].totalFee).toBe(55);
  });

  it('keeps separate cards for different dogs at the same show', () => {
    const rowA = makeEntry({ id: 'e1', registrationId: 'r1', dogId: 'd1', dogName: 'Rex', classes: [makeClass({ id: 'c1' })] });
    const rowB = makeEntry({ id: 'e2', registrationId: 'r2', dogId: 'd2', dogName: 'Ziva', classes: [makeClass({ id: 'c2' })] });

    const result = groupEntriesByShowAndDog([rowA, rowB]);

    expect(result).toHaveLength(2);
  });

  it('keeps separate cards for the same dog at different shows', () => {
    const rowA = makeEntry({ id: 'e1', registrationId: 'r1', dogId: 'd1', showId: 's1', classes: [makeClass({ id: 'c1' })] });
    const rowB = makeEntry({ id: 'e2', registrationId: 'r2', dogId: 'd1', showId: 's2', classes: [makeClass({ id: 'c2' })] });

    const result = groupEntriesByShowAndDog([rowA, rowB]);

    expect(result).toHaveLength(2);
  });

  it('returns an empty array for empty input', () => {
    expect(groupEntriesByShowAndDog([])).toEqual([]);
  });

  it('uses the highest-priority status when merging — ACCEPTED beats PENDING seed', () => {
    const seed = makeEntry({ entryStatus: EntryStatus.PENDING, classes: [makeClass({ id: 'c1' })] });
    const second = makeEntry({ entryStatus: EntryStatus.ACCEPTED, classes: [makeClass({ id: 'c2' })] });
    const result = groupEntriesByShowAndDog([seed, second]);
    expect(result[0].entryStatus).toBe(EntryStatus.ACCEPTED);
  });

  it('uses the highest-priority status — ACCEPTED seed is not downgraded by SCRATCHED row', () => {
    const seed = makeEntry({ entryStatus: EntryStatus.ACCEPTED, classes: [makeClass({ id: 'c1', status: 'entered' })] });
    const scratched = makeEntry({ entryStatus: EntryStatus.SCRATCHED, classes: [makeClass({ id: 'c2', status: 'scratched' })] });
    const result = groupEntriesByShowAndDog([seed, scratched]);
    expect(result[0].entryStatus).toBe(EntryStatus.ACCEPTED);
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
