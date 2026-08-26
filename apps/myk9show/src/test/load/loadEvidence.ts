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
import { assessGeneratorShard } from './loadGeneratorSampler';

export type LoadEvidenceTarget = Pick<
  ResolvedLoadTarget,
  'mode' | 'projectRef' | 'computeTier' | 'gateEligible'
>;

export interface LoadRunEvidence {
  schemaVersion: 2;
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
    schemaVersion: 2,
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
    supportedCeiling:
      input.evaluation.passed && input.target.gateEligible
        ? `${configuredRingsideSessions} concurrent ringside sessions on a show of ${LOAD_SHOW_ENTRY_COUNT} entries`
        : 'Not established',
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
  const lifecycle = evidence.observation.sessionLifecycle;
  const workflowFailures =
    evidence.observation.workflowFailureDetails.length === 0
      ? '- None'
      : evidence.observation.workflowFailureDetails
          .map(
            detail => `- ${detail.workload} ×${detail.count} — ${detail.message} (${detail.route})`
          )
          .join('\n');

  const generator = evidence.observation.generator.shards
    .map(shard => {
      const assessment = assessGeneratorShard(shard);
      const status = !assessment.complete
        ? 'INCOMPLETE'
        : assessment.saturated
          ? 'SATURATED'
          : 'HEALTHY';
      const reasons = assessment.reasons.length === 0 ? 'none' : assessment.reasons.join('; ');
      return `- Runner ${shard.shardIndex}: ${status} (${reasons})
  - Logical CPUs / duration: ${shard.logicalCpuCount} / ${shard.samplingDurationMs} ms
  - Sampling window: ${shard.samplingWindow ?? 'legacy / unspecified'}
  - CPU p95/peak: ${shard.hostCpuP95Percent} / ${shard.hostCpuPeakPercent}%
  - Memory peak / load-1m peak: ${shard.hostMemoryPeakPercent}% / ${shard.hostLoad1mPeak}
  - Event-loop p95/max: ${shard.eventLoopDelayP95Ms} / ${shard.eventLoopDelayMaxMs} ms
  - Browser control p95/max/attempts/failures: ${shard.browserControlP95Ms} / ${shard.browserControlMaxMs} ms / ${shard.browserControlAttempts} / ${shard.browserControlFailures}
  - Samples host/browser-success: ${shard.sampleCount} / ${shard.browserControlSamples}
  - Sampling coverage host/browser-attempt: ${shard.hostSampleCoveragePercent}% / ${shard.browserControlAttemptCoveragePercent}%
  - Context preparation / start headroom: ${shard.contextPreparationMs} / ${shard.startHeadroomMs} ms`;
    })
    .join('\n');

  return `# MYK9-109 / MYK9-126 load rehearsal evidence

- Result: ${result}
- Generated: ${evidence.generatedAt}
- Target: ${evidence.target.mode} / ${evidence.target.projectRef}
- Compute tier: ${evidence.target.computeTier}
- Scenario: ${evidence.scenario.id}, ${evidence.scenario.durationMs} ms
- Browser behavior: ${evidence.scenario.browserBehaviorVersion}
- Seed: ${evidence.seedSize} entries
- Supported ceiling: ${evidence.supportedCeiling}
- Prepared/open sessions: ${evidence.observation.concurrentSessions}
- Prepared/open ringside sessions: ${evidence.observation.ringsideSessions}
- Sessions configured/prepared/started/completed/failed/peak-active: ${lifecycle.configuredSessions} / ${lifecycle.preparedSessions} / ${lifecycle.startedWorkflows} / ${lifecycle.completedWorkflows} / ${lifecycle.failedWorkflows} / ${lifecycle.peakActiveWorkflows}
- Ringside configured/prepared/started/completed/failed/peak-active: ${lifecycle.configuredRingsideSessions} / ${lifecycle.preparedRingsideSessions} / ${lifecycle.startedRingsideWorkflows} / ${lifecycle.completedRingsideWorkflows} / ${lifecycle.failedRingsideWorkflows} / ${lifecycle.peakActiveRingsideWorkflows}
- Scoring/API p95: ${evidence.observation.scoringWriteP95Ms} / ${evidence.observation.apiP95Ms} ms
- Page p95 (interpret with generator evidence): ${evidence.observation.pageP95Ms} ms
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
- Backend-latency attribution from browser timings: ${evidence.evaluation.derived.generatorAttributionValid ? 'VALID' : 'INVALID — generator evidence was incomplete or saturated'}

## Generator evidence

${generator || '- Missing'}

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
