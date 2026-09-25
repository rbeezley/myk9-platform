/**
 * MYK9-677: the Show Closeout money card must see desk money on the row shape
 * the Show Desk actually hands it — `SecretaryEntry`, from the warm replicated
 * read — not only on a hand-built fixture.
 *
 * The card used to gate on `is_day_of_show`, which neither secretary read
 * projects, so on the real page the at-show figures were zero no matter what
 * was taken at the desk. This runs the real warm projection into the real
 * summary. LESSONS `last-hop-drop`.
 */
import { describe, expect, it } from 'vitest';
import { toSecretaryEntry } from '@/services/database/entries/secretaryReadReplication';
import { summarizeShowDayReconciliation } from '../showDayReconciliationSummary';

const EMPTY_RELATIONS = {
  dogsMap: new Map(),
  classesMap: new Map(),
  armbandsByEntryId: new Map(),
  armbandsByDogId: new Map(),
  peopleMap: new Map(),
  enrollmentsMap: new Map(),
  trialsMap: new Map(),
  pullMetadataMap: new Map(),
} as unknown as Parameters<typeof toSecretaryEntry>[1];

const DESK_WINDOW = {
  showStartDate: '2026-09-17T00:00:00+00:00',
  showEndDate: '2026-09-18T00:00:00+00:00',
  timeZone: 'America/New_York',
};

function replicaEntry(id: string, submittedAt: string, paymentReceivedOn: string | null = null) {
  return toSecretaryEntry(
    {
      id,
      dogId: `dog-${id}`,
      classId: 'class-1',
      showId: 'show-1',
      entryStatus: 'confirmed',
      entryFee: 35,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      isDayOfShow: true,
      submittedAt,
      paymentReceivedOn,
    } as never,
    EMPTY_RELATIONS
  );
}

describe('Show Closeout money card on the secretary read (MYK9-677)', () => {
  it('counts cash taken at the desk on show day', () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('desk-cash', '2026-09-17T15:00:00Z')],
      DESK_WINDOW
    );

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(35);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 35 });
  });

  it('leaves out a day-of-show-bucket entry keyed weeks before the show', () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('early-mail-in', '2026-08-30T15:00:00Z')],
      DESK_WINDOW
    );

    expect(summary.lateEntryCount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
  });

  it('counts a mail-in keyed weeks early whose payment the desk received on show day', () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('mail-in-paid-at-desk', '2026-08-27T15:00:00Z', '2026-09-17')],
      DESK_WINDOW
    );

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(35);
  });
});
