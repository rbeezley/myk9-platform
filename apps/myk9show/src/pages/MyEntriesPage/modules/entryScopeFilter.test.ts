import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { buildEntryReceiptHref } from '@/features/payments/entryReceiptHref';
import { applyEntryScope, clearEntryScopeParams, parseEntryScope } from './entryScopeFilter';
import type { EntryClass, MyEntry } from './my-entries-types';

function makeClass(id: string): EntryClass {
  return { id, name: 'Novice A', number: '1', fee: 30, status: 'entered' };
}

function makeEntry(id: string, showId: string, classIds: string[]): MyEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    showId,
    showName: `Show ${showId}`,
    showDate: new Date(2026, 5, 2),
    location: { venue: '', city: '', state: '' },
    dogName: 'Dog',
    dogId: 'dog',
    classes: classIds.map(makeClass),
    dogs: [],
    totalFee: 30,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date(2026, 4, 1),
    lastUpdated: new Date(2026, 4, 1),
  };
}

const orderA = makeEntry('a', 'show-1', ['e1', 'e2']);
const orderB = makeEntry('b', 'show-1', ['e3']);
const orderC = makeEntry('c', 'show-2', ['e4']);
const all = [orderA, orderB, orderC];

describe('parseEntryScope', () => {
  it('returns null for an unscoped visit', () => {
    expect(parseEntryScope(new URLSearchParams(''))).toBeNull();
    expect(parseEntryScope(new URLSearchParams('tab=completed'))).toBeNull();
  });

  it('reads the params the receipt link actually produces', () => {
    const href = buildEntryReceiptHref('show-1', ['e1', 'e2']);
    const query = href.slice(href.indexOf('?') + 1);
    expect(parseEntryScope(new URLSearchParams(query))).toEqual({
      showId: 'show-1',
      entryIds: ['e1', 'e2'],
    });
  });

  it('tolerates blank and whitespace-padded ids', () => {
    expect(parseEntryScope(new URLSearchParams('entryIds= e1 ,, e2 '))).toEqual({
      showId: null,
      entryIds: ['e1', 'e2'],
    });
  });

  it('treats an empty entryIds param as no scope at all', () => {
    expect(parseEntryScope(new URLSearchParams('entryIds='))).toBeNull();
  });

  it('accepts a show-only scope', () => {
    expect(parseEntryScope(new URLSearchParams('showId=show-1'))).toEqual({
      showId: 'show-1',
      entryIds: [],
    });
  });
});

describe('applyEntryScope', () => {
  it('passes everything through when there is no scope', () => {
    const result = applyEntryScope(all, null);
    expect(result.kind).toBe('none');
    expect(result.entries).toEqual(all);
  });

  it('narrows to the orders whose class rows the link named', () => {
    const result = applyEntryScope(all, { showId: 'show-1', entryIds: ['e1'] });
    expect(result.kind).toBe('entries');
    expect(result.entries).toEqual([orderA]);
  });

  it('matches every order the id set spans, not just the first', () => {
    const result = applyEntryScope(all, { showId: 'show-1', entryIds: ['e2', 'e3'] });
    expect(result.entries).toEqual([orderA, orderB]);
  });

  it('falls back to the show when the named ids are not on screen yet', () => {
    // A row still replicating would otherwise render an empty My Shows.
    const result = applyEntryScope(all, { showId: 'show-1', entryIds: ['not-yet'] });
    expect(result.kind).toBe('show');
    expect(result.entries).toEqual([orderA, orderB]);
  });

  it('shows everything, flagged as unmatched, when nothing matches', () => {
    const result = applyEntryScope(all, { showId: 'gone', entryIds: ['gone-too'] });
    expect(result.kind).toBe('unmatched');
    // Never an empty list: "your entries are gone" is the one thing My Shows
    // must not imply.
    expect(result.entries).toEqual(all);
  });

  it('reports unmatched rather than empty when the exhibitor has no entries', () => {
    const result = applyEntryScope([], { showId: 'show-1', entryIds: ['e1'] });
    expect(result.kind).toBe('unmatched');
    expect(result.entries).toEqual([]);
  });
});

describe('clearEntryScopeParams', () => {
  it('drops both scope params and keeps everything else', () => {
    const next = clearEntryScopeParams(
      new URLSearchParams('showId=show-1&entryIds=e1&tab=completed')
    );
    expect(next.toString()).toBe('tab=completed');
  });

  it('does not mutate the params it was given', () => {
    const original = new URLSearchParams('showId=show-1');
    clearEntryScopeParams(original);
    expect(original.get('showId')).toBe('show-1');
  });
});
