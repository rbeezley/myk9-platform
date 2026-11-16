import { describe, expect, it } from 'vitest';

import type { EntryScoreAuditItem } from '@/services/database/entries/scoreAudit';

import { correctionLine, findScoreCorrections } from './judgeReviewCorrections';

const ZONE = 'America/Los_Angeles';

function audit(
  id: string,
  changedAt: string,
  actorTier: EntryScoreAuditItem['actorTier'],
  changes: Array<[string, unknown, unknown]>
): EntryScoreAuditItem {
  return {
    id,
    changedAt,
    clientSavedAt: null,
    actorName: null,
    actorTier,
    passcodeRole: null,
    changes: changes.map(([field, oldValue, newValue]) => ({ field, oldValue, newValue })),
    timeZone: ZONE,
  };
}

// A known history: the judge submits 38.5 s and Q; the secretary changes the time to 41.25 s at
// 10:42 AM Pacific (18:42 UTC) and, separately, the placement moves (not shown on the page).
const JUDGE_SUBMITS = audit('a1', '2026-12-07T17:00:00Z', 'assigned_judge', [
  ['search_time_seconds', null, 38.5],
  ['result_status', 'pending', 'qualified'],
  ['total_faults', null, 0],
]);

describe('findScoreCorrections', () => {
  it('marks a time the secretary changed after the judge submitted it, with the judge value', () => {
    const history = [
      JUDGE_SUBMITS,
      audit('a2', '2026-12-07T18:42:00Z', 'manager', [
        ['search_time_seconds', 38.5, 41.25],
        ['final_placement', 2, 3],
      ]),
    ];

    const corrections = findScoreCorrections(history);

    expect(corrections).toEqual([
      { fieldLabel: 'time', was: '0:38.50', now: '0:41.25', at: '10:42 AM' },
    ]);
    expect(correctionLine(corrections)).toBe(
      'Changed after you submitted: time was 0:38.50, corrected by the secretary at 10:42 AM'
    );
  });

  it('reads from the judge value to the final one when a field is changed twice', () => {
    const history = [
      JUDGE_SUBMITS,
      audit('a2', '2026-12-07T18:00:00Z', 'manager', [['search_time_seconds', 38.5, 40]]),
      audit('a3', '2026-12-07T19:00:00Z', 'manager', [['search_time_seconds', 40, 41.25]]),
    ];

    expect(findScoreCorrections(history)).toEqual([
      { fieldLabel: 'time', was: '0:38.50', now: '0:41.25', at: '11:00 AM' },
    ]);
  });

  it('does not mark a field that ended where the judge left it', () => {
    const history = [
      JUDGE_SUBMITS,
      audit('a2', '2026-12-07T18:00:00Z', 'manager', [['search_time_seconds', 38.5, 40]]),
      audit('a3', '2026-12-07T19:00:00Z', 'manager', [['search_time_seconds', 40, 38.5]]),
    ];

    expect(findScoreCorrections(history)).toEqual([]);
  });

  it('does not mark the secretary entering a score nobody at the ring submitted', () => {
    const history = [
      audit('a1', '2026-12-07T17:00:00Z', 'manager', [['search_time_seconds', null, 38.5]]),
      audit('a2', '2026-12-07T18:00:00Z', 'manager', [['search_time_seconds', 38.5, 41.25]]),
    ];

    expect(findScoreCorrections(history)).toEqual([]);
  });

  it('ignores a manager row made before the judge submitted', () => {
    const history = [
      audit('a0', '2026-12-07T16:00:00Z', 'manager', [['total_faults', null, 1]]),
      JUDGE_SUBMITS,
    ];

    expect(findScoreCorrections(history)).toEqual([]);
  });

  it('words a changed result and fault count the way the page shows them', () => {
    const history = [
      JUDGE_SUBMITS,
      audit('a2', '2026-12-07T18:42:00Z', 'manager', [
        ['result_status', 'qualified', 'nq'],
        ['total_faults', 0, 1],
        ['disqualification_reason', null, 'Left the search area'],
      ]),
    ];

    expect(
      findScoreCorrections(history).map(item => [item.fieldLabel, item.was, item.now])
    ).toEqual([
      ['result', 'Q', 'NQ'],
      ['faults', '0', '1'],
      ['reason', 'none', 'Left the search area'],
    ]);
  });

  it('has nothing to mark for an entry with no history', () => {
    expect(findScoreCorrections([])).toEqual([]);
    expect(correctionLine([])).toBe('');
  });
});
