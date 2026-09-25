/**
 * MYK9-677: the Show Closeout money card must see desk money on the row shape
 * the Show Desk actually hands it — `SecretaryEntry`, from the warm replicated
 * read — not only on a hand-built fixture.
 *
 * Cash and check money comes from the payments ledger, joined back to the
 * entries by `registration_id` (an enrollment's rows) or `id` (a desk late
 * entry's own row). This runs the real warm projection into the real summary,
 * so a join key the projection drops fails here. LESSONS `last-hop-drop`.
 */
import { describe, expect, it } from 'vitest';
import type { ShowPaymentLedgerRow } from '@/features/payments/showPaymentLedger';
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

function replicaEntry(id: string, submittedAt: string, registrationId?: string) {
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
      ...(registrationId ? { registrationId } : {}),
    } as never,
    EMPTY_RELATIONS
  );
}

function row(overrides: Partial<ShowPaymentLedgerRow>): ShowPaymentLedgerRow {
  return {
    id: 'row',
    enrollment_id: null,
    entry_id: null,
    kind: 'payment',
    amount: 35,
    method: 'cash',
    received_on: '2026-09-17',
    ...overrides,
  };
}

describe('Show Closeout money card on the secretary read (MYK9-677)', () => {
  it("counts a desk late entry's cash through the ledger row keyed on its id", () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('desk-cash', '2026-09-17T15:00:00Z')],
      DESK_WINDOW,
      [row({ entry_id: 'desk-cash' })]
    );

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(35);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 35 });
  });

  it('leaves out an entry whose only ledger row predates the show', () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('early-mail-in', '2026-08-30T15:00:00Z')],
      DESK_WINDOW,
      [row({ entry_id: 'early-mail-in', received_on: '2026-08-30' })]
    );

    expect(summary.lateEntryCount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
  });

  it("joins an enrollment's desk payment back to its entry by registration_id", () => {
    const summary = summarizeShowDayReconciliation(
      [replicaEntry('mail-in-paid-at-desk', '2026-08-27T15:00:00Z', 'reg-1')],
      DESK_WINDOW,
      [row({ enrollment_id: 'reg-1' })]
    );

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(35);
  });
});
