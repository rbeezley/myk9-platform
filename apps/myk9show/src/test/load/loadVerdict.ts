import type { LoadEvaluation, PlatformObservation } from './loadEvaluation';

/**
 * A run whose telemetry covered too little of the window proves nothing in
 * either direction: a pass would be unearned and a threshold fail would blame
 * the app for what may be the sampler's own outage (run 39390552156: 14.3% of
 * resource samples landed while the project itself was down). 80% is the point
 * where a missed spike is more likely noise than a hidden breach.
 */
export const MIN_PLATFORM_COVERAGE_PERCENT = 80;

export type LoadVerdict = 'pass' | 'fail' | 'no-verdict';

export interface SamplingCounts {
  readonly attempts: number;
  readonly succeeded: number;
}

/** Percent of attempts that succeeded, or undefined when nothing was attempted. */
export function coveragePercent(sampling: SamplingCounts | undefined): number | undefined {
  if (!sampling || !(sampling.attempts > 0) || !Number.isFinite(sampling.succeeded)) {
    return undefined;
  }
  return (Math.min(sampling.succeeded, sampling.attempts) / sampling.attempts) * 100;
}

export function platformCoverage(
  platform: Pick<PlatformObservation, 'resourceSampling' | 'connectionSampling'>
): {
  resourceCoveragePercent?: number;
  connectionCoveragePercent?: number;
} {
  const resource = coveragePercent(platform.resourceSampling);
  const connection = coveragePercent(platform.connectionSampling);
  return {
    ...(resource !== undefined ? { resourceCoveragePercent: resource } : {}),
    ...(connection !== undefined ? { connectionCoveragePercent: connection } : {}),
  };
}

/** Why the telemetry cannot support a verdict. Empty when it can (or is unjudgeable). */
export function noVerdictReasons(platform: PlatformObservation): string[] {
  const { resourceCoveragePercent, connectionCoveragePercent } = platformCoverage(platform);
  const reasons: string[] = [];
  const check = (label: string, percent: number | undefined, sampling?: SamplingCounts) => {
    if (percent === undefined || percent >= MIN_PLATFORM_COVERAGE_PERCENT) return;
    reasons.push(
      `${label} sampling covered ${percent.toFixed(1)}% of the window (${sampling?.succeeded ?? 0} of ${sampling?.attempts ?? 0}); ${MIN_PLATFORM_COVERAGE_PERCENT}% is required for a verdict.`
    );
  };
  check('Resource (CPU/IO)', resourceCoveragePercent, platform.resourceSampling);
  check('Connection', connectionCoveragePercent, platform.connectionSampling);
  return reasons;
}

export function verdictOf(input: {
  failures: readonly string[];
  noVerdictReasons: readonly string[];
}): LoadVerdict {
  // A real threshold miss is a fail whatever the coverage: low coverage cannot
  // un-fail an error rate the shards measured themselves.
  if (input.failures.length > 0) return 'fail';
  return input.noVerdictReasons.length > 0 ? 'no-verdict' : 'pass';
}

/** Appends gating failures found outside evaluateLoadResult and keeps the verdict coherent. */
export function appendGatingFailures(
  evaluation: LoadEvaluation,
  messages: readonly string[]
): void {
  if (messages.length === 0) return;
  evaluation.failures.push(...messages);
  evaluation.passed = false;
  evaluation.verdict = verdictOf(evaluation);
}

export function verdictLabel(verdict: LoadVerdict): string {
  return verdict === 'no-verdict' ? 'NO VERDICT' : verdict.toUpperCase();
}
