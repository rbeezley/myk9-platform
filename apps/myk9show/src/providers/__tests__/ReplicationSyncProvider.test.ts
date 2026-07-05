import { describe, it, expect } from 'vitest';
import { formatSyncFailureToast, formatDownloadFailureToast } from '../replicationSyncFormatters';

describe('formatSyncFailureToast', () => {
  it('renders a plain-English object and action without raw DB details', () => {
    const msg = formatSyncFailureToast({
      count: 1,
      mutations: [
        {
          tableName: 'shows',
          operation: 'INSERT',
          error: "new row violates row-level security policy for table 'shows'",
        },
      ],
      message: 'generic fallback',
    });

    expect(msg).toBe("We couldn't create this show. Retry or discard this change.");
    expect(msg).not.toMatch(/row-level security|table|shows insert/i);
  });

  it('pluralizes "changes" when more than one mutation failed', () => {
    const msg = formatSyncFailureToast({
      count: 3,
      mutations: [{ tableName: 'trials', operation: 'UPDATE' }],
      message: '',
    });

    expect(msg).toBe("We couldn't save 3 changes. Retry or discard these changes.");
  });

  it('keeps multiple failures plain even when no mutations are supplied', () => {
    const msg = formatSyncFailureToast({
      count: 2,
      mutations: [],
      message: 'Network unreachable',
    });

    expect(msg).toBe("We couldn't save 2 changes. Retry or discard these changes.");
  });

  it('uses the object label when a mutation has no error string', () => {
    const msg = formatSyncFailureToast({
      count: 1,
      mutations: [{ tableName: 'dogs', operation: 'DELETE' }],
      message: '',
    });

    expect(msg).toBe("We couldn't delete this dog. Retry or discard this change.");
  });

  it('does not leak RPC, Supabase, or retry-internal language', () => {
    const msg = formatSyncFailureToast({
      count: 1,
      mutations: [
        {
          tableName: 'entries',
          operation: 'UPDATE',
          error: 'Supabase query failed: ringside_update_entry timed out after retry 3',
        },
      ],
      message: '',
    });

    expect(msg).toBe("We couldn't update this entry. Retry or discard this change.");
    expect(msg).not.toMatch(/supabase|rpc|ringside_update_entry|retry 3|timeout/i);
  });
});

describe('formatDownloadFailureToast', () => {
  it('names the first failing object without raw server details', () => {
    const msg = formatDownloadFailureToast([
      { name: 'shows', error: 'permission denied for table shows' },
    ]);

    expect(msg).toBe(
      "We couldn't refresh show data. You can keep using the saved copy while we try again."
    );
    expect(msg).not.toMatch(/permission denied|table shows/i);
  });

  it('indicates how many additional tables also failed', () => {
    const msg = formatDownloadFailureToast([
      { name: 'shows', error: 'RLS violation' },
      { name: 'trials', error: 'timeout' },
      { name: 'entries', error: 'network error' },
    ]);

    expect(msg).toBe(
      "We couldn't refresh show data. You can keep using the saved copy while we try again. 2 more areas also need to refresh."
    );
  });

  it('uses singular grammar for one additional failing table', () => {
    const msg = formatDownloadFailureToast([
      { name: 'shows', error: 'RLS violation' },
      { name: 'trials', error: 'timeout' },
    ]);

    expect(msg).toBe(
      "We couldn't refresh show data. You can keep using the saved copy while we try again. 1 more area also needs to refresh."
    );
  });
});
