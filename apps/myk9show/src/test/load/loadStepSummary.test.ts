import { describe, expect, it } from 'vitest';
import type { LoadRunEvidence } from './loadEvidence';
import { renderLoadStepSummary } from './loadStepSummary';

function evidence(overrides: Partial<LoadRunEvidence['evaluation']>): LoadRunEvidence {
  return {
    scenario: { configuredSessions: 100, configuredRingsideSessions: 6 },
    observation: {
      requestCount: 1000,
      failedRequestCount: 12,
      errorRate: 0.012,
      apiP95Ms: 180,
      scoringWriteP95Ms: 150,
      apiErrorCounts: [{ status: 503, code: 'PGRST003', count: 9 }],
      platform: {
        resourceSampling: { attempts: 14, succeeded: 2, failures: [] },
        connectionSampling: { attempts: 450, succeeded: 450 },
      },
    },
    evaluation: {
      verdict: 'pass',
      passed: true,
      informational: true,
      failures: [],
      noVerdictReasons: [],
      ...overrides,
    },
  } as unknown as LoadRunEvidence;
}

describe('step summary', () => {
  it('leads a no-verdict run with NO VERDICT and why', () => {
    const summary = renderLoadStepSummary(
      evidence({
        verdict: 'no-verdict',
        passed: false,
        noVerdictReasons: ['Resource (CPU/IO) sampling covered 14.3% of the window (2 of 14).'],
      })
    );
    expect(summary.split('\n')[0]).toBe('## G9 load rehearsal: NO VERDICT');
    expect(summary).toContain('14.3% of the window');
    expect(summary).toContain('neither a pass nor a threshold failure');
    expect(summary).toContain('| Resource sampling coverage | 14.3% |');
    expect(summary).toContain('| Connection sampling coverage | 100.0% |');
    expect(summary).toContain('PGRST003 (HTTP 503) x9');
    expect(summary).toContain('100 sessions (6 ringside), reduced size');
  });

  it('lists failures on a fail and omits the no-verdict banner', () => {
    const summary = renderLoadStepSummary(
      evidence({
        verdict: 'fail',
        passed: false,
        failures: ['Error rate exceeded or was missing.'],
      })
    );
    expect(summary).toContain('## G9 load rehearsal: FAIL');
    expect(summary).toContain('- Error rate exceeded or was missing.');
    expect(summary).not.toContain('NO VERDICT');
  });
});
