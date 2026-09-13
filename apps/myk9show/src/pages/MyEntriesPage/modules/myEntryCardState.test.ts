import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryClass, MyEntry } from './my-entries-types';
import { deriveMyEntryCardState } from './myEntryCardState';

const NOW = new Date('2026-09-01T12:00:00');

function makeEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  const { dogs, ...rest } = overrides;
  const base = {
    id: 'entry-1',
    registrationId: 'registration-1',
    showId: 'show-1',
    showName: 'Test Show',
    showDate: new Date('2026-09-10'),
    location: { venue: 'Test Venue', city: 'Denver', state: 'CO' },
    dogName: 'Rex',
    dogId: 'dog-1',
    classes: [],
    totalFee: 30,
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
        classes: base.classes,
        entryStatus: base.entryStatus,
      },
    ],
  };
}

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'class-entry-1',
    classId: 'class-1',
    name: 'Container Search',
    number: '101',
    fee: 30,
    status: 'entered',
    ...overrides,
  };
}

describe('deriveMyEntryCardState', () => {
  it('keeps payment recovery and payment messaging aligned for online debt', () => {
    const state = deriveMyEntryCardState(
      makeEntry({
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'online',
      }),
      NOW
    );

    expect(state.nextAction).toEqual({ kind: 'finish-payment' });
    expect(state.onlinePrompt.kind).toBe('finish-online');
    expect(state.payAtShowPrompt).toEqual({ kind: 'none' });
    expect(state.paymentHref).toContain('show-1');
  });

  it('keeps cash debt as a pay-at-show instruction without an online action', () => {
    const state = deriveMyEntryCardState(
      makeEntry({
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'cash',
      }),
      NOW
    );

    expect(state.onlinePrompt.kind).not.toBe('finish-online');
    expect(state.payAtShowPrompt).toMatchObject({ kind: 'pay-at-show' });
    expect(state.nextAction).toEqual({ kind: 'view-show' });
  });

  it('does not retain a dead cart link for a past unpaid entry', () => {
    const state = deriveMyEntryCardState(
      makeEntry({
        showDate: new Date('2026-08-01'),
        showEndDate: new Date('2026-08-02'),
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'online',
      }),
      NOW
    );

    expect(state.isPastShow).toBe(true);
    expect(state.paymentHref).toBeNull();
    expect(state.nextAction).toEqual({ kind: 'view-show' });
  });

  it('derives deadline and receipt affordances from one snapshot', () => {
    const entryClass = makeClass({ runOrder: 4 });
    const state = deriveMyEntryCardState(
      makeEntry({
        confirmationNumber: 'CONF-1',
        entryCloseDate: new Date('2026-09-05'),
        classes: [entryClass],
      }),
      NOW
    );

    expect(state.canEdit).toBe(true);
    expect(state.canRequestPostDeadlineHelp).toBe(false);
    expect(state.canShowReceipt).toBe(true);
  });

  it('scopes a check-in next action to the dog that owns its class', () => {
    const entryClass = makeClass();
    const state = deriveMyEntryCardState(
      makeEntry({
        classes: [entryClass],
        dogs: [
          {
            id: 'dog-entry-1',
            dogId: 'dog-1',
            dogName: 'Rex',
            classes: [],
            entryStatus: EntryStatus.ACCEPTED,
          },
          {
            id: 'dog-entry-2',
            dogId: 'dog-2',
            dogName: 'Milo',
            classes: [entryClass],
            entryStatus: EntryStatus.ACCEPTED,
          },
        ],
      }),
      NOW
    );

    expect(state.nextAction).toEqual({ kind: 'check-in', classId: entryClass.id });
    expect(state.nextActionDog?.dogName).toBe('Milo');
  });

  it('disables active-history affordances after the show ends', () => {
    const state = deriveMyEntryCardState(
      makeEntry({
        showDate: new Date('2026-08-01'),
        entryStatus: EntryStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        entryCloseDate: new Date('2026-07-01'),
        classes: [makeClass({ runOrder: 4 })],
      }),
      NOW
    );

    expect(state.isPastShow).toBe(true);
    expect(state.isPendingReview).toBe(false);
    expect(state.canRequestPostDeadlineHelp).toBe(true);
  });

  it('treats a completed kind as terminal when the legacy status is accepted', () => {
    const state = deriveMyEntryCardState(
      makeEntry({
        entryStatus: EntryStatus.ACCEPTED,
        entryStatusKind: 'completed',
        entryCloseDate: new Date('2026-09-05'),
      }),
      NOW
    );

    expect(state.isTerminalStatus).toBe(true);
    expect(state.canEdit).toBe(false);
    expect(state.canRequestPostDeadlineHelp).toBe(false);
  });

  // Codex, PR #2201 (P1). The close date is inclusive: the server still accepts
  // edits all day. Losing BOTH "Edit entry" and its replacement for that day is
  // the dead end docs/INTENT.md forbids.
  describe('the inclusive close day', () => {
    const CHICAGO = 'America/Chicago';
    const onCloseDay = (closeDate: Date, now: Date) =>
      deriveMyEntryCardState(
        makeEntry({
          entryCloseDate: closeDate,
          classes: [makeClass({ trialDate: new Date(2026, 8, 20), trialTimezone: CHICAGO })],
        }),
        now
      );

    it('keeps editing open all through the close date', () => {
      // 04:30Z on 2 Sep is 23:30 on 1 Sep in Chicago — the last half hour of
      // the close day. Written as an explicit instant so the device zone the
      // suite happens to run in cannot change which day this is.
      const state = onCloseDay(new Date(2026, 8, 1), new Date('2026-09-02T04:30:00Z'));
      expect(state.canEdit).toBe(true);
      expect(state.canRequestPostDeadlineHelp).toBe(false);
    });

    it('hands over to the post-deadline state the next day', () => {
      // 05:30Z is 00:30 on 2 Sep in Chicago — half an hour into the next day.
      const state = onCloseDay(new Date(2026, 8, 1), new Date('2026-09-02T05:30:00Z'));
      expect(state.canEdit).toBe(false);
      expect(state.canRequestPostDeadlineHelp).toBe(true);
    });

    it('never leaves an editable order with neither state', () => {
      // Every one of these is a moment ON 1 Sep in Chicago: 00:30, 06:30,
      // 12:30 and 23:30 local.
      for (const instant of [
        '2026-09-01T05:30:00Z',
        '2026-09-01T11:30:00Z',
        '2026-09-01T17:30:00Z',
        '2026-09-02T04:30:00Z',
      ]) {
        const state = onCloseDay(new Date(2026, 8, 1), new Date(instant));
        expect(state.canEdit || state.canRequestPostDeadlineHelp).toBe(true);
      }
    });

    // P2: the zone comes from the PRIMARY trial (earliest date), not whichever
    // class happens to render first.
    it('reckons the day in the primary trial zone, whatever order classes arrive in', () => {
      const state = deriveMyEntryCardState(
        makeEntry({
          entryCloseDate: new Date(2026, 8, 1),
          classes: [
            makeClass({
              id: 'later-honolulu',
              trialDate: new Date(2026, 8, 21),
              trialTimezone: 'Pacific/Honolulu',
            }),
            makeClass({
              id: 'earlier-chicago',
              trialDate: new Date(2026, 8, 20),
              trialTimezone: CHICAGO,
            }),
          ],
        }),
        // 06:00 UTC on 2 Sep reads 01:00 on the 2nd in Chicago but 20:00 on
        // the 1st in Honolulu, so the two zones disagree about the day. The
        // primary trial is the Chicago one, and it decides.
        new Date('2026-09-02T06:00:00Z')
      );
      expect(state.canEdit).toBe(false);
      expect(state.canRequestPostDeadlineHelp).toBe(true);
    });
  });
});
