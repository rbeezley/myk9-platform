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

  it('derives deadline, receipt, and run-order affordances from one snapshot', () => {
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
    expect(state.canViewRunOrder).toBe(true);
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
    expect(state.canViewRunOrder).toBe(false);
    expect(state.canRequestPostDeadlineHelp).toBe(true);
  });
});
