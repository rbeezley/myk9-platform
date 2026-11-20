import { describe, expect, it } from 'vitest';
import { settledScopesOutcome } from './atShowSyncOutcome';

const ok = { tableName: 't', success: true };
const short = {
  tableName: 'entries',
  success: false,
  shortReplica: { tableName: 'entries', scope: 'show-1', serverCount: 3, deviceCount: 1 },
};
const denied = { tableName: 'classes', success: false, error: 'denied' };
const fulfilled = (value: unknown): PromiseSettledResult<unknown> => ({
  status: 'fulfilled',
  value,
});

describe('settledScopesOutcome short downloads (MYK9-2254)', () => {
  it('is successful when every scope is', () => {
    expect(settledScopesOutcome(ok, [fulfilled(ok)])).toEqual({ success: true });
  });

  it('is unsuccessful but short-only when the only failures are short downloads', () => {
    expect(settledScopesOutcome(ok, [fulfilled(short), fulfilled(ok)])).toEqual({
      success: false,
      shortOnly: true,
    });
  });

  it('still reports a genuine failure, even beside a short one', () => {
    expect(settledScopesOutcome(ok, [fulfilled(short), fulfilled(denied)])).toEqual({
      success: false,
    });
    expect(settledScopesOutcome(denied, [fulfilled(ok)])).toEqual({ success: false });
  });
});
