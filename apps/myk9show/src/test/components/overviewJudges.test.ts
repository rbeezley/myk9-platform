import { describe, expect, it } from 'vitest';
import {
  buildJudgesFromClasses,
  getDisplayableJudges,
  resolveOverviewJudges,
  resolveOverviewJudgesWithRoster,
} from '@/components/shows/overview/overviewJudges';
import type { ShowJudgeAssignment } from '@/types/judge-types';

const assignedJudge = (judgeName: string): ShowJudgeAssignment => ({
  judgeId: judgeName || 'judge-1',
  judgeName,
  assignedDate: '2026-05-10',
});

describe('overview judge resolution', () => {
  it('filters blank and placeholder judge names from the overview card input', () => {
    expect(
      getDisplayableJudges([
        assignedJudge(''),
        assignedJudge('?'),
        assignedJudge('TBD'),
        assignedJudge('Unknown Judge'),
        assignedJudge('Cynthia Beagles'),
      ]).map(judge => judge.judgeName)
    ).toEqual(['Cynthia Beagles']);
  });

  it('falls back to class-level judge names when show assignments are unresolved', () => {
    const result = resolveOverviewJudges(
      [assignedJudge('')],
      [
        { id: 'class-1', judgeName: 'Cynthia Beagles' },
        { id: 'class-2', judgeName: 'Cynthia Beagles' },
      ]
    );

    expect(result).toEqual([
      {
        judgeId: 'Cynthia Beagles',
        judgeName: 'Cynthia Beagles',
        assignedDate: '',
        assignedClasses: ['class-1', 'class-2'],
      },
    ]);
  });

  it('returns an empty list when neither assignments nor classes have displayable names', () => {
    expect(
      resolveOverviewJudges(
        [assignedJudge('?')],
        [
          { id: 'class-1', judgeName: '' },
          { id: 'class-2', judgeName: 'TBD' },
        ]
      )
    ).toEqual([]);
  });

  it('uses the assigned judge roster when show assignments have unresolved names', () => {
    const result = resolveOverviewJudgesWithRoster(
      [{ judgeId: 'judge-1', judgeName: '', assignedDate: '2026-06-12' }],
      [
        { id: 'judge-1', name: 'Richard Beezley' },
        { id: 'judge-2', name: 'Liz Beezley' },
      ],
      []
    );

    expect(result.map(judge => judge.judgeName)).toEqual(['Richard Beezley', 'Liz Beezley']);
  });

  it('deduplicates class-derived judges and skips unresolved class values', () => {
    expect(
      buildJudgesFromClasses([
        { id: 'class-1', judgeName: 'Cynthia Beagles' },
        { id: 'class-2', judgeName: '?' },
        { id: 'class-3', judgeName: 'Marcus Whitfield' },
      ]).map(judge => judge.judgeName)
    ).toEqual(['Cynthia Beagles', 'Marcus Whitfield']);
  });
});
