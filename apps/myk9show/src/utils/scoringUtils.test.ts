import { describe, it, expect } from 'vitest';
import { getStatusColor, getSyncHealthStatus, type SyncMetrics } from './scoringUtils';

function makeMetrics(overrides: Partial<SyncMetrics> = {}): SyncMetrics {
  return {
    totalScores: 10,
    syncedScores: 10,
    pendingScores: 0,
    failedScores: 0,
    syncSuccess: 100,
    averageSyncTime: 50,
    ...overrides,
  };
}

describe('getStatusColor', () => {
  it('maps good/warning/error to the expected token classes', () => {
    expect(getStatusColor('good')).toBe('text-success');
    expect(getStatusColor('warning')).toBe('text-warning');
    expect(getStatusColor('error')).toBe('text-destructive');
  });
});

describe('getSyncHealthStatus', () => {
  it('returns error when any scores have failed to sync', () => {
    const metrics = makeMetrics({ failedScores: 1, pendingScores: 0 });
    expect(getSyncHealthStatus(metrics)).toBe('error');
  });

  it('returns warning when pending scores exceed 20% of total', () => {
    const metrics = makeMetrics({ totalScores: 10, pendingScores: 3, failedScores: 0 });
    expect(getSyncHealthStatus(metrics)).toBe('warning');
  });

  it('returns good when pending scores are at or below 20% of total', () => {
    const metrics = makeMetrics({ totalScores: 10, pendingScores: 2, failedScores: 0 });
    expect(getSyncHealthStatus(metrics)).toBe('good');
  });

  it('returns good when there are no scores at all', () => {
    const metrics = makeMetrics({ totalScores: 0, pendingScores: 0, failedScores: 0 });
    expect(getSyncHealthStatus(metrics)).toBe('good');
  });

  it('prioritizes error over warning when both conditions are true', () => {
    const metrics = makeMetrics({ totalScores: 10, pendingScores: 5, failedScores: 1 });
    expect(getSyncHealthStatus(metrics)).toBe('error');
  });
});
