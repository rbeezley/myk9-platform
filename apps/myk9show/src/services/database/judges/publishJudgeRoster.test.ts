import { describe, expect, it } from 'vitest';
import { premiumTrialJudges } from '../../../../../../supabase/functions/generate-premium/trialJudges';
import { listedJudgeIds, type RosterRow } from './publishJudgeRoster';

const LIVE_TRIAL = { status: 'scheduled', deleted_at: null };
const cls = (over: Partial<NonNullable<RosterRow['assigned_class']>> = {}) => ({
  status: 'scheduled',
  deleted_at: null,
  trial: LIVE_TRIAL,
  ...over,
});
const pick = (
  over: Partial<RosterRow> & { cls?: RosterRow['assigned_class'] } = {}
): RosterRow => ({
  person_id: 'p1',
  class_id: 'c1',
  trial_id: null,
  status: 'confirmed',
  assigned_class: cls(),
  ...over,
});
const roster = (over: Partial<RosterRow> = {}): RosterRow =>
  pick({ class_id: null, trial_id: null, assigned_class: null, ...over });

/** What the generator lists for the same rows: the union over the show's live trials. */
function generatorListed(rows: RosterRow[]): boolean {
  const trials = new Map<
    string,
    { id: string; status: string | null; deleted_at: string | null; classes: never[] }
  >();
  const classRows = rows
    .filter(r => r.class_id)
    .map(r => ({
      row: r,
      trialId: `t-${r.class_id}`,
      cls: {
        id: r.class_id!,
        element: 'Buried',
        level: 'Novice',
        section: null,
        status: r.assigned_class?.status,
        deleted_at: r.assigned_class?.deleted_at,
      },
    }));
  const showTrials = [
    { id: 't-live', status: 'scheduled', deleted_at: null, classes: [] as unknown[] },
    ...classRows.map(c => ({
      id: c.trialId,
      status: c.row.assigned_class?.trial?.status ?? null,
      deleted_at: c.row.assigned_class?.trial?.deleted_at ?? null,
      classes: [c.cls],
    })),
  ];
  void trials;
  const people = { id: 'p1', first_name: 'Pat', last_name: 'Judge' };
  const asRows = rows.map(r => ({
    trial_id: r.trial_id,
    class_id: r.class_id ? r.class_id : null,
    status: r.status,
    people,
  }));
  return showTrials
    .filter(t => !t.deleted_at && t.status !== 'cancelled')
    .some(t => premiumTrialJudges(asRows, t as never, showTrials as never).length > 0);
}

describe('listedJudgeIds matches the generator (MYK9-2248)', () => {
  const scenarios: Array<[string, RosterRow[]]> = [
    ['a live class pick', [pick()]],
    ['only a cancelled class pick', [pick({ assigned_class: cls({ status: 'cancelled' }) })]],
    [
      'a roster row beside only a cancelled pick',
      [roster(), pick({ assigned_class: cls({ status: 'cancelled' }) })],
    ],
    ['a roster row alone', [roster()]],
    ['a whole-trial row alone', [roster({ trial_id: 't-live' })]],
    [
      'a whole-trial row beside a cancelled pick',
      [roster({ trial_id: 't-live' }), pick({ assigned_class: cls({ status: 'cancelled' }) })],
    ],
    ['only a deleted class pick', [pick({ assigned_class: cls({ deleted_at: 'x' }) })]],
    [
      'a roster row beside a deleted pick',
      [roster(), pick({ assigned_class: cls({ deleted_at: 'x' }) })],
    ],
    [
      'a roster row beside a pick in a cancelled trial',
      [
        roster(),
        pick({ assigned_class: cls({ trial: { status: 'cancelled', deleted_at: null } }) }),
      ],
    ],
    ['a declined live pick', [pick({ status: 'declined' })]],
    ['a declined pick beside a roster row', [roster(), pick({ status: 'declined' })]],
    [
      'a cancelled pick and a live pick',
      [pick({ assigned_class: cls({ status: 'cancelled' }) }), pick({ class_id: 'c2' })],
    ],
  ];

  it.each(scenarios)('%s', (_label, rows) => {
    expect(listedJudgeIds(rows).has('p1')).toBe(generatorListed(rows));
  });
});
