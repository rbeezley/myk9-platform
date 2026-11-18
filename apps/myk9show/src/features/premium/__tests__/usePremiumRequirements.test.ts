import { describe, expect, it } from 'vitest';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { Show } from '@/types/show-types';
import { requirementFactsFromShow } from '../usePremiumRequirements';

const show = {
  id: 'show-1',
  clubName: 'Club',
  location: 'Hall',
  startDate: '2026-06-01',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-05-01',
  preEntryFee: '20',
} as unknown as Show;

const trials = [
  { id: 't1', name: 'Saturday', eventNumber: 'AKC-1' },
  { id: 't2', name: 'Sunday', eventNumber: 'AKC-2' },
];
const classes = [
  { id: 'c1', trialId: 't1', name: 'Container Novice' },
  { id: 'c2', trialId: 't2', name: 'Container Novice' },
];
const judge = (over: Partial<ShowJudgeAssignment>): ShowJudgeAssignment => ({
  judgeId: 'j',
  judgeName: 'Judge',
  assignedDate: '',
  ...over,
});

function judgeCounts(judges: ShowJudgeAssignment[]) {
  return requirementFactsFromShow({
    show,
    trials,
    classes,
    judges,
    secretaryName: null,
    chairName: null,
    committee: [],
  }).trials.map(t => t.judges.length);
}

describe('requirementFactsFromShow judges (MYK9-2053)', () => {
  it('counts a judge only for the trials where they have classes', () => {
    expect(judgeCounts([judge({ assignedClasses: ['c1'] })])).toEqual([1, 0]);
  });

  it('counts a show roster judge with no class assignment for every trial', () => {
    expect(judgeCounts([judge({ hasShowLevelAssignment: true, assignedClasses: [] })])).toEqual([
      1, 1,
    ]);
  });

  it('counts nobody for a judge with neither classes nor a roster row', () => {
    expect(judgeCounts([judge({})])).toEqual([0, 0]);
  });
});

describe('requirementFactsFromShow recording fee dates (MYK9-2044)', () => {
  function feeDates(feeTrials: Array<{ id: string; trialDate?: string; status?: string }>) {
    return requirementFactsFromShow({
      show,
      trials: feeTrials,
      classes: [],
      judges: [],
      secretaryName: null,
      chairName: null,
      committee: [],
    }).recordingFeeDates;
  }

  it('prices each live trial date, leaving out a cancelled trial', () => {
    expect(
      feeDates([
        { id: 't1', trialDate: '2027-12-31', status: 'upcoming' },
        { id: 't2', trialDate: '2028-01-01', status: 'cancelled' },
      ])
    ).toEqual(['2027-12-31']);
  });

  it("falls back to the show's start date before any trial is dated", () => {
    expect(feeDates([{ id: 't1' }])).toEqual(['2026-06-01']);
  });
});
