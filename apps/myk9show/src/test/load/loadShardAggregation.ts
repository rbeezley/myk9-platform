import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserLoadResult } from './loadBrowserRunner';
import type { LoadEvidenceTarget } from './loadEvidence';
import type { LoadObservation } from './loadEvaluation';
import { percentile, type LoadMetricSamples } from './loadMetrics';
import type { LoadScenario } from './loadScenario';
import { scenarioSessionCount } from './loadScenario';
import type { LoadShard } from './loadShard';

const REQUIRED_SHARD_COUNT = 4;
const MAX_START_SKEW_MS = 5_000;

export interface LoadShardArtifact {
  schemaVersion: 1;
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
    schemaVersion: 1,
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
  scenario: LoadScenario
): { target: LoadEvidenceTarget; observation: LoadObservation } {
  validateArtifacts(artifacts, scenario);
  const observations = artifacts.map(artifact => artifact.observation);
  const requestCount = sum(observations, observation => observation.requestCount);
  const failedRequestCount = sum(observations, observation => observation.failedRequestCount);
  const workflowFailures = sum(observations, observation => observation.workflowFailures);
  const availabilityDenominator = requestCount + workflowFailures;
  const failures = failedRequestCount + workflowFailures;
  const elapsedMs = Math.max(...artifacts.map(artifact => artifact.elapsedMs));
  const samples = {
    scoring: artifacts.flatMap(artifact => [...artifact.samples.scoringDurationsMs]),
    api: artifacts.flatMap(artifact => [...artifact.samples.apiDurationsMs]),
    page: artifacts.flatMap(artifact => [...artifact.samples.pageDurationsMs]),
  };
  const platform = observations.find(observation => observation.platform)?.platform;

  return {
    target: artifacts[0].target,
    observation: {
      concurrentSessions: sum(observations, observation => observation.concurrentSessions),
      ringsideSessions: sum(observations, observation => observation.ringsideSessions),
      requestCount,
      failedRequestCount,
      workflowFailures,
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
      persistedScores: sum(observations, observation => observation.persistedScores),
      platform,
    },
  };
}

function validateArtifacts(artifacts: readonly LoadShardArtifact[], scenario: LoadScenario): void {
  if (artifacts.length !== REQUIRED_SHARD_COUNT) {
    throw new Error(`Expected exactly ${REQUIRED_SHARD_COUNT} load shard artifacts.`);
  }
  const first = artifacts[0];
  const indexes = new Set<number>();
  const sequences: number[] = [];
  let platformSamples = 0;

  for (const artifact of artifacts) {
    if (
      artifact.schemaVersion !== 1 ||
      artifact.shard.count !== REQUIRED_SHARD_COUNT ||
      artifact.runId !== first.runId ||
      artifact.startAtMs !== first.startAtMs ||
      artifact.scenarioId !== scenario.id ||
      JSON.stringify(artifact.target) !== JSON.stringify(first.target)
    ) {
      throw new Error('Load shard manifests do not describe one synchronized rehearsal.');
    }
    if (Math.abs(artifact.startedAtMs - artifact.startAtMs) > MAX_START_SKEW_MS) {
      throw new Error(`Load shard ${artifact.shard.index} missed the synchronized start.`);
    }
    if (indexes.has(artifact.shard.index)) {
      throw new Error(`Duplicate load shard index ${artifact.shard.index}.`);
    }
    indexes.add(artifact.shard.index);
    sequences.push(...artifact.assignmentSequences);
    if (artifact.observation.platform) {
      platformSamples += 1;
      if (artifact.shard.index !== 0) {
        throw new Error('Only load shard 0 may provide platform telemetry.');
      }
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
  if (platformSamples !== 1) {
    throw new Error('Distributed load requires exactly one platform telemetry sample.');
  }
}

function sum<T>(values: readonly T[], select: (value: T) => number): number {
  return values.reduce((total, value) => total + select(value), 0);
}
