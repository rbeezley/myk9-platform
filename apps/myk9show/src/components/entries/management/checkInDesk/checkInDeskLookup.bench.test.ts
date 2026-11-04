/**
 * MYK9-1689: armband lookup on 600 entries, the roster's filter against the Check-in desk's.
 * The desk's filter wraps the roster's `filterPeopleRoster`, so it must be no slower; the
 * numbers print so the PR can record them. The assertion is a generous ceiling, not a race,
 * so a slow CI box cannot flake it.
 */
import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  buildPeopleRoster,
  filterPeopleRoster,
} from '@/components/entries/management/checkInDesk/peopleRoster';
import { buildCheckInDeskPeople, filterCheckInDesk } from './checkInDeskModel';

function makeEntries(count: number): EntryManagementEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `entry-${index}`,
    registrationId: `reg-${index % 200}`,
    entryNumber: String(100 + index),
    showId: 'show-1',
    dogId: `dog-${index}`,
    dogName: `Dog ${index}`,
    ownerName: `Owner ${index % 200}`,
    ownerEmail: `owner${index % 200}@example.com`,
    handlerName: `Owner ${index % 200}`,
    handlerId: `person-${index % 200}`,
    ownerId: `person-${index % 200}`,
    classes: [
      {
        id: `entry-${index}`,
        classId: `class-${index % 12}`,
        name: `Class ${index % 12}`,
        number: String(index % 12),
        fee: 25,
        status: 'entered' as const,
        checkInStatus: index % 3 === 0 ? ('checked-in' as const) : ('no-status' as const),
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-07-08T09:00:00.000Z'),
    lastUpdated: new Date('2026-07-08T09:00:00.000Z'),
    armbandNumber: String(100 + index),
  }));
}

function medianMs(run: () => void, rounds = 200): number {
  const samples: number[] = [];
  for (let i = 0; i < rounds; i += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

describe('armband lookup on 600 entries', () => {
  const entries = makeEntries(600);
  const roster = buildPeopleRoster({ entries, presence: [] });
  const desk = buildCheckInDeskPeople(entries, [], new Date('2026-07-08T16:00:00.000Z'));

  it('finds the same people, no slower than the roster filter', () => {
    expect(filterCheckInDesk(desk, '450', 'all').map(p => p.id)).toEqual(
      filterPeopleRoster(roster, '450', 'all').map(p => p.id)
    );
    expect(filterCheckInDesk(desk, '450', 'all').length).toBeGreaterThan(0);

    // Warm up, then measure.
    medianMs(() => filterPeopleRoster(roster, '450', 'all'), 20);
    medianMs(() => filterCheckInDesk(desk, '450', 'all'), 20);
    const rosterMs = medianMs(() => filterPeopleRoster(roster, '450', 'all'));
    const deskMs = medianMs(() => filterCheckInDesk(desk, '450', 'all'));
    console.log(
      `armband lookup, 600 entries / ${roster.length} people: roster ${rosterMs.toFixed(4)} ms, check-in desk ${deskMs.toFixed(4)} ms (median of 200)`
    );
    expect(deskMs).toBeLessThan(Math.max(rosterMs * 3, 5));
  });
});
