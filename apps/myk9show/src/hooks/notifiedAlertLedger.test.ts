import {
  NOTIFIED_ALERT_TTL_MS,
  alertKey,
  createNotifiedAlertLedger,
  notifiedAlertStorageKey,
} from './notifiedAlertLedger';

const DAY_MS = 24 * 60 * 60 * 1000;

function stored(userId: string): Record<string, number> {
  return JSON.parse(window.localStorage.getItem(notifiedAlertStorageKey(userId)) ?? '{}');
}

describe('notifiedAlertLedger', () => {
  it('remembers a mark across ledgers for the same user', () => {
    createNotifiedAlertLedger('user-a').mark(alertKey.resultsPosted('class-1'));

    expect(createNotifiedAlertLedger('user-a').has(alertKey.resultsPosted('class-1'))).toBe(true);
    expect(createNotifiedAlertLedger('user-b').has(alertKey.resultsPosted('class-1'))).toBe(false);
  });

  it('prunes records older than 30 days when a ledger opens', () => {
    const start = 1_000_000_000_000;
    const ledger = createNotifiedAlertLedger('user-a', () => start);
    ledger.mark('old');
    const fresh = createNotifiedAlertLedger('user-a', () => start + 20 * DAY_MS);
    fresh.mark('recent');

    const later = createNotifiedAlertLedger('user-a', () => start + NOTIFIED_ALERT_TTL_MS + 1);

    expect(Object.keys(stored('user-a'))).toEqual(['recent']);
    expect(later.has('old')).toBe(false);
    expect(later.has('recent')).toBe(true);
  });

  it('persists nothing without a user id', () => {
    const ledger = createNotifiedAlertLedger(null);
    ledger.mark('k');

    expect(ledger.has('k')).toBe(true);
    expect(window.localStorage.length).toBe(0);
  });

  it('ignores a corrupt stored record', () => {
    window.localStorage.setItem(notifiedAlertStorageKey('user-a'), '{"k":"not-a-time"');

    expect(createNotifiedAlertLedger('user-a').has('k')).toBe(false);
  });
});
