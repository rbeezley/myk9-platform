import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { buildScopeMessage } from './EntryScopeBanner';
import type { MyEntry } from './my-entries-types';

function entryAt(showName: string): MyEntry {
  return {
    id: `e-${showName}`,
    registrationId: 'reg',
    showId: `show-${showName}`,
    showName,
    showDate: new Date(2026, 5, 2),
    location: { venue: '', city: '', state: '' },
    dogName: 'Dog',
    dogId: 'dog',
    classes: [],
    dogs: [],
    totalFee: 30,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date(2026, 4, 1),
    lastUpdated: new Date(2026, 4, 1),
  };
}

describe('buildScopeMessage', () => {
  it('says nothing on an unscoped visit', () => {
    expect(buildScopeMessage({ kind: 'none', entries: [] }, 5)).toBeNull();
  });

  it('names the show the payment covered when the ids matched', () => {
    expect(buildScopeMessage({ kind: 'entries', entries: [entryAt('Spring Trial')] }, 12)).toBe(
      'Showing 1 of 12 entries — the ones your payment for Spring Trial covered.'
    );
  });

  it('singularizes the denominator', () => {
    expect(buildScopeMessage({ kind: 'entries', entries: [entryAt('Spring Trial')] }, 1)).toContain(
      '1 of 1 entry'
    );
  });

  it('does NOT claim the payment covered these entries on the show fallback', () => {
    // This branch lists the WHOLE show because the named entry rows were not
    // found. Borrowing the "the ones your payment covered" sentence here would
    // be the same false promise the bare "Receipt" label used to make.
    const message = buildScopeMessage(
      { kind: 'show', entries: [entryAt('Spring Trial'), entryAt('Spring Trial')] },
      12
    );
    expect(message).toBe(
      'Showing 2 of 12 entries for Spring Trial — we could not pin down which of them that payment covered.'
    );
    expect(message).not.toContain('the ones your payment');
  });

  it('drops the show name rather than naming the wrong show when entries disagree', () => {
    const message = buildScopeMessage(
      { kind: 'entries', entries: [entryAt('Spring Trial'), entryAt('Autumn Classic')] },
      12
    );
    expect(message).toBe('Showing 2 of 12 entries from one payment.');
    expect(message).not.toContain('Spring Trial');
  });

  it('falls back to "one show" when a show-scoped list has no agreed name', () => {
    expect(
      buildScopeMessage(
        { kind: 'show', entries: [entryAt('Spring Trial'), entryAt('Autumn Classic')] },
        12
      )
    ).toContain('for one show');
  });

  it('does NOT claim completeness when some named rows are missing', () => {
    const message = buildScopeMessage({ kind: 'partial', entries: [entryAt('Spring Trial')] }, 12);
    expect(message).toBe(
      'Showing 1 of 12 entries for Spring Trial. We could not find every entry that payment covered — some may still be syncing.'
    );
    expect(message).not.toContain('the ones your payment');
  });

  it('admits a stale link instead of implying entries vanished', () => {
    expect(buildScopeMessage({ kind: 'unmatched', entries: [] }, 12)).toBe(
      'That receipt link no longer matches any of your entries, so all of them are shown below.'
    );
  });
});
