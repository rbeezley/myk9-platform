import { describe, expect, it } from 'vitest';
import {
  buildCloseoutReadiness,
  isShowClosedOut,
  selectCloseoutCascadeTargets,
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

  // Codex review of #2681: holding the close until both reads succeed stranded
  // an offline secretary; reading them as empty hid open incidents. Unread is
  // listed as its own concern, and the close stays available.
  it('lists unread incidents and submissions as concerns instead of claiming none', () => {
    expect(
      buildCloseoutReadiness({ classes: [], entries: [], incidents: null, submissions: null })
    ).toEqual({
      hasConcerns: true,
      concerns: [
        'Result submissions could not be checked, so whether results were sent is unknown.',
        'The incident log could not be checked, so open reportable incidents are unknown.',
      ],
    });
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

  it('recognizes completed and Complete as closed out', () => {
    expect(isShowClosedOut('completed')).toBe(true);
    expect(isShowClosedOut('Complete')).toBe(true);
    expect(isShowClosedOut('in_progress')).toBe(false);
  });
});
