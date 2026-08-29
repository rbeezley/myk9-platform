import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserLoadResult } from './loadBrowserRunner';
import type { LoadEvidenceTarget } from './loadEvidence';
import type { LoadObservation, WorkflowFailureDetail } from './loadEvaluation';
import { percentile, type LoadMetricSamples } from './loadMetrics';
import type { LoadScenario } from './loadScenario';
import { scenarioSessionCount } from './loadScenario';
import {
  assertPlatformArtifactMatchesRun,
  type LoadPlatformArtifact,
} from './loadPlatformArtifact';
import { DISTRIBUTED_G9_SHARD_COUNT, type LoadShard } from './loadShard';
import { calculatePeakActiveWorkflows } from './loadSessionLifecycle';

const MAX_START_SKEW_MS = 5_000;

export interface LoadShardArtifact {
  schemaVersion: 2;
  runId: string;
  startAtMs: number;
  startedAtMs: number;
  elapsedMs: number;
  shard: {
    count: number;
    index: number;
  };
  assignmentSequences: readonly number[];
  target: LoadEvidenceTarget;
  scenarioId: LoadScenario['id'];
  observation: LoadObservation;
  samples: LoadMetricSamples;
}

export function buildLoadShardArtifact(input: {
  shard: LoadShard;
  target: LoadEvidenceTarget;
  scenario: LoadScenario;
  result: BrowserLoadResult;
}): LoadShardArtifact {
  return {
    schemaVersion: 2,
    runId: input.shard.runId,
    startAtMs: input.result.startAtMs,
    startedAtMs: input.result.startedAtMs,
    elapsedMs: input.result.elapsedMs,
    shard: { count: input.shard.count, index: input.shard.index },
    assignmentSequences: input.result.assignmentSequences,
    target: input.target,
    scenarioId: input.scenario.id,
    observation: input.result.observation,
    samples: input.result.samples,
  };
}

export function writeLoadShardArtifact(
  artifact: LoadShardArtifact,
  directory = process.env.LOAD_TEST_SHARD_OUTPUT_DIR ??
    resolve(process.cwd(), 'test-results/load-shards')
): string {
  mkdirSync(directory, { recursive: true });
  const outputPath = resolve(directory, `shard-${artifact.shard.index}.json`);
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return outputPath;
}

export function aggregateLoadShardArtifacts(
  artifacts: readonly LoadShardArtifact[],
  scenario: LoadScenario,
  // Undefined when the sampler job produced nothing. Evidence for a full set of
  // valid shards is expensive and one-shot against shared staging, so a missing
  // sampler degrades to a recorded FAIL rather than destroying the whole run.
  platformArtifact: LoadPlatformArtifact | undefined
): { target: LoadEvidenceTarget; observation: LoadObservation } {
  validateArtifacts(artifacts, scenario);
  if (platformArtifact) {
    assertPlatformArtifactMatchesRun(platformArtifact, {
      runId: artifacts[0].runId,
      startAtMs: artifacts[0].startAtMs,
    });
  }
  const observations = artifacts.map(artifact => artifact.observation);
  const requestCount = sum(observations, observation => observation.requestCount);
  const failedRequestCount = sum(observations, observation => observation.failedRequestCount);
  const workflowFailures = sum(observations, observation => observation.workflowFailures);
  const workflowFailureDetails = mergeWorkflowFailureDetails(
    observations.flatMap(observation => [...observation.workflowFailureDetails])
  );
  const availabilityDenominator = requestCount + workflowFailures;
  const failures = failedRequestCount + workflowFailures;
  const elapsedMs = Math.max(...artifacts.map(artifact => artifact.elapsedMs));
  const samples = {
    scoring: artifacts.flatMap(artifact => [...artifact.samples.scoringDurationsMs]),
    api: artifacts.flatMap(artifact => [...artifact.samples.apiDurationsMs]),
    page: artifacts.flatMap(artifact => [...artifact.samples.pageDurationsMs]),
  };
  const platform = platformArtifact?.platform;
  const activityIntervals = observations.flatMap(observation => [
    ...observation.sessionLifecycle.activityIntervals,
  ]);
  const globalPeaks = calculatePeakActiveWorkflows(activityIntervals);
  const sessionLifecycle = {
    configuredSessions: sum(
      observations,
      observation => observation.sessionLifecycle.configuredSessions
    ),
    preparedSessions: sum(
      observations,
      observation => observation.sessionLifecycle.preparedSessions
    ),
    startedWorkflows: sum(
      observations,
      observation => observation.sessionLifecycle.startedWorkflows
    ),
    completedWorkflows: sum(
      observations,
      observation => observation.sessionLifecycle.completedWorkflows
    ),
    failedWorkflows: sum(observations, observation => observation.sessionLifecycle.failedWorkflows),
    peakActiveWorkflows: globalPeaks.total,
    configuredRingsideSessions: sum(
      observations,
      observation => observation.sessionLifecycle.configuredRingsideSessions
    ),
    preparedRingsideSessions: sum(
      observations,
      observation => observation.sessionLifecycle.preparedRingsideSessions
    ),
    startedRingsideWorkflows: sum(
      observations,
      observation => observation.sessionLifecycle.startedRingsideWorkflows
    ),
    completedRingsideWorkflows: sum(
      observations,
      observation => observation.sessionLifecycle.completedRingsideWorkflows
    ),
    failedRingsideWorkflows: sum(
      observations,
      observation => observation.sessionLifecycle.failedRingsideWorkflows
    ),
    peakActiveRingsideWorkflows: globalPeaks.ringside,
    activityIntervals,
  };
  const generator = {
    shards: observations
      .flatMap(observation => [...observation.generator.shards])
      .sort((left, right) => left.shardIndex - right.shardIndex),
  };

  return {
    target: artifacts[0].target,
    observation: {
      concurrentSessions: sum(observations, observation => observation.concurrentSessions),
      ringsideSessions: sum(observations, observation => observation.ringsideSessions),
      sessionLifecycle,
      generator,
      requestCount,
      failedRequestCount,
      workflowFailures,
      workflowFailureDetails,
      scoringWriteP95Ms: percentile(samples.scoring, 95),
      apiP95Ms: percentile(samples.api, 95),
      pageP95Ms: percentile(samples.page, 95),
      errorRate: availabilityDenominator === 0 ? 1 : failures / availabilityDenominator,
      throughputRps: requestCount / Math.max(elapsedMs / 1_000, 1),
      availabilityPercent:
        availabilityDenominator === 0
          ? 0
          : ((availabilityDenominator - failures) / availabilityDenominator) * 100,
      scoringWriteAttempts: sum(observations, observation => observation.scoringWriteAttempts),
      serializationFailures: sum(observations, observation => observation.serializationFailures),
      retryAttempts: sum(observations, observation => observation.retryAttempts),
      retrySuccesses: sum(observations, observation => observation.retrySuccesses),
      exhaustedRetries: sum(observations, observation => observation.exhaustedRetries),
      maxReplicationQueueDepth: Math.max(
        ...observations.map(observation => observation.maxReplicationQueueDepth)
      ),
      finalReplicationQueueDepth: sum(
        observations,
        observation => observation.finalReplicationQueueDepth
      ),
      queueTelemetryFailures: sum(observations, observation => observation.queueTelemetryFailures),
      expectedPersistedScores: sum(
        observations,
        observation => observation.expectedPersistedScores
      ),
      persistedScores: observations.every(
        observation =>
          Number.isSafeInteger(observation.persistedScores) &&
          observation.persistedScores !== null &&
          observation.persistedScores >= 0
      )
        ? sum(observations, observation => observation.persistedScores ?? 0)
        : null,
      persistenceFailures: artifacts.flatMap(artifact =>
        (artifact.observation.persistenceFailures ?? []).map(failure => ({
          ...failure,
          shardIndex: artifact.shard.index,
        }))
      ),
      platform,
    },
  };
}

function mergeWorkflowFailureDetails(
  details: readonly WorkflowFailureDetail[]
): WorkflowFailureDetail[] {
  const merged = new Map<string, WorkflowFailureDetail>();
  for (const detail of details) {
    const key = JSON.stringify([detail.workload, detail.route, detail.message]);
    const existing = merged.get(key);
    if (existing) existing.count += detail.count;
    else merged.set(key, { ...detail });
  }
  return [...merged.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.workload.localeCompare(right.workload) ||
      left.route.localeCompare(right.route) ||
      left.message.localeCompare(right.message)
  );
}

function validateArtifacts(artifacts: readonly LoadShardArtifact[], scenario: LoadScenario): void {
  if (artifacts.length !== DISTRIBUTED_G9_SHARD_COUNT) {
    throw new Error(`Expected exactly ${DISTRIBUTED_G9_SHARD_COUNT} load shard artifacts.`);
  }
  const first = artifacts[0];
  const indexes = new Set<number>();
  const sequences: number[] = [];

  for (const artifact of artifacts) {
    if (
      artifact.schemaVersion !== 2 ||
      artifact.shard.count !== DISTRIBUTED_G9_SHARD_COUNT ||
      artifact.runId !== first.runId ||
      artifact.startAtMs !== first.startAtMs ||
      artifact.scenarioId !== scenario.id ||
      JSON.stringify(artifact.target) !== JSON.stringify(first.target)
    ) {
      throw new Error('Load shard manifests do not describe one synchronized rehearsal.');
    }
    if (
      artifact.observation.generator?.shards.length !== 1 ||
      artifact.observation.generator.shards[0]?.shardIndex !== artifact.shard.index
    ) {
      throw new Error(`Load shard ${artifact.shard.index} generator evidence was missing.`);
    }
    if (Math.abs(artifact.startedAtMs - artifact.startAtMs) > MAX_START_SKEW_MS) {
      throw new Error(`Load shard ${artifact.shard.index} missed the synchronized start.`);
    }
    if (indexes.has(artifact.shard.index)) {
      throw new Error(`Duplicate load shard index ${artifact.shard.index}.`);
    }
    indexes.add(artifact.shard.index);
    sequences.push(...artifact.assignmentSequences);
    // Telemetry moved to its own runner: a shard that samples the database while
    // also driving browser contexts saturates itself, which invalidates the
    // latency attribution the sampling exists to support.
    if (artifact.observation.platform) {
      throw new Error(
        `Load shard ${artifact.shard.index} collected platform telemetry; sampling belongs to the dedicated runner.`
      );
    }
  }

  const expectedSequences = Array.from(
    { length: scenarioSessionCount(scenario) },
    (_, index) => index
  );
  if (
    JSON.stringify([...sequences].sort((left, right) => left - right)) !==
    JSON.stringify(expectedSequences)
  ) {
    throw new Error('Load shard assignments were missing, duplicated, or out of range.');
  }
}

function sum<T>(values: readonly T[], select: (value: T) => number): number {
  return values.reduce((total, value) => total + select(value), 0);
}

/**
 * Shards whose measurement windows differ structurally cannot be aggregated.
 *
 * `aggregateShards` divides throughput by `Math.max(elapsedMs)` and merges every
 * shard's samples into one percentile. Both assume the shards measured the same
 * window. On 2026-08-28 they did not — five ran the scenario's full 600 s while
 * eleven exited between 85 s and 158 s, because a shard stopped as soon as its
 * browser sessions settled rather than at the scenario boundary. The aggregate
 * reported a single p95 over windows differing by 7x and nothing flagged it.
 *
 * The runner no longer ends early, so this is the guard that keeps the claim
 * honest if it ever regresses: it fails the evidence rather than averaging it.
 *
 * Tolerance is proportional, not absolute: shards never stop on the same
 * millisecond, and a fixed millisecond bar would either flag ordinary jitter on a
 * short scenario or miss a real split on a long one.
 */
const SHARD_WINDOW_TOLERANCE = 0.1;

export function shardWindowDivergence(elapsedMsPerShard: readonly number[]): string | undefined {
  const windows = elapsedMsPerShard.filter(value => Number.isFinite(value) && value > 0);
  if (windows.length < 2) return undefined;

  const longest = Math.max(...windows);
  const shortest = Math.min(...windows);
  if (longest - shortest <= longest * SHARD_WINDOW_TOLERANCE) return undefined;

  return (
    `Shard measurement windows diverged: shortest ${shortest} ms, longest ${longest} ms ` +
    `(tolerance ${SHARD_WINDOW_TOLERANCE * 100}%). Percentiles and throughput aggregated ` +
    `across unequal windows do not describe one load.`
  );
}
