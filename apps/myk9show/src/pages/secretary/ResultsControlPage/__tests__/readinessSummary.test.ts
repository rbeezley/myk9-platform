import { describe, expect, it } from 'vitest';
import type { SyncableClassData, SyncableEntryData } from '@/store/classStore';
import { buildResultsReadinessSummary } from '../readinessSummary';
import { fromAny } from '@total-typescript/shoehorn';

const synced = {
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced' as const,
};

function cls(overrides: Partial<SyncableClassData> = {}): SyncableClassData {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    trial: 'Trial A',
    trialDate: '2026-08-01',
    trialNumber: '1',
    classOrder: '1',
    status: 'Completed',
    judge: 'Judge',
    ...synced,
    ...overrides,
  };
}

function entry(overrides: Partial<SyncableEntryData> = {}): SyncableEntryData {
  return fromAny<SyncableEntryData, unknown>({
    id: 'entry-1',
    armband: '101',
    handler: 'Handler',
    dog: 'Dog',
    status: 'pending',
    score: '',
    time: '',
    placement: '',
    classId: 'class-1',
    ...synced,
    ...overrides,
  });
}

describe('buildResultsReadinessSummary', () => {
  it('counts unscored entries and unreleased classes', () => {
    expect(buildResultsReadinessSummary([cls()], [entry()])).toEqual({
      totalClasses: 1,
      totalEntries: 1,
      unscoredEntries: 1,
      unreleasedClasses: 1,
      safeToSend: false,
    });
  });

  it('marks a show safe when every entry is scored and every class is released', () => {
    expect(
      buildResultsReadinessSummary(
        [cls({ results_released_at: '2026-08-01T20:00:00Z' })],
        [entry({ status: 'Qualified', score: 'Q', time: '35.12', placement: '1' })]
      )
    ).toEqual({
      totalClasses: 1,
      totalEntries: 1,
      unscoredEntries: 0,
      unreleasedClasses: 0,
      safeToSend: true,
    });
  });
});
