import { describe, expect, it } from 'vitest';
import { generatedPremium } from '@/features/premium/__tests__/fixtures/generatedPremium';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { applyShowFormDataToPremium } from '../showFormPremiumSync';

const judge = (overrides: Partial<ShowJudgeAssignment>): ShowJudgeAssignment => ({
  judgeId: 'j1',
  judgeName: 'Jane Smith',
  assignedDate: '2026-05-01',
  ...overrides,
});

function judgesAfterSync(judges: ShowJudgeAssignment[]) {
  const premium = generatedPremium();
  premium.trials = [
    {
      name: 'Saturday',
      date: '2026-05-01',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      judges: [],
      classes: [],
    },
  ];
  return applyShowFormDataToPremium(premium, {}, judges).trials[0]?.judges;
}

describe('applyShowFormDataToPremium judges (MYK9-2067)', () => {
  it('publishes each judge with residence and class labels', () => {
    expect(
      judgesAfterSync([
        judge({ residence: 'Springfield, IL', classLabels: ['Container Novice A'] }),
      ])
    ).toEqual([
      { name: 'Jane Smith', residence: 'Springfield, IL', classes: ['Container Novice A'] },
    ]);
  });

  it('publishes a judge with no city as null residence and no assignment as no classes', () => {
    expect(judgesAfterSync([judge({})])).toEqual([
      { name: 'Jane Smith', residence: null, classes: [] },
    ]);
  });

  // The show wizard writes a show-level roster row and keeps it beside the class picks, so the
  // roster row must not hide the judge's classes (Codex on #4021).
  it("keeps a roster judge's class assignments", () => {
    expect(
      judgesAfterSync([
        judge({
          hasShowLevelAssignment: true,
          residence: 'Austin, TX',
          classLabels: ['Container Novice A'],
        }),
      ])
    ).toEqual([{ name: 'Jane Smith', residence: 'Austin, TX', classes: ['Container Novice A'] }]);
  });

  it('lists a roster judge with no class yet with no class line', () => {
    expect(judgesAfterSync([judge({ hasShowLevelAssignment: true })])).toEqual([
      { name: 'Jane Smith', residence: null, classes: [] },
    ]);
  });

  describe('a weekend of trials that repeat the same class labels', () => {
    const novice = 'Container Novice A';
    const twoTrials = () => {
      const premium = generatedPremium();
      const trial = (name: string, date: string) => ({
        name,
        date,
        startTime: null,
        eventNumber: null,
        type: 'Scent Work',
        judges: [],
        classes: [{ element: 'Container', level: 'Novice', section: 'A' }],
      });
      premium.trials = [trial('Trial 1', '2026-05-01'), trial('Trial 2', '2026-05-02')];
      return premium;
    };
    const sync = (judges: ShowJudgeAssignment[]) =>
      applyShowFormDataToPremium(twoTrials(), {}, judges).trials.map(t => t.judges);
    const inTrial = (trialName: string, trialDate: string) => [
      { trialName, trialDate, labels: [novice] },
    ];

    it('prints each judge only under the trial they are assigned in', () => {
      const result = sync([
        judge({
          judgeId: 'a',
          judgeName: 'Judge A',
          classLabels: [novice],
          classLabelsByTrial: inTrial('Trial 1', '2026-05-01'),
        }),
        judge({
          judgeId: 'b',
          judgeName: 'Judge B',
          classLabels: [novice],
          classLabelsByTrial: inTrial('Trial 2', '2026-05-02'),
        }),
      ]);

      expect(result[0]).toEqual([{ name: 'Judge A', residence: null, classes: [novice] }]);
      expect(result[1]).toEqual([{ name: 'Judge B', residence: null, classes: [novice] }]);
    });

    it('lists a roster judge with no class on every trial with no class line', () => {
      const result = sync([
        judge({
          judgeId: 'a',
          judgeName: 'Judge A',
          classLabels: [novice],
          classLabelsByTrial: inTrial('Trial 1', '2026-05-01'),
        }),
        judge({ judgeId: 's', judgeName: 'Show Wide', hasShowLevelAssignment: true }),
      ]);

      expect(result[0]).toEqual([
        { name: 'Judge A', residence: null, classes: [novice] },
        { name: 'Show Wide', residence: null, classes: [] },
      ]);
      expect(result[1]).toEqual([{ name: 'Show Wide', residence: null, classes: [] }]);
    });

    it('lists a roster judge with classes only under the trial of those classes', () => {
      const result = sync([
        judge({
          judgeId: 'a',
          judgeName: 'Judge A',
          hasShowLevelAssignment: true,
          classLabels: [novice],
          classLabelsByTrial: inTrial('Trial 1', '2026-05-01'),
        }),
      ]);

      expect(result[0]).toEqual([{ name: 'Judge A', residence: null, classes: [novice] }]);
      expect(result[1]).toEqual([]);
    });

    it('a trial renamed after the premium was generated still lists its judges', () => {
      const result = sync([
        judge({
          judgeId: 'a',
          judgeName: 'Judge A',
          classLabels: [novice],
          classLabelsByTrial: inTrial('Trial 1', '2026-05-01'),
        }),
        judge({
          judgeId: 'b',
          judgeName: 'Judge B',
          classLabels: [novice],
          classLabelsByTrial: inTrial('Trial Two', '2026-05-02'),
        }),
      ]);

      expect(result[0]).toEqual([{ name: 'Judge A', residence: null, classes: [novice] }]);
      expect(result[1]).toEqual([{ name: 'Judge B', residence: null, classes: [novice] }]);
    });

    it('falls back to every judge on every trial when no trial matches, so judges never vanish', () => {
      const result = sync([
        judge({
          judgeId: 'a',
          judgeName: 'Judge A',
          classLabels: [novice],
          classLabelsByTrial: inTrial('Renamed Trial', '2026-05-01'),
        }),
        judge({ judgeId: 'b', judgeName: 'Judge B', classLabels: [] }),
      ]);

      const both = [
        { name: 'Judge A', residence: null, classes: [novice] },
        { name: 'Judge B', residence: null, classes: [] },
      ];
      expect(result).toEqual([both, both]);
    });
  });
});
