import { describe, it, expect } from 'vitest';
import { formatSyncFailureToast, formatDownloadFailureToast } from '../replicationSyncFormatters';

describe('formatSyncFailureToast', () => {
  it('renders the first failing mutation including its error detail', () => {
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

    expect(msg).toBe(
      "Failed to save 1 change. shows insert: new row violates row-level security policy for table 'shows'"
    );
  });

  it('pluralizes "changes" when more than one mutation failed', () => {
    const msg = formatSyncFailureToast({
      count: 3,
      mutations: [{ tableName: 'trials', operation: 'UPDATE' }],
      message: '',
    });

    expect(msg.startsWith('Failed to save 3 changes.')).toBe(true);
  });

  it('falls back to the generic message when no mutations are supplied', () => {
    const msg = formatSyncFailureToast({
      count: 2,
      mutations: [],
      message: 'Network unreachable',
    });

    expect(msg).toBe('Failed to save 2 changes. Network unreachable');
  });

  it('omits the trailing colon when a mutation has no error string', () => {
    const msg = formatSyncFailureToast({
      count: 1,
      mutations: [{ tableName: 'dogs', operation: 'DELETE' }],
      message: '',
    });

    expect(msg).toBe('Failed to save 1 change. dogs delete');
  });
});

describe('formatDownloadFailureToast', () => {
  it('names the first failing table and its error', () => {
    const msg = formatDownloadFailureToast([
      { name: 'shows', error: 'permission denied for table shows' },
    ]);

    expect(msg).toBe('Failed to load data from server. shows: permission denied for table shows');
  });

  it('indicates how many additional tables also failed', () => {
    const msg = formatDownloadFailureToast([
      { name: 'shows', error: 'RLS violation' },
      { name: 'trials', error: 'timeout' },
      { name: 'entries', error: 'network error' },
    ]);

    expect(msg).toBe('Failed to load data from server. shows: RLS violation (and 2 more)');
  });
});
