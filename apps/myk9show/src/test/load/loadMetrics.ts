import type { CDPSession, Page } from '@playwright/test';
import type { LoadObservation, PlatformObservation } from './loadEvaluation';

interface RequestAttempt {
  entryId?: string;
  succeeded: boolean;
}

export interface LoadMetricSamples {
  apiDurationsMs: readonly number[];
  scoringDurationsMs: readonly number[];
  pageDurationsMs: readonly number[];
}

interface CdpRequestMetadata {
  url: string;
  postData?: string;
  startedAtSeconds: number;
}

interface CdpRequestWillBeSent {
  requestId: string;
  timestamp: number;
  request: {
    url: string;
    postData?: string;
  };
}

interface CdpResponseReceived {
  requestId: string;
  timestamp: number;
  response: {
    url: string;
    status: number;
  };
}

interface CdpLoadingEvent {
  requestId: string;
}

export class LoadMetrics {
  private readonly apiDurations: number[] = [];
  private readonly scoringDurations: number[] = [];
  private readonly pageDurations: number[] = [];
  private readonly scoringAttempts: RequestAttempt[] = [];
  private requestCount = 0;
  private failedRequestCount = 0;
  private serializationFailures = 0;
  private workflowFailures = 0;
  private readonly responseTasks = new Set<Promise<void>>();

  async attach(page: Page): Promise<void> {
    const session = await page.context().newCDPSession(page);
    await session.send('Network.enable');
    const requests = new Map<string, CdpRequestMetadata>();
    const failedScoringResponses = new Set<string>();

    session.on('Network.requestWillBeSent', (event: CdpRequestWillBeSent) => {
      requests.set(event.requestId, {
        url: event.request.url,
        ...(event.request.postData !== undefined && { postData: event.request.postData }),
        startedAtSeconds: event.timestamp,
      });
    });
    session.on('Network.responseReceived', (event: CdpResponseReceived) => {
      const request = requests.get(event.requestId) ?? {
        url: event.response.url,
        startedAtSeconds: event.timestamp,
      };
      requests.delete(event.requestId);
      const durationMs = Math.max(0, (event.timestamp - request.startedAtSeconds) * 1_000);
      const succeeded = event.response.status >= 200 && event.response.status < 300;
      const isApi = request.url.includes('/rest/v1/');
      const isScoring = request.url.includes('/rpc/ringside_update_entry');

      this.requestCount += 1;
      if (isApi) this.apiDurations.push(durationMs);
      if (!succeeded) this.failedRequestCount += 1;
      if (!isScoring) return;

      this.scoringDurations.push(durationMs);
      this.scoringAttempts.push({
        entryId: scoringEntryId(request.postData),
        succeeded,
      });
      if (!succeeded) failedScoringResponses.add(event.requestId);
    });
    session.on('Network.loadingFailed', (event: CdpLoadingEvent) => {
      if (!requests.delete(event.requestId)) return;
      this.requestCount += 1;
      this.failedRequestCount += 1;
    });
    session.on('Network.loadingFinished', (event: CdpLoadingEvent) => {
      if (!failedScoringResponses.delete(event.requestId)) return;
      this.observeFailedScoringBody(session, event.requestId);
    });
  }

  recordPageDuration(durationMs: number): void {
    this.pageDurations.push(durationMs);
  }

  recordWorkflowFailure(): void {
    this.workflowFailures += 1;
  }

  async settle(): Promise<void> {
    await Promise.all(this.responseTasks);
  }

  samples(): LoadMetricSamples {
    return {
      apiDurationsMs: [...this.apiDurations],
      scoringDurationsMs: [...this.scoringDurations],
      pageDurationsMs: [...this.pageDurations],
    };
  }

  buildObservation(input: {
    concurrentSessions: number;
    ringsideSessions: number;
    elapsedMs: number;
    maxReplicationQueueDepth: number;
    finalReplicationQueueDepth: number;
    queueTelemetryFailures: number;
    expectedPersistedScores: number;
    persistedScores: number;
    platform?: PlatformObservation;
  }): LoadObservation {
    const retryCounts = new Map<string, RequestAttempt[]>();
    for (const attempt of this.scoringAttempts) {
      if (!attempt.entryId) continue;
      const attempts = retryCounts.get(attempt.entryId) ?? [];
      attempts.push(attempt);
      retryCounts.set(attempt.entryId, attempts);
    }

    let retryAttempts = 0;
    let retrySuccesses = 0;
    let exhaustedRetries = 0;
    for (const attempts of retryCounts.values()) {
      if (attempts.length <= 1) continue;
      retryAttempts += attempts.length - 1;
      if (attempts.at(-1)?.succeeded) retrySuccesses += 1;
      else exhaustedRetries += 1;
    }

    const failures = this.failedRequestCount + this.workflowFailures;
    const availabilityDenominator = this.requestCount + this.workflowFailures;
    return {
      concurrentSessions: input.concurrentSessions,
      ringsideSessions: input.ringsideSessions,
      requestCount: this.requestCount,
      failedRequestCount: this.failedRequestCount,
      workflowFailures: this.workflowFailures,
      scoringWriteP95Ms: percentile(this.scoringDurations, 95),
      apiP95Ms: percentile(this.apiDurations, 95),
      pageP95Ms: percentile(this.pageDurations, 95),
      errorRate: availabilityDenominator === 0 ? 1 : failures / availabilityDenominator,
      throughputRps: this.requestCount / Math.max(input.elapsedMs / 1_000, 1),
      availabilityPercent:
        availabilityDenominator === 0
          ? 0
          : ((availabilityDenominator - failures) / availabilityDenominator) * 100,
      scoringWriteAttempts: this.scoringAttempts.length,
      serializationFailures: this.serializationFailures,
      retryAttempts,
      retrySuccesses,
      exhaustedRetries,
      maxReplicationQueueDepth: input.maxReplicationQueueDepth,
      finalReplicationQueueDepth: input.finalReplicationQueueDepth,
      queueTelemetryFailures: input.queueTelemetryFailures,
      expectedPersistedScores: input.expectedPersistedScores,
      persistedScores: input.persistedScores,
      platform: input.platform,
    };
  }

  private observeFailedScoringBody(session: CDPSession, requestId: string): void {
    const task = session
      .send('Network.getResponseBody', { requestId })
      .then(result => {
        const body = typeof result.body === 'string' ? result.body : '';
        if (body.includes('40001') || body.toLowerCase().includes('serialization')) {
          this.serializationFailures += 1;
        }
      })
      .catch(() => undefined)
      .finally(() => this.responseTasks.delete(task));
    this.responseTasks.add(task);
  }
}

function scoringEntryId(postData: string | undefined): string | undefined {
  if (!postData) return undefined;
  try {
    const parsed = JSON.parse(postData) as { p_entry_id?: unknown };
    return typeof parsed.p_entry_id === 'string' ? parsed.p_entry_id : undefined;
  } catch {
    return undefined;
  }
}

export function percentile(values: readonly number[], percentage: number): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1);
  return sorted[index];
}
