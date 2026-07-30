import {
  scenarioRingsideSessionCount,
  scenarioSessionCount,
  type LoadScenario,
  type LoadWorkloadKind,
} from './loadScenario';

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
  persistedScores: number;
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
  if (observation.persistedScores !== observation.expectedPersistedScores) {
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
      platform.statementDeltas.length === 0
    ) {
      failures.push('Required platform telemetry was missing.');
    } else if (platform.connectionCap !== scenario.targets.databaseConnectionCap) {
      failures.push('Verified database connection cap did not match the scenario.');
    } else if (platform.peakConnections > platform.connectionCap) {
      failures.push('Peak database connections exceeded the verified cap.');
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
    derived: { serializationFailureRate },
  };
}
