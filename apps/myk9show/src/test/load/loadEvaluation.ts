import {
  scenarioRingsideSessionCount,
  scenarioSessionCount,
  type LoadScenario,
  type LoadWorkloadKind,
} from './loadScenario';
import { assessGeneratorShard, type GeneratorShardObservation } from './loadGeneratorSampler';
import {
  calculatePeakActiveWorkflows,
  type LoadSessionLifecycleObservation,
} from './loadSessionLifecycle';
import { DISTRIBUTED_G9_SHARD_COUNT } from './loadShard';
import type { PersistenceFailure } from './loadPersistence';

export interface ResourceSamplingFailure {
  kind: 'http' | 'timeout' | 'transport' | 'invalid-counters';
  status?: number;
  count: number;
}

export interface StatementDelta {
  queryId: string;
  calls: number;
  rows: number;
  totalExecTimeMs: number;
  meanExecTimeMs: number;
}

export interface PlatformObservation {
  peakCpuPercent: number;
  peakIoPercent: number;
  peakConnections: number;
  connectionCap: number;
  statementDeltas: readonly StatementDelta[];
  resourceSampling?: {
    attempts: number;
    succeeded: number;
    /** Rescued transient blips. A trace that the Metrics API was degrading. */
    retried?: number;
    failures: readonly ResourceSamplingFailure[];
  };
  /**
   * Connection probes stay zero-tolerance — any miss withholds the peak — but the
   * counts still travel with the observation so an operator can see how much of
   * the window was actually observed rather than inferring it from a bare NaN.
   */
  connectionSampling?: {
    attempts: number;
    succeeded: number;
  };
}

export interface WorkflowFailureDetail {
  workload: LoadWorkloadKind;
  route: string;
  message: string;
  count: number;
}

export interface LoadObservation {
  concurrentSessions: number;
  ringsideSessions: number;
  sessionLifecycle: LoadSessionLifecycleObservation;
  generator: {
    shards: readonly GeneratorShardObservation[];
  };
  requestCount: number;
  failedRequestCount: number;
  workflowFailures: number;
  workflowFailureDetails: readonly WorkflowFailureDetail[];
  scoringWriteP95Ms: number;
  apiP95Ms: number;
  pageP95Ms: number;
  errorRate: number;
  throughputRps: number;
  availabilityPercent: number;
  scoringWriteAttempts: number;
  serializationFailures: number;
  retryAttempts: number;
  retrySuccesses: number;
  exhaustedRetries: number;
  maxReplicationQueueDepth: number;
  finalReplicationQueueDepth: number;
  queueTelemetryFailures: number;
  expectedPersistedScores: number;
  persistedScores: number | null;
  persistenceFailures?: readonly PersistenceFailure[];
  platform?: PlatformObservation;
}

export interface LoadEvaluation {
  passed: boolean;
  gateEligible: boolean;
  informational: boolean;
  gate: LoadScenario['gate'];
  failures: string[];
  derived: {
    serializationFailureRate: number;
    generatorAttributionValid: boolean;
    saturatedGeneratorShards: readonly number[];
  };
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function evaluateLoadResult(
  scenario: LoadScenario,
  observation: LoadObservation
): LoadEvaluation {
  const failures: string[] = [];
  const expectedSessions = scenarioSessionCount(scenario);
  const expectedRingsideSessions = scenarioRingsideSessionCount(scenario);
  const lifecycle = observation.sessionLifecycle;
  const generatorAssessment = analyzeGeneratorEvidence(observation.generator?.shards);
  const lifecycleIntervalsValid = validLifecycleIntervals(lifecycle);

  if (observation.concurrentSessions !== expectedSessions) {
    failures.push(
      `Concurrent sessions ${observation.concurrentSessions} did not match ${expectedSessions}.`
    );
  }
  if (
    observation.ringsideSessions < scenario.targets.ringsideSessionsMin ||
    observation.ringsideSessions < expectedRingsideSessions
  ) {
    failures.push('Ringside-session requirement was not met.');
  }
  if (
    !lifecycle ||
    !lifecycleIntervalsValid ||
    lifecycle.configuredSessions !== expectedSessions ||
    lifecycle.preparedSessions !== expectedSessions ||
    lifecycle.startedWorkflows !== expectedSessions ||
    lifecycle.completedWorkflows + lifecycle.failedWorkflows !== lifecycle.startedWorkflows ||
    lifecycle.failedWorkflows !== observation.workflowFailures ||
    lifecycle.configuredRingsideSessions !== expectedRingsideSessions ||
    lifecycle.preparedRingsideSessions !== expectedRingsideSessions ||
    lifecycle.startedRingsideWorkflows !== expectedRingsideSessions ||
    lifecycle.completedRingsideWorkflows + lifecycle.failedRingsideWorkflows !==
      lifecycle.startedRingsideWorkflows ||
    observation.concurrentSessions !== lifecycle.preparedSessions ||
    observation.ringsideSessions !== lifecycle.preparedRingsideSessions
  ) {
    failures.push('Session lifecycle evidence was incomplete or inconsistent.');
  }
  if (
    !finite(observation.scoringWriteP95Ms) ||
    observation.scoringWriteP95Ms > scenario.targets.scoringWriteP95Ms
  ) {
    failures.push('Scoring-write p95 exceeded or was missing.');
  }
  if (!finite(observation.apiP95Ms) || observation.apiP95Ms > scenario.targets.apiP95Ms) {
    failures.push('API p95 exceeded or was missing.');
  }
  if (!finite(observation.errorRate) || observation.errorRate > scenario.targets.errorRateMax) {
    failures.push('Error rate exceeded or was missing.');
  }
  if (
    !finite(observation.throughputRps) ||
    observation.throughputRps < scenario.targets.throughputMin
  ) {
    failures.push('Throughput target was not met.');
  }
  if (
    !finite(observation.availabilityPercent) ||
    observation.availabilityPercent < scenario.targets.availabilityMin
  ) {
    failures.push('Availability target was not met.');
  }
  if (observation.finalReplicationQueueDepth !== 0) {
    failures.push('Replication queues did not drain to zero.');
  }
  if (observation.queueTelemetryFailures !== 0) {
    failures.push('Replication queue telemetry was incomplete.');
  }
  if (
    !Number.isSafeInteger(observation.persistedScores) ||
    observation.persistedScores !== observation.expectedPersistedScores ||
    (observation.persistenceFailures?.length ?? 0) > 0
  ) {
    failures.push('Persisted scoring results did not reconcile.');
  }

  if (scenario.gate === 'G9') {
    const platform = observation.platform;
    if (
      !platform ||
      !finite(platform.peakCpuPercent) ||
      !finite(platform.peakIoPercent) ||
      !finite(platform.peakConnections) ||
      !finite(platform.connectionCap) ||
      platform.peakCpuPercent < 0 ||
      platform.peakIoPercent < 0 ||
      platform.peakConnections < 0 ||
      platform.connectionCap <= 0 ||
      platform.statementDeltas.length === 0 ||
      (platform.resourceSampling?.failures.length ?? 0) > 0
    ) {
      failures.push('Required platform telemetry was missing.');
    } else if (platform.connectionCap !== scenario.targets.databaseConnectionCap) {
      failures.push('Verified database connection cap did not match the scenario.');
    } else if (platform.peakConnections > platform.connectionCap) {
      failures.push('Peak database connections exceeded the verified cap.');
    }
    if (!generatorAssessment.complete) {
      failures.push('Required per-runner generator evidence was missing or incomplete.');
    } else if (generatorAssessment.saturatedShardIndexes.length > 0) {
      failures.push(
        `Generator saturation made backend latency attribution invalid on runner shard(s): ${generatorAssessment.saturatedShardIndexes.join(', ')}.`
      );
    }
  }

  const serializationFailureRate =
    observation.scoringWriteAttempts > 0
      ? observation.serializationFailures / observation.scoringWriteAttempts
      : 0;

  return {
    passed: failures.length === 0,
    gateEligible: scenario.gate === 'G9' && !scenario.informational,
    informational: scenario.informational,
    gate: scenario.gate,
    failures,
    derived: {
      serializationFailureRate,
      generatorAttributionValid:
        generatorAssessment.complete && generatorAssessment.saturatedShardIndexes.length === 0,
      saturatedGeneratorShards: generatorAssessment.saturatedShardIndexes,
    },
  };
}

function validLifecycleIntervals(lifecycle: LoadSessionLifecycleObservation | undefined): boolean {
  if (!lifecycle || !Array.isArray(lifecycle.activityIntervals)) return false;
  const intervals = lifecycle.activityIntervals;
  const sequences = new Set(intervals.map(interval => interval.sequence));
  if (
    intervals.length !== lifecycle.startedWorkflows ||
    sequences.size !== intervals.length ||
    intervals.filter(interval => interval.ringside).length !== lifecycle.startedRingsideWorkflows ||
    intervals.some(
      interval =>
        !Number.isInteger(interval.sequence) ||
        !finite(interval.startedAtMs) ||
        !finite(interval.finishedAtMs) ||
        interval.finishedAtMs < interval.startedAtMs
    )
  ) {
    return false;
  }
  const peaks = calculatePeakActiveWorkflows(intervals);
  return (
    peaks.total === lifecycle.peakActiveWorkflows &&
    peaks.ringside === lifecycle.peakActiveRingsideWorkflows
  );
}

function analyzeGeneratorEvidence(shards: readonly GeneratorShardObservation[] | undefined): {
  complete: boolean;
  saturatedShardIndexes: number[];
} {
  if (!shards || shards.length !== DISTRIBUTED_G9_SHARD_COUNT) {
    return { complete: false, saturatedShardIndexes: [] };
  }
  const indexes = new Set(shards.map(shard => shard.shardIndex));
  if (
    indexes.size !== DISTRIBUTED_G9_SHARD_COUNT ||
    !Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) => index).every(index =>
      indexes.has(index)
    )
  ) {
    return { complete: false, saturatedShardIndexes: [] };
  }
  let complete = true;
  const saturatedShardIndexes: number[] = [];
  for (const shard of shards) {
    const measurements = [
      shard.logicalCpuCount,
      shard.samplingDurationMs,
      shard.hostSampleCoveragePercent,
      shard.hostCpuP95Percent,
      shard.hostCpuPeakPercent,
      shard.hostMemoryPeakPercent,
      shard.hostLoad1mPeak,
      shard.eventLoopDelayP95Ms,
      shard.eventLoopDelayMaxMs,
      shard.browserControlP95Ms,
      shard.browserControlMaxMs,
      shard.browserControlAttemptCoveragePercent,
      shard.contextPreparationMs,
      shard.startHeadroomMs,
    ];
    const assessment = assessGeneratorShard(shard);
    if (
      !Number.isInteger(shard.logicalCpuCount) ||
      shard.logicalCpuCount <= 0 ||
      shard.sampleCount <= 0 ||
      shard.browserControlAttempts <= 0 ||
      shard.browserControlSamples < 0 ||
      shard.browserControlFailures < 0 ||
      measurements.some(value => !finite(value) || value < 0) ||
      shard.hostSampleCoveragePercent > 100 ||
      shard.browserControlAttemptCoveragePercent > 100 ||
      !assessment.complete
    ) {
      complete = false;
    }
    if (assessment.saturated) saturatedShardIndexes.push(shard.shardIndex);
  }
  return { complete, saturatedShardIndexes: saturatedShardIndexes.sort((a, b) => a - b) };
}
