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

describe('resolveReportReadiness — the rule table, row by row', () => {
  it('1: an out-of-show scope is an error, whatever the rows say', () => {
    expect(resolveReportReadiness([settled], { hasInvalidScope: true })).toBe('error');
  });

  it('2: a failed read is an error, even with rows present', () => {
    expect(resolveReportReadiness([settled, q({ isError: true })])).toBe('error');
  });

  it('3: placeholder rows from the previous selection are stale', () => {
    expect(resolveReportReadiness([q({ isPlaceholderData: true })])).toBe('stale');
  });

  it('4: no rows and paused is unavailable (the offline message)', () => {
    expect(resolveReportReadiness([settled, q({ hasData: false, fetchStatus: 'paused' })])).toBe(
      'unavailable'
    );
  });

  it('5: no rows and pending or fetching is loading', () => {
    expect(resolveReportReadiness([q({ hasData: false, fetchStatus: 'fetching' })])).toBe(
      'loading'
    );
    expect(resolveReportReadiness([q({ hasData: false, fetchStatus: 'idle' })])).toBe('loading');
  });

  it('6: settled rows being re-read are refreshing, whatever the connectivity', () => {
    // Offline too: a replica re-read after a local change is replacing the rows.
    expect(resolveReportReadiness([settled, q({ fetchStatus: 'fetching' })])).toBe('refreshing');
  });

  it('7: settled rows are ready while every read is idle or paused', () => {
    expect(resolveReportReadiness([settled])).toBe('ready');
    expect(resolveReportReadiness([settled, q({ fetchStatus: 'paused' })])).toBe('ready');
  });

  it('asks nothing of a report that needs no reads', () => {
    expect(resolveReportReadiness([])).toBe('ready');
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

  it('agrees with resolving the union', () => {
    for (const a of samples) {
      for (const b of samples) {
        const combined: ReportDataState = mostBlockingState(
          resolveReportReadiness([a]),
          resolveReportReadiness([b])
        );
        expect(combined).toBe(resolveReportReadiness([a, b]));
      }
    }
  });
});
