/**
 * MYK9-677: the Show Closeout card must count entries made during the show on the row shape the
 * Show Desk actually hands it (`SecretaryEntry`, from the warm replicated read),
 * not only on a hand-built fixture. The card once gated on `is_day_of_show`,
 * which the secretary read never carried, so it always read zero.
 * LESSONS `last-hop-drop`.
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

function replicaEntry(id: string, submittedAt: string, paymentMethod = 'cash') {
  return toSecretaryEntry(
    {
      id,
      dogId: `dog-${id}`,
      classId: 'class-1',
      showId: 'show-1',
      entryStatus: 'confirmed',
      entryFee: 35,
      paymentStatus: paymentMethod === 'waived' ? 'waived' : 'paid',
      paymentMethod,
      isDayOfShow: true,
      submittedAt,
    } as never,
    EMPTY_RELATIONS
  );
}

describe('entries made during the show, on the secretary read (MYK9-677)', () => {
  it('counts an entry submitted on a show day', () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('desk', '2026-09-17T15:00:00Z')],
      DESK_WINDOW
    );

    expect(summary.entriesDuringShowCount).toBe(1);
  });

  it('leaves out a day-of-show-bucket entry keyed weeks before the show', () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('early-mail-in', '2026-08-30T15:00:00Z')],
      DESK_WINDOW
    );

    expect(summary.entriesDuringShowCount).toBe(0);
  });

  it('counts a waived show-day entry, and notes it as waived', () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('comp', '2026-09-18T15:00:00Z', 'waived')],
      DESK_WINDOW
    );

    expect(summary.entriesDuringShowCount).toBe(1);
    expect(summary.waivedDuringShowCount).toBe(1);
  });
});
