import { describe, expect, it } from 'vitest';
import {
  mostBlockingState,
  resolveReportReadiness,
  type ReadinessQuery,
  type ReportDataState,
} from '../reportReadiness';

const settled: ReadinessQuery = {
  hasData: true,
  isPlaceholderData: false,
  fetchStatus: 'idle',
  isError: false,
};
const q = (overrides: Partial<ReadinessQuery>): ReadinessQuery => ({ ...settled, ...overrides });
const online = { isOnline: true };
const offline = { isOnline: false };

describe('resolveReportReadiness — the rule table, row by row', () => {
  it('1: an out-of-show scope is an error, whatever the rows say', () => {
    expect(resolveReportReadiness([settled], { ...online, hasInvalidScope: true })).toBe('error');
  });

  it('2: a failed read is an error, even with rows present', () => {
    expect(resolveReportReadiness([settled, q({ isError: true })], online)).toBe('error');
  });

  it('3: placeholder rows from the previous selection are stale', () => {
    expect(resolveReportReadiness([q({ isPlaceholderData: true })], offline)).toBe('stale');
  });

  it('4: no rows and paused is unavailable (the offline message)', () => {
    expect(
      resolveReportReadiness([settled, q({ hasData: false, fetchStatus: 'paused' })], offline)
    ).toBe('unavailable');
  });

  it('5: no rows and pending or fetching is loading, online or off', () => {
    expect(resolveReportReadiness([q({ hasData: false, fetchStatus: 'fetching' })], online)).toBe(
      'loading'
    );
    expect(resolveReportReadiness([q({ hasData: false, fetchStatus: 'idle' })], offline)).toBe(
      'loading'
    );
  });

  it('6: settled rows being refetched ONLINE are refreshing', () => {
    expect(resolveReportReadiness([settled, q({ fetchStatus: 'fetching' })], online)).toBe(
      'refreshing'
    );
  });

  it('7: settled rows are ready while idle, paused, or refetching offline', () => {
    expect(resolveReportReadiness([settled], online)).toBe('ready');
    expect(resolveReportReadiness([q({ fetchStatus: 'paused' })], offline)).toBe('ready');
    expect(resolveReportReadiness([q({ fetchStatus: 'paused' })], online)).toBe('ready');
    expect(resolveReportReadiness([q({ fetchStatus: 'fetching' })], offline)).toBe('ready');
  });

  it('asks nothing of a report that needs no reads', () => {
    expect(resolveReportReadiness([], online)).toBe('ready');
  });
});

describe('mostBlockingState', () => {
  // Combining two resolved states must agree with resolving their queries
  // together, or Print and the preview could disagree about the same page.
  const samples: ReadinessQuery[] = [
    settled,
    q({ isError: true }),
    q({ isPlaceholderData: true }),
    q({ hasData: false, fetchStatus: 'paused' }),
    q({ hasData: false, fetchStatus: 'fetching' }),
    q({ fetchStatus: 'fetching' }),
    q({ fetchStatus: 'paused' }),
  ];

  it.each([online, offline])('agrees with resolving the union (%o)', context => {
    for (const a of samples) {
      for (const b of samples) {
        const combined: ReportDataState = mostBlockingState(
          resolveReportReadiness([a], context),
          resolveReportReadiness([b], context)
        );
        expect(combined).toBe(resolveReportReadiness([a, b], context));
      }
    }
  });
});
