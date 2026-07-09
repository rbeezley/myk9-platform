import { describe, expect, it } from 'vitest';
import {
  buildCloseoutReadiness,
  isShowClosedOut,
  selectCloseoutCascadeTargets,
  toCloseoutClassSummary,
} from '../showCloseOutShow';

describe('showCloseOutShow helpers', () => {
  it('builds plain-language concerns for unresolved closeout work', () => {
    const readiness = buildCloseoutReadiness({
      classes: [
        { id: 'class-1', status: 'in_progress', entryCount: 5, scoredCount: 3 },
        { id: 'class-2', status: 'completed', entryCount: 4, scoredCount: 4 },
      ],
      entries: [
        {
          id: 'entry-1',
          entry_fee: 35,
          entry_status: 'scratched',
          check_in_status: 'pulled',
          payment_status: 'paid',
        },
      ],
      incidents: { reportableCount: 2, urgentCount: 1 },
      submissions: [],
    });

    expect(readiness).toEqual({
      hasConcerns: true,
      concerns: [
        '1 class still has unscored entries.',
        'No result submission has been recorded for this show.',
        '1 pulled entry needs refund review.',
        '2 reportable incidents are still in the incident log.',
      ],
    });
  });

  it('treats sent or submitted result history as closeout submission evidence', () => {
    expect(
      buildCloseoutReadiness({
        classes: [],
        entries: [],
        incidents: { reportableCount: 0, urgentCount: 0 },
        submissions: [{ status: 'submitted' }],
      })
    ).toEqual({ hasConcerns: false, concerns: [] });
  });

  it('selects only open show hierarchy rows for cascade', () => {
    expect(
      selectCloseoutCascadeTargets({
        show: { id: 'show-1', status: 'in_progress' },
        trials: [
          { id: 'trial-open', status: 'in_progress' },
          { id: 'trial-done', status: 'completed' },
          { id: 'trial-cancelled', status: 'cancelled' },
        ],
        classes: [
          { id: 'class-open', status: 'In Progress' },
          { id: 'class-done', status: 'Complete' },
          { id: 'class-cancelled', status: 'Cancelled' },
        ],
      })
    ).toEqual({
      showId: 'show-1',
      trialIds: ['trial-open'],
      classIds: ['class-open'],
    });
  });

  it('normalizes class summaries from the show workbench shape', () => {
    expect(
      toCloseoutClassSummary({
        id: 'class-1',
        name: 'Container Novice',
        element: 'Container',
        level: 'Novice',
        section: 'A',
        judgeName: 'Pat Judge',
        trialId: 'trial-1',
        time: '9:00 AM',
        status: 'In Progress',
        entryCount: 12,
        scoredCount: 10,
        trialDate: '2026-05-01',
        trialNumber: '1',
        trialName: 'Trial 1',
      })
    ).toEqual({
      id: 'class-1',
      status: 'In Progress',
      entryCount: 12,
      scoredCount: 10,
    });
  });

  it('recognizes completed and Complete as closed out', () => {
    expect(isShowClosedOut('completed')).toBe(true);
    expect(isShowClosedOut('Complete')).toBe(true);
    expect(isShowClosedOut('in_progress')).toBe(false);
  });
});
