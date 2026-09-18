import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  getShowRegistrationQueueCounts,
  groupEntriesByShowRegistration,
  summarizeShowRegistrationTotals,
} from '../showRegistrationProjection';

/**
 * MYK9-635 — "All registrations 514" against a show page saying 517 entries.
 *
 * ONE fixture, shaped like the live show the report came from
 * (`dededede-…010`): entries that mostly stand alone as their own registration,
 * a couple sharing one, and one pending review. Both numbers are derived from
 * it, so the show page's Entries count and Entry Management's queue can never
 * again be two facts with no relationship stated.
 *
 * The report's stated cause — "All excludes Needs review" — is NOT what the
 * code does, and this file pins that too.
 */
function entry(id: string, overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id,
    dogId: `dog-${id}`,
    dogName: `Dog ${id}`,
    registrationId: `registration-${id}`,
    entryNumber: id,
    showId: 'show-1',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    classes: [
      {
        id,
        classId: `class-${id}`,
        name: 'Container Novice A',
        number: 'CN-A',
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-07-12T13:42:00Z'),
    lastUpdated: new Date('2026-07-12T13:42:00Z'),
    ...overrides,
  };
}

// 7 entries in 5 registrations: three share `registration-shared`, one of the
// standalone ones is pending review. Deliberately NOT a fixture where
// registrations + needs-review happens to equal entries — that coincidence on
// the live show (514 + 3 = 517) is what sent the report after the wrong cause.
const SHOW_ENTRIES: EntryManagementEntry[] = [
  entry('a'),
  entry('b'),
  entry('c', { registrationId: 'registration-shared' }),
  entry('d', { registrationId: 'registration-shared' }),
  entry('d2', { registrationId: 'registration-shared' }),
  entry('e'),
  entry('needs-review', { entryStatus: EntryStatus.PENDING }),
];

describe('MYK9-635 — the show page total and the Entry Management queue', () => {
  const groups = groupEntriesByShowRegistration(SHOW_ENTRIES);
  const counts = getShowRegistrationQueueCounts(groups);
  const totals = summarizeShowRegistrationTotals(groups);

  it('states both numbers from one pass, and they are different units', () => {
    // What the show page's Entries badge counts: every live entry row
    // (`countCatalogEntries` over the same rows this fixture holds).
    expect(totals.entryCount).toBe(SHOW_ENTRIES.length);
    expect(totals.entryCount).toBe(7);
    // What the queue lists, and what "All registrations" counts.
    expect(totals.registrationCount).toBe(5);
    expect(counts.all).toBe(5);
  });

  it('counts every registration under "All" — Needs review is a filter, not an exclusion', () => {
    expect(counts['needs-review']).toBe(1);
    expect(counts.all).toBe(groups.length);
    expect(counts.all).toBeGreaterThan(counts.all - counts['needs-review']);
    // The arithmetic the report inferred (All + Needs review = show total) is
    // NOT what this code does, and asserting it would pin the wrong model.
    expect(counts.all + counts['needs-review']).not.toBe(totals.entryCount);
  });

  it('keeps the needs-review registration inside the All queue', () => {
    const allKeys = groups.map(group => group.groupKey);
    expect(allKeys).toContain('registration-needs-review');
  });

  it('counts a multi-entry registration once as a registration, twice as entries', () => {
    const shared = groups.find(group => group.groupKey === 'registration-shared');
    expect(shared?.entryCount).toBe(3);
    expect(totals.entryCount - totals.registrationCount).toBe(2);
  });
});
