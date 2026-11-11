import { describe, expect, it } from 'vitest';
import { officialFormJudgeBlock } from '../reportJudgeGate';

const trials = [
  { id: 't1', registry_id: 'AKC', trial_number: 1 },
  { id: 't2', registry_id: 'AKC', trial_number: 2 },
  { id: 'u1', registry_id: 'UKC', trial_number: 3 },
];

const judged = { id: 'c1', trial_id: 't1', element: 'Buried', level: 'Novice', judge: 'Pat Judge' };
const unjudged = { id: 'c2', trial_id: 't1', element: 'Container', level: 'Novice', section: 'A' };

describe('officialFormJudgeBlock', () => {
  it('names each class with no judge, in one sentence', () => {
    const message = officialFormJudgeBlock(
      'akc-judge-report',
      null,
      trials,
      [judged, unjudged, { ...unjudged, id: 'c3', judge: 'TBD', section: 'B' }],
      't1',
      'all'
    );

    expect(message).toBe(
      'These classes need a judge before you can print this form: Container Novice A, Container Novice B. Assign a judge to each class, then come back.'
    );
  });

  it('reads the judge the way every other surface does, including an assigned judge', () => {
    const show = {
      assignedJudges: [
        { judgeId: 'j1', judgeName: 'Assigned Judge', assignedClasses: ['c2'] },
      ] as never,
    };

    expect(
      officialFormJudgeBlock('akc-judge-report', show, trials, [judged, unjudged], 't1', 'all')
    ).toBeNull();
  });

  it('adds the trial number when the selection spans trials', () => {
    const message = officialFormJudgeBlock(
      'result-catalog',
      null,
      trials,
      [{ ...unjudged, trial_id: 't2' }, judged],
      'all',
      'all'
    );

    expect(message).toContain('Container Novice A (Trial 2)');
  });

  it('leaves club reports alone', () => {
    for (const reportType of ['judges-schedule', 'judge-entry-counts', 'show-catalog']) {
      expect(officialFormJudgeBlock(reportType, null, trials, [unjudged], 't1', 'all')).toBeNull();
    }
  });

  it('still blocks on a cancelled class with no judge, since the forms print it', () => {
    expect(
      officialFormJudgeBlock(
        'result-catalog',
        null,
        trials,
        [{ ...unjudged, status: 'cancelled' }],
        't1',
        'all'
      )
    ).not.toBeNull();
  });

  it('lets a trial-level form print past a cancelled class with no judge when the trial has a judge', () => {
    expect(
      officialFormJudgeBlock(
        'akc-judge-report',
        null,
        trials,
        [judged, { ...unjudged, status: 'cancelled' }],
        't1',
        'all'
      )
    ).toBeNull();
  });

  it('blocks a trial-level form when every class in the trial is cancelled and unjudged', () => {
    expect(
      officialFormJudgeBlock(
        'akc-judge-report',
        null,
        trials,
        [{ ...unjudged, status: 'cancelled' }],
        't1',
        'all'
      )
    ).not.toBeNull();
  });

  it('does not count a UKC trial or a class outside the selection', () => {
    expect(
      officialFormJudgeBlock(
        'trial-secretary-report',
        null,
        trials,
        [{ ...unjudged, trial_id: 'u1' }],
        'u1',
        'all'
      )
    ).toBeNull();
    expect(
      officialFormJudgeBlock(
        'akc-judge-report',
        null,
        trials,
        [{ ...unjudged, trial_id: 't2' }],
        't1',
        'all'
      )
    ).toBeNull();
  });

  it('is the AKC Marked Catalog only when every class in the selection is AKC', () => {
    expect(
      officialFormJudgeBlock(
        'result-catalog',
        null,
        trials,
        [unjudged, { ...judged, id: 'cu', trial_id: 'u1' }],
        'all',
        'all'
      )
    ).toBeNull();
  });

  it('narrows to the selected class', () => {
    expect(
      officialFormJudgeBlock('result-catalog', null, trials, [judged, unjudged], 't1', 'c1')
    ).toBeNull();
  });
});
