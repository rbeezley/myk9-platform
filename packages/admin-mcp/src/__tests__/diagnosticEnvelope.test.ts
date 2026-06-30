import { describe, expect, it } from 'vitest';

import type { DiagnosticState } from '../diagnostics/types';
import { createDiagnosticResult } from '../diagnostics/types';

const ALL_STATES: DiagnosticState[] = [
  'found',
  'not_found',
  'ambiguous',
  'insufficient_data',
  'source_unavailable',
  'error',
];

describe('createDiagnosticResult', () => {
  it.each(ALL_STATES)('builds a valid envelope for state %s', (state) => {
    const result = createDiagnosticResult('staging', state);

    expect(result.state).toBe(state);
    expect(result.envLabel).toBe('staging');
    expect(result.summary).toEqual({});
    expect(result.evidence).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.limitations).toEqual([]);
  });

  it('stamps the provided env label on every result', () => {
    expect(createDiagnosticResult('local', 'found').envLabel).toBe('local');
    expect(createDiagnosticResult('production', 'found').envLabel).toBe('production');
  });

  it('preserves supplied summary, evidence, links, and limitations', () => {
    const result = createDiagnosticResult('local', 'found', {
      summary: { showId: 'abc' },
      evidence: [{ label: 'Status', value: 'open', source: 'shows.status' }],
      links: [{ label: 'Open', url: 'https://app.test/shows/abc' }],
      limitations: ['counts only'],
    });

    expect(result.summary).toEqual({ showId: 'abc' });
    expect(result.evidence).toHaveLength(1);
    expect(result.links[0]?.url).toBe('https://app.test/shows/abc');
    expect(result.limitations).toEqual(['counts only']);
  });
});
