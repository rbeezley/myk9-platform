import type { LoadRunEvidence } from './loadEvidence';
import { formatApiErrorCounts } from './loadErrorCodes';
import { MIN_PLATFORM_COVERAGE_PERCENT, verdictLabel, coveragePercent } from './loadVerdict';

function percent(value: number | undefined): string {
  return value === undefined ? 'missing' : `${value.toFixed(1)}%`;
}

/**
 * The GitHub step summary: what an operator reads before opening any artifact.
 * Leads with the verdict, and for NO VERDICT says why in the first lines, so a
 * run that could not be judged is never skimmed as a pass or a threshold fail.
 */
export function renderLoadStepSummary(evidence: LoadRunEvidence): string {
  const { evaluation, observation, scenario } = evidence;
  const platform = observation.platform;
  const lines = [
    `## G9 load rehearsal: ${verdictLabel(evaluation.verdict)}`,
    '',
    `- Size: ${scenario.configuredSessions} sessions (${scenario.configuredRingsideSessions} ringside)${evaluation.informational ? ', reduced size, cannot claim the G9 gate' : ''}`,
  ];
  if (evaluation.verdict === 'no-verdict') {
    lines.push(
      '',
      `**NO VERDICT.** Telemetry covered too little of the window to judge (${MIN_PLATFORM_COVERAGE_PERCENT}% required). This is neither a pass nor a threshold failure; re-run once the project is healthy.`,
      ...evaluation.noVerdictReasons.map(reason => `- ${reason}`)
    );
  }
  lines.push(
    '',
    '| Measure | Value |',
    '| --- | --- |',
    `| Resource sampling coverage | ${percent(platform?.resourceCoveragePercent ?? coveragePercent(platform?.resourceSampling))} |`,
    `| Connection sampling coverage | ${percent(platform?.connectionCoveragePercent ?? coveragePercent(platform?.connectionSampling))} |`,
    `| Requests / failed | ${observation.requestCount} / ${observation.failedRequestCount} |`,
    `| Error rate | ${observation.errorRate} |`,
    `| API p95 / scoring p95 | ${observation.apiP95Ms} / ${observation.scoringWriteP95Ms} ms |`,
    `| API errors by code | ${formatApiErrorCounts(observation.apiErrorCounts)} |`
  );
  if (evaluation.failures.length > 0) {
    lines.push('', '### Failures', ...evaluation.failures.map(failure => `- ${failure}`));
  }
  return `${lines.join('\n')}\n`;
}
