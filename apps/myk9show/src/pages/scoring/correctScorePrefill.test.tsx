// MYK9-1025: "Correct this score" reopened the live scoresheet BLANK because
// `toScoresheetEntry` mapped identity only, so the judge could not see the saved
// result, time or faults they were correcting. These tests run the real
// replicated-row -> ScoringEntry -> ScoresheetEntry -> live scoresheet path.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AKCScentWorkLiveScoresheet, type ResolvedClassRules } from '@myk9/scoring-ui';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { toScoresheetEntry, toScoringEntry, type ClassInfo } from './types';

const classInfo: ClassInfo = {
  id: 'class-1',
  name: 'Novice Interior',
  element: 'Interior',
  level: 'Novice',
} as ClassInfo;

const rules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

/** The row shape `useOptimisticScoring` writes (and replication reads back). */
function savedRow(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    dog_call_name: 'Rex',
    handler: 'Jamie Handler',
    armband: '101',
    status: 'accepted',
    result_status: 'qualified',
    search_time_seconds: 65,
    total_faults: 2,
    area1_time_seconds: 65,
    ...overrides,
  };
}

function toSheet(row: ReplicatedEntry) {
  return toScoresheetEntry(toScoringEntry(row, null, 0), classInfo);
}

describe('Correct this score prefill (MYK9-1025)', () => {
  it('carries the saved result, time and faults into the scoresheet entry', () => {
    expect(toSheet(savedRow()).existingScore).toMatchObject({
      resultText: 'Q',
      searchTime: '1:05.00',
      areaTimes: ['1:05.00'],
      faultCount: 2,
    });
  });

  it('opens the live scoresheet with Area 1 time, Qualified selected and the fault count', () => {
    render(
      <AKCScentWorkLiveScoresheet
        entry={toSheet(savedRow())}
        classInfo={{ element: 'Interior', level: 'Novice' }}
        rules={rules}
        onSubmit={() => {}}
        onBack={() => {}}
      />
    );

    expect(screen.getByLabelText('Area 1 time')).toHaveValue('1:05.00');
    // The faults stepper only renders while Q is the selected result.
    expect(screen.getByText(/Faults Count/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('restores an NQ result with its reason', () => {
    const sheet = toSheet(
      savedRow({
        result_status: 'nq',
        total_faults: 0,
        disqualification_reason: 'Incorrect Call',
      })
    );
    expect(sheet.existingScore).toMatchObject({
      resultText: 'NQ',
      nonQualifyingReason: 'Incorrect Call',
    });
  });

  it('keeps a legacy row with only a total time (no area columns) visible in Area 1', () => {
    const sheet = toSheet(savedRow({ area1_time_seconds: undefined, search_time_seconds: 83.5 }));
    expect(sheet.existingScore?.areaTimes).toEqual(['1:23.50']);
  });

  it('still opens a NEW (unscored) entry blank', () => {
    const fresh = savedRow({
      result_status: 'pending',
      search_time_seconds: 0,
      total_faults: 0,
      area1_time_seconds: undefined,
    });
    expect(toSheet(fresh).existingScore).toBeUndefined();

    render(
      <AKCScentWorkLiveScoresheet
        entry={toSheet(fresh)}
        classInfo={{ element: 'Interior', level: 'Novice' }}
        rules={rules}
        onSubmit={() => {}}
        onBack={() => {}}
      />
    );
    expect(screen.getByLabelText('Area 1 time')).toHaveValue('');
    expect(screen.queryByText(/Faults Count/)).not.toBeInTheDocument();
  });
});
