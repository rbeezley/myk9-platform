// MYK9-1025 invariant: reopening a saved score through the correction path and
// changing ONLY the time must not change anything else that was saved. Asserted
// on the submitted score data (what the optimistic writer persists), not the form.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NATIONALS_SCORING } from '@myk9/core';
import {
  getScoresheetComponent,
  type ResolvedClassRules,
  type ScoreData,
  type ScoresheetSportType,
} from '@myk9/scoring-ui';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import {
  toOptimisticScorePayload,
  toScoresheetEntry,
  toScoringEntry,
  type ClassInfo,
} from './types';

const classInfo: ClassInfo = {
  id: 'class-1',
  name: 'Novice Interior',
  element: 'Interior',
  level: 'Novice',
  entryCount: 10,
};

const rules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

const PREFILLED: ScoresheetSportType[] = [
  'AKC_SCENT_WORK',
  'ASCA_SCENT_DETECTION',
  'AKC_SCENT_WORK_NATIONAL',
  'UKC_NOSEWORK',
];
const BLANK: ScoresheetSportType[] = ['AKC_FASTCAT', 'UKC_OBEDIENCE', 'UKC_RALLY'];

const savedQ: ReplicatedEntry = {
  id: 'entry-1',
  classId: 'class-1',
  dogId: 'dog-1',
  dog_call_name: 'Rex',
  handler: 'Jamie Handler',
  armband: '101',
  status: 'accepted',
  result_status: 'qualified',
  search_time_seconds: 65,
  area1_time_seconds: 65,
  total_faults: 2,
  total_correct_finds: 1,
  total_incorrect_finds: 0,
  no_finish_count: 1,
  points_earned: 7,
};
const savedNq: ReplicatedEntry = {
  ...savedQ,
  result_status: 'nq',
  total_faults: 0,
  total_correct_finds: 2,
  total_incorrect_finds: 1,
  disqualification_reason: 'Incorrect Call',
};

async function correctTimeOnly(key: ScoresheetSportType, row: ReplicatedEntry) {
  const Sheet = getScoresheetComponent(key, 'live');
  if (!Sheet) throw new Error(`no sheet for ${key}`);
  const onSubmit = vi.fn<(d: ScoreData) => void>();
  const entry = toScoresheetEntry(toScoringEntry(row, null, 0), classInfo, key);
  render(
    <Sheet
      entry={entry}
      classInfo={{ element: 'Interior', level: 'Novice' }}
      rules={rules}
      onSubmit={onSubmit}
      onBack={() => {}}
    />
  );
  const label = key === 'UKC_NOSEWORK' ? 'Recorded time' : 'Area 1 time';
  fireEvent.change(screen.getByLabelText(label), { target: { value: '1:10.00' } });
  fireEvent.click(screen.getByTestId('submit-btn'));
  fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return toOptimisticScorePayload(onSubmit.mock.calls[0]![0]);
}

describe('Correct this score invariant (MYK9-1025)', () => {
  describe.each(PREFILLED)('%s', key => {
    it.each([
      ['Q', savedQ, 'Q'],
      ['NQ', savedNq, 'NQ'],
    ])(
      'time-only correction of a saved %s keeps every other saved value',
      async (_n, savedRow, code) => {
        // A saved UKC Qualified is within the UKC fault limit (MYK9-2004).
        const row = key === 'UKC_NOSEWORK' ? { ...savedRow, total_faults: 0 } : savedRow;
        const payload = await correctTimeOnly(key, row);
        expect(payload.resultText).toBe(code);
        expect(payload.faultCount).toBe(row.total_faults);
        expect(payload.correctCount).toBe(row.total_correct_finds);
        expect(payload.incorrectCount).toBe(row.total_incorrect_finds);
        expect(payload.finishCallErrors).toBe(row.no_finish_count);
        // Nationals points are computed from the alert counts and finish call errors
        // (10 per correct, 5 off per incorrect and per finish call error, never below 0),
        // not stored separately (MYK9-1835: finish call errors cost 5 each).
        expect(payload.points).toBe(
          key === 'AKC_SCENT_WORK_NATIONAL'
            ? Math.max(
                0,
                row.total_correct_finds! * NATIONALS_SCORING.CORRECT_ALERT_POINTS -
                  row.total_incorrect_finds! * NATIONALS_SCORING.INCORRECT_ALERT_PENALTY -
                  row.no_finish_count! * NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY
              )
            : row.points_earned
        );
        expect(payload.nonQualifyingReason).toBe(row.disqualification_reason ?? undefined);
        // MYK9-2016: a Nationals sheet always has 5 areas; the other four stay blank here.
        expect(payload.areaTimes).toEqual(
          key === 'AKC_SCENT_WORK_NATIONAL' ? ['1:10.00', '', '', '', ''] : ['1:10.00']
        );
      }
    );
  });

  it.each(BLANK)('%s still opens blank (no prefill it cannot fully hydrate)', key => {
    const entry = toScoresheetEntry(toScoringEntry(savedQ, null, 0), classInfo, key);
    expect(entry.existingScore).toBeUndefined();
  });
});
