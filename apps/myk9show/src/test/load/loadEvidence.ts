import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LoadEvaluation, LoadObservation } from './loadEvaluation';
import {
  scenarioRingsideSessionCount,
  scenarioSessionCount,
  type LoadScenario,
} from './loadScenario';
import type { ResolvedLoadTarget } from './loadTarget';
import { LOAD_SHOW_ENTRY_COUNT } from './loadFixture';

export type LoadEvidenceTarget = Pick<
  ResolvedLoadTarget,
  'mode' | 'projectRef' | 'computeTier' | 'gateEligible'
>;

export interface LoadRunEvidence {
  schemaVersion: 1;
  generatedAt: string;
  target: {
    mode: ResolvedLoadTarget['mode'];
    projectRef: string;
    computeTier: string;
    gateEligible: boolean;
  };
  seedSize: typeof LOAD_SHOW_ENTRY_COUNT;
  scenario: {
    id: LoadScenario['id'];
    browserBehaviorVersion: LoadScenario['browserBehaviorVersion'];
    durationMs: number;
    configuredSessions: number;
    configuredRingsideSessions: number;
  };
  supportedCeiling: string;
  observation: LoadObservation;
  evaluation: LoadEvaluation;
}

export function buildLoadEvidence(input: {
  target: LoadEvidenceTarget;
  scenario: LoadScenario;
  observation: LoadObservation;
  evaluation: LoadEvaluation;
  generatedAt?: string;
}): LoadRunEvidence {
  const configuredRingsideSessions = scenarioRingsideSessionCount(input.scenario);
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    target: {
      mode: input.target.mode,
      projectRef: input.target.projectRef,
      computeTier: input.target.computeTier,
      gateEligible: input.target.gateEligible,
    },
    seedSize: LOAD_SHOW_ENTRY_COUNT,
    scenario: {
      id: input.scenario.id,
      browserBehaviorVersion: input.scenario.browserBehaviorVersion,
      durationMs: input.scenario.durationMs,
      configuredSessions: scenarioSessionCount(input.scenario),
      configuredRingsideSessions,
    },
    supportedCeiling: `${configuredRingsideSessions} concurrent ringside sessions on a show of ${LOAD_SHOW_ENTRY_COUNT} entries`,
    observation: input.observation,
    evaluation: input.evaluation,
  };
}

export function renderLoadEvidenceMarkdown(evidence: LoadRunEvidence): string {
  const result = evidence.evaluation.passed ? 'PASS' : 'FAIL';
  const failures =
    evidence.evaluation.failures.length === 0
      ? '- None'
      : evidence.evaluation.failures.map(failure => `- ${failure}`).join('\n');
  const platform = evidence.observation.platform;
  const workflowFailures =
    evidence.observation.workflowFailureDetails.length === 0
      ? '- None'
      : evidence.observation.workflowFailureDetails
          .map(
            detail => `- ${detail.workload} ×${detail.count} — ${detail.message} (${detail.route})`
          )
          .join('\n');

  return `# MYK9-109 load rehearsal evidence

- Result: ${result}
- Generated: ${evidence.generatedAt}
- Target: ${evidence.target.mode} / ${evidence.target.projectRef}
- Compute tier: ${evidence.target.computeTier}
- Scenario: ${evidence.scenario.id}, ${evidence.scenario.durationMs} ms
- Browser behavior: ${evidence.scenario.browserBehaviorVersion}
- Seed: ${evidence.seedSize} entries
- Supported ceiling: ${evidence.supportedCeiling}
- Measured peak sessions: ${evidence.observation.concurrentSessions}
- Measured peak ringside sessions: ${evidence.observation.ringsideSessions}
- Scoring/API p95: ${evidence.observation.scoringWriteP95Ms} / ${evidence.observation.apiP95Ms} ms
- Page p95 (informational until runner headroom is measured): ${evidence.observation.pageP95Ms} ms
- Requests/failures/workflow failures: ${evidence.observation.requestCount} / ${evidence.observation.failedRequestCount} / ${evidence.observation.workflowFailures}
- Error rate / throughput / availability: ${evidence.observation.errorRate} / ${evidence.observation.throughputRps} rps / ${evidence.observation.availabilityPercent}%
- SQLSTATE 40001: ${evidence.observation.serializationFailures} / ${evidence.observation.scoringWriteAttempts} (${evidence.evaluation.derived.serializationFailureRate})
- Retries attempted/succeeded/exhausted: ${evidence.observation.retryAttempts} / ${evidence.observation.retrySuccesses} / ${evidence.observation.exhaustedRetries}
- Replication queue max/final: ${evidence.observation.maxReplicationQueueDepth} / ${evidence.observation.finalReplicationQueueDepth}
- Replication queue telemetry failures: ${evidence.observation.queueTelemetryFailures}
- Persisted scores expected/observed: ${evidence.observation.expectedPersistedScores} / ${evidence.observation.persistedScores}
- Platform CPU/IO peak: ${platform?.peakCpuPercent ?? 'missing'} / ${platform?.peakIoPercent ?? 'missing'}%
- Database connections peak/cap: ${platform?.peakConnections ?? 'missing'} / ${platform?.connectionCap ?? 'missing'}
- pg_stat_statements deltas: ${platform?.statementDeltas.length ?? 0}

## Workflow failure details

${workflowFailures}

## Failures

${failures}
`;
}

export function writeLoadEvidence(
  evidence: LoadRunEvidence,
  directory = process.env.LOAD_TEST_EVIDENCE_DIR ??
    resolve(process.cwd(), '../../openspec/changes/repair-load-rehearsal-harness/evidence')
): { jsonPath: string; markdownPath: string } {
  mkdirSync(directory, { recursive: true });
  const timestamp = evidence.generatedAt.replace(/[:.]/g, '-');
  const baseName = `${timestamp}-${evidence.scenario.id}`;
  const jsonPath = resolve(directory, `${baseName}.json`);
  const markdownPath = resolve(directory, `${baseName}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderLoadEvidenceMarkdown(evidence), 'utf8');
  return { jsonPath, markdownPath };
}
