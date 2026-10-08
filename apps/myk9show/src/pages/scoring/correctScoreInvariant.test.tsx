// MYK9-1025 invariant: reopening a saved score through the correction path and
// changing ONLY the time must not change anything else that was saved. Asserted
// on the submitted score data (what the optimistic writer persists), not the form.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

const PREFILLED: ScoresheetSportType[] = ['AKC_SCENT_WORK', 'ASCA_SCENT_DETECTION'];
const BLANK: ScoresheetSportType[] = [
  'AKC_SCENT_WORK_NATIONAL',
  'AKC_FASTCAT',
  'UKC_NOSEWORK',
  'UKC_OBEDIENCE',
  'UKC_RALLY',
];

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
  fireEvent.change(screen.getByLabelText('Area 1 time'), { target: { value: '1:10.00' } });
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
      async (_n, row, code) => {
        const payload = await correctTimeOnly(key, row);
        expect(payload.resultText).toBe(code);
        expect(payload.faultCount).toBe(row.total_faults);
        expect(payload.correctCount).toBe(row.total_correct_finds);
        expect(payload.incorrectCount).toBe(row.total_incorrect_finds);
        expect(payload.finishCallErrors).toBe(row.no_finish_count);
        expect(payload.points).toBe(row.points_earned);
        expect(payload.nonQualifyingReason).toBe(row.disqualification_reason ?? undefined);
        expect(payload.areaTimes).toEqual(['1:10.00']);
      }
    );
  });

  it.each(BLANK)('%s still opens blank (no prefill it cannot fully hydrate)', key => {
    const entry = toScoresheetEntry(toScoringEntry(savedQ, null, 0), classInfo, key);
    expect(entry.existingScore).toBeUndefined();
  });
});
