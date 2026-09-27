import type { BenchmarkSample, NetworkProfile } from './benchmarkReport';
import type { BenchmarkRoute } from './benchmarkRoutes';

export interface PairSpec {
  runId: string;
  buildRef: string;
  showId: string;
  routeId: string;
  profile: NetworkProfile;
  repeat: number;
}

export interface PairResult extends PairSpec {
  samples: [BenchmarkSample, BenchmarkSample];
}

export function blockedPair(
  route: BenchmarkRoute,
  spec: PairSpec,
  reason: string
): [BenchmarkSample, BenchmarkSample] {
  const cold: BenchmarkSample = {
    routeId: route.id,
    role: route.role,
    path: route.path,
    profile: spec.profile,
    repeat: spec.repeat,
    cache: 'cold',
    status: 'blocked',
    reason,
  };
  return [cold, { ...cold, cache: 'warm', reason: `Second pass not attempted: ${reason}` }];
}

export function failedWorkerResult(
  route: BenchmarkRoute,
  spec: PairSpec,
  reason: string
): PairResult {
  return { ...spec, samples: blockedPair(route, spec, reason) };
}

export function validatePairResult(
  value: unknown,
  spec: PairSpec,
  route: BenchmarkRoute
): PairResult {
  if (!value || typeof value !== 'object') throw new Error('Missing pair result');
  const result = value as PairResult;
  for (const key of ['runId', 'buildRef', 'showId', 'routeId', 'profile', 'repeat'] as const) {
    if (result[key] !== spec[key]) throw new Error(`Pair result ${key} does not match manifest`);
  }
  if (!Array.isArray(result.samples) || result.samples.length !== 2)
    throw new Error('Pair result must have exactly two samples');
  for (const [index, sample] of result.samples.entries()) {
    if (
      sample.routeId !== route.id ||
      sample.role !== route.role ||
      sample.path !== route.path ||
      sample.profile !== spec.profile ||
      sample.repeat !== spec.repeat ||
      sample.cache !== (index === 0 ? 'cold' : 'warm') ||
      !['measured', 'blocked'].includes(sample.status) ||
      (sample.status === 'measured' &&
        (typeof sample.timeToUsableMs !== 'number' || !Number.isFinite(sample.timeToUsableMs))) ||
      (sample.status === 'blocked' && !sample.reason)
    ) {
      throw new Error(`Pair sample ${index} does not match manifest`);
    }
  }
  return result;
}
