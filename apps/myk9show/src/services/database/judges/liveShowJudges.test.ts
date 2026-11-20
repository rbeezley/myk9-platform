import { describe, expect, it } from 'vitest';
import { premiumTrialJudges } from '../../../../../../supabase/functions/generate-premium/trialJudges';
import {
  liveShowJudges,
  type LiveJudgeAssignmentRow,
  type LiveJudgeTrialRow,
} from './liveShowJudges';

const person = (id: string, last: string) => ({
  id,
  first_name: 'Pat',
  last_name: last,
  judge_affiliation: null,
});
const row = (
  id: string,
  trial_id: string | null,
  class_id: string | null,
  status: string | null = null
): LiveJudgeAssignmentRow => ({ trial_id, class_id, status, person: person(id, id) });

const trials: LiveJudgeTrialRow[] = [
  {
    id: 't1',
    status: null,
    deleted_at: null,
    classes: [
      { id: 'c1', deleted_at: null },
      { id: 'c-deleted', deleted_at: '2026-01-01' },
    ],
  },
  {
    id: 't-cancelled',
    status: 'cancelled',
    deleted_at: null,
    classes: [{ id: 'c2', deleted_at: null }],
  },
  {
    id: 't-deleted',
    status: null,
    deleted_at: '2026-01-01',
    classes: [{ id: 'c3', deleted_at: null }],
  },
];

const rows: LiveJudgeAssignmentRow[] = [
  row('picks-live', 't1', 'c1'),
  row('declined', 't1', 'c1', 'declined'),
  row('cancelled', 't1', 'c1', 'cancelled'),
  row('deleted-class', 't1', 'c-deleted'),
  row('cancelled-trial', 't-cancelled', 'c2'),
  row('deleted-trial', 't-deleted', 'c3'),
  row('roster-with-picks', null, null),
  row('roster-with-picks', 't1', 'c1'),
  row('roster-only', null, null),
  row('roster-dead-picks', null, null),
  row('roster-dead-picks', 't1', 'c-deleted'),
  row('whole-trial', 't1', null),
  row('whole-trial-cancelled', 't-cancelled', null),
];

describe('liveShowJudges', () => {
  const ids = liveShowJudges(rows, trials)
    .map(j => j.id)
    .sort();

  it('flags the judges the premium prints, and no others', () => {
    expect(ids).toEqual([
      'picks-live',
      'roster-dead-picks',
      'roster-only',
      'roster-with-picks',
      'whole-trial',
    ]);
  });

  it('matches the generator over the same rows (parity with premiumTrialJudges)', () => {
    const generatorRows = rows.map(r => ({
      trial_id: r.trial_id,
      class_id: r.class_id,
      status: r.status,
      people: { id: r.person!.id, first_name: 'Pat', last_name: r.person!.id },
    }));
    const showTrials = trials.map(t => ({
      ...t,
      classes: t.classes!.map(c => ({
        ...c,
        element: 'Container',
        level: 'Novice',
        section: null,
      })),
    }));
    const printed = new Set(
      showTrials
        .filter(t => !t.deleted_at && t.status !== 'cancelled')
        .flatMap(t => premiumTrialJudges(generatorRows, t, showTrials))
        .map(j => j.name.replace('Pat ', ''))
    );
    expect([...printed].sort()).toEqual(ids);
  });

  it('trims the affiliation and treats blank as none', () => {
    const withAffiliation = [
      { ...row('a', 't1', 'c1'), person: { ...person('a', 'A'), judge_affiliation: ' Region 4 ' } },
      { ...row('b', 't1', 'c1'), person: { ...person('b', 'B'), judge_affiliation: '  ' } },
    ];
    expect(liveShowJudges(withAffiliation, trials).map(j => j.affiliation)).toEqual([
      'Region 4',
      null,
    ]);
  });
});
