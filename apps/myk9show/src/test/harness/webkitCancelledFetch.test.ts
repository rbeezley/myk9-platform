import { describe, expect, it } from 'vitest';
import type { AppApiRequestLedgerEntry } from './appApiRequestTracker';
import { accessControlErrorUrl, partitionCancelledWebkitFetchErrors } from './webkitCancelledFetch';

const CLUBS = 'http://127.0.0.1:54321/rest/v1/clubs?select=id&deleted_at=is.null';
const ORDERS = 'http://127.0.0.1:54321/rest/v1/stripe_orders?select=id&limit=100';

function entry(over: Partial<AppApiRequestLedgerEntry> = {}): AppApiRequestLedgerEntry {
  return {
    url: CLUBS,
    outcome: 'pending',
    failureText: null,
    orphanedByNavigation: false,
    ...over,
  };
}

const message = (url: string) => `Fetch API cannot load ${url} due to access control checks.`;
// The shape the nightly logs showed: the scheme was already gone.
const schemeless = (url: string) => `${url.replace('http:', '')} due to access control checks.`;

describe('accessControlErrorUrl', () => {
  it('reads the URL from either message shape and ignores other errors', () => {
    expect(accessControlErrorUrl(message(CLUBS))).toBe(CLUBS.replace('http://', ''));
    expect(accessControlErrorUrl(schemeless(CLUBS))).toBe(CLUBS.replace('http://', ''));
    expect(accessControlErrorUrl('TypeError: x is not a function')).toBeNull();
  });
});

describe('partitionCancelledWebkitFetchErrors', () => {
  it('ignores an error for a request the page aborted', () => {
    const result = partitionCancelledWebkitFetchErrors(
      [message(CLUBS)],
      [entry({ outcome: 'failed', failureText: 'cancelled' })],
      'webkit'
    );
    expect(result).toEqual({ kept: [], ignored: [message(CLUBS)] });
  });

  it('ignores an error for a request the outgoing document left in flight', () => {
    const result = partitionCancelledWebkitFetchErrors(
      [schemeless(CLUBS)],
      [entry({ orphanedByNavigation: true })],
      'webkit'
    );
    expect(result.kept).toEqual([]);
    expect(result.ignored).toHaveLength(1);
  });

  it('keeps an error with no ledger entry, a different URL, or a non-cancel outcome', () => {
    const errors = [message(CLUBS)];
    expect(partitionCancelledWebkitFetchErrors(errors, [], 'webkit').kept).toEqual(errors);
    expect(
      partitionCancelledWebkitFetchErrors(
        errors,
        [entry({ url: ORDERS, outcome: 'failed', failureText: 'cancelled' })],
        'webkit'
      ).kept
    ).toEqual(errors);
    expect(
      partitionCancelledWebkitFetchErrors(
        errors,
        [entry({ outcome: 'failed', failureText: 'Origin not allowed' })],
        'webkit'
      ).kept
    ).toEqual(errors);
    expect(
      partitionCancelledWebkitFetchErrors(errors, [entry({ outcome: 'finished' })], 'webkit').kept
    ).toEqual(errors);
  });

  it('keeps a request that completed even though a navigation boundary passed', () => {
    const errors = [message(CLUBS)];
    const done = entry({ orphanedByNavigation: true, outcome: 'finished' });
    expect(partitionCancelledWebkitFetchErrors(errors, [done], 'webkit').kept).toEqual(errors);
  });

  it('lets one cancelled request excuse only one error', () => {
    const result = partitionCancelledWebkitFetchErrors(
      [message(CLUBS), message(CLUBS)],
      [entry({ outcome: 'failed', failureText: 'cancelled' })],
      'webkit'
    );
    expect(result.ignored).toHaveLength(1);
    expect(result.kept).toHaveLength(1);
  });

  it('keeps unrelated page errors untouched', () => {
    const result = partitionCancelledWebkitFetchErrors(
      ['ReferenceError: boom'],
      [entry({ orphanedByNavigation: true })],
      'webkit'
    );
    expect(result.kept).toEqual(['ReferenceError: boom']);
  });

  it('never filters outside WebKit', () => {
    const errors = [message(CLUBS)];
    const ledger = [entry({ outcome: 'failed', failureText: 'cancelled' })];
    for (const browser of ['chromium', 'firefox', 'unknown']) {
      expect(partitionCancelledWebkitFetchErrors(errors, ledger, browser)).toEqual({
        kept: errors,
        ignored: [],
      });
    }
  });
});
