import { describe, expect, it } from 'vitest';
import { failedWorkerResult, validatePairResult, type PairSpec } from './benchmarkRun';
import type { BenchmarkRoute } from './benchmarkRoutes';

const spec: PairSpec = {
  runId: 'run-1',
  buildRef: 'abc',
  showId: 'show-1',
  routeId: 'home',
  profile: 'fast-4g-mobile',
  repeat: 1,
};
const route: BenchmarkRoute = { id: 'home', role: 'public', path: '/', readySelector: 'h1' };
const cold = {
  routeId: 'home',
  role: 'public',
  path: '/',
  profile: 'fast-4g-mobile',
  repeat: 1,
  cache: 'cold',
  status: 'measured',
  timeToUsableMs: 1000,
};
const warm = { ...cold, cache: 'warm' };

describe('performance pair manifest validation', () => {
  it('accepts exactly one cold and one warm sample for this run', () => {
    expect(
      validatePairResult({ ...spec, samples: [cold, warm] }, spec, route).samples
    ).toHaveLength(2);
  });
  it('rejects results from another build', () => {
    expect(() =>
      validatePairResult({ ...spec, buildRef: 'other', samples: [cold, warm] }, spec, route)
    ).toThrow('buildRef');
  });
  it('rejects duplicate cold samples and a partial pair', () => {
    expect(() => validatePairResult({ ...spec, samples: [cold, cold] }, spec, route)).toThrow(
      'sample 1'
    );
    expect(() => validatePairResult({ ...spec, samples: [cold] }, spec, route)).toThrow(
      'exactly two'
    );
  });
  it('records a failed worker as two blocked attempts without inventing load times', () => {
    const failed = failedWorkerResult(route, spec, 'worker exit 1');
    const samples = failed.samples;
    expect(validatePairResult({ ...spec, samples }, spec, route).samples).toEqual([
      expect.objectContaining({ cache: 'cold', status: 'blocked', reason: 'worker exit 1' }),
      expect.objectContaining({ cache: 'warm', status: 'blocked' }),
    ]);
    expect(samples[0].timeToUsableMs).toBeUndefined();
    expect(samples[1].reason).toContain('Warm run not attempted');
  });
});
