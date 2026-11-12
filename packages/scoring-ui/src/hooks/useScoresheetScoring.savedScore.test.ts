/**
 * What a scoresheet saves, and what it refuses to save (MYK9-1805).
 *
 * `useScoresheetScoring.test.ts` covers the form's state; this file pins the
 * values that leave it: the saved payload, the validation verdict, and the
 * rules that decide a result on the judge's behalf.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { useScoresheetScoring, type ScoresheetScoringConfig } from './useScoresheetScoring';
import type { ResolvedClassRules, ScoreData } from '../types';

const rulesFor = (overrides: Partial<ResolvedClassRules> = {}): ResolvedClassRules => ({
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
  ...overrides,
});

const savedScore = (overrides: Partial<ScoreData> = {}): ScoreData => ({
  resultText: 'Q',
  searchTime: '0:45.20',
  areas: { 'area 1': '0:45.20 FOUND CORRECT' },
  areaTimes: ['0:45.20'],
  correctCount: 2,
  incorrectCount: 1,
  faultCount: 0,
  finishCallErrors: 0,
  points: 0,
  ...overrides,
});

const setup = (config: Partial<ScoresheetScoringConfig> = {}) =>
  renderHook(() => useScoresheetScoring({ rules: rulesFor(), ...config }));

describe('useScoresheetScoring: a fresh sheet', () => {
  it('starts with nothing marked, no reason and no submission in flight', () => {
    const { result } = setup();
    expect(result.current.areas).toEqual([
      { areaName: 'Area 1', time: '', found: false, correct: false },
    ]);
    expect(result.current.nonQualifyingReason).toBe('');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.disqualifyReasonMissing).toBe(false);
  });
});

describe('useScoresheetScoring: reopening a saved score', () => {
  it('reads each area found / correct mark back from its saved words', () => {
    const { result } = setup({
      rules: rulesFor({ areaCount: 5 }),
      existingScore: savedScore({
        areas: {
          'area 1': '1:00.00 FOUND CORRECT',
          'area 2': '0:30.00 NOT FOUND INCORRECT',
          'area 3': '0:10.00 FOUND INCORRECT',
          'area 4': '0:05.00 NOT FOUND CORRECT',
          'area 5': '0:01.00',
        },
        areaTimes: ['1:00.00', '0:30.00', '0:10.00', '0:05.00', '0:01.00'],
      }),
    });

    expect(result.current.areas.map(area => [area.found, area.correct])).toEqual([
      [true, true],
      [false, false],
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it('opens an area with a blank time when the saved score has no area times', () => {
    const legacy = savedScore();
    delete (legacy as Partial<ScoreData>).areaTimes;
    const { result } = setup({ existingScore: legacy });

    expect(result.current.areas[0]).toEqual({
      areaName: 'Area 1',
      time: '',
      found: true,
      correct: true,
    });
  });

  it('carries finish-call errors and points through a correction unchanged', () => {
    const { result } = setup({ existingScore: savedScore({ finishCallErrors: 2, points: 15 }) });
    expect(result.current.buildScoreData()).toEqual(
      expect.objectContaining({ finishCallErrors: 2, points: 15 })
    );
  });

  it('saves 0 finish-call errors and 0 points for a new score', () => {
    const { result } = setup();
    const data = result.current.buildScoreData();
    expect(data.finishCallErrors).toBe(0);
    expect(data.points).toBe(0);
  });

  it('recounts finds once the judge changes a correct mark', () => {
    const { result } = setup({ existingScore: savedScore() });
    act(() => result.current.handleAreaUpdate(0, 'correct', false));
    expect(result.current.buildScoreData()).toEqual(
      expect.objectContaining({ correctCount: 0, incorrectCount: 1 })
    );
  });

  it('recounts finds once the judge changes a found mark', () => {
    const { result } = setup({ existingScore: savedScore() });
    act(() => result.current.handleAreaUpdate(0, 'found', false));
    expect(result.current.buildScoreData()).toEqual(
      expect.objectContaining({ correctCount: 1, incorrectCount: 0 })
    );
  });

  it('recounts finds when the result becomes a disqualification', () => {
    const { result } = setup({ existingScore: savedScore() });
    act(() => result.current.setQualifying('DQ'));
    expect(result.current.buildScoreData()).toEqual(
      expect.objectContaining({ correctCount: 0, incorrectCount: 1 })
    );
  });
});

describe('useScoresheetScoring: the saved payload', () => {
  it('writes each area as its time followed by the found and correct words', () => {
    const { result } = setup({ rules: rulesFor({ areaCount: 2 }) });
    act(() => {
      result.current.handleAreaUpdate(0, 'time', '1:23.00');
      result.current.handleAreaUpdate(0, 'found', true);
      result.current.handleAreaUpdate(0, 'correct', true);
    });

    expect(result.current.buildScoreData().areas).toEqual({
      'area 1': '1:23.00 FOUND CORRECT',
      'area 2': ' NOT FOUND INCORRECT',
    });
  });

  it('writes only the time for a sport that does not record finds', () => {
    const { result } = setup({ recordFinds: false });
    act(() => result.current.handleAreaUpdate(0, 'time', '0:45.20'));
    expect(result.current.buildScoreData().areas).toEqual({ 'area 1': '0:45.20' });
  });

  it('counts correct areas, and incorrect only among areas that were timed', () => {
    const { result } = setup({ rules: rulesFor({ areaCount: 4 }) });
    act(() => {
      result.current.handleAreaUpdate(0, 'time', '0:10.00');
      result.current.handleAreaUpdate(0, 'correct', true);
      result.current.handleAreaUpdate(1, 'time', '0:20.00');
      result.current.handleAreaUpdate(2, 'time', '0:30.00');
    });

    expect(result.current.buildScoreData()).toEqual(
      expect.objectContaining({ correctCount: 1, incorrectCount: 2 })
    );
  });

  it('saves NQ when no result was chosen', () => {
    const { result } = setup();
    expect(result.current.buildScoreData().resultText).toBe('NQ');
  });

  it('keeps the reason on a non-qualifying result', () => {
    const { result } = setup();
    act(() => {
      result.current.setQualifying('NQ');
      result.current.setNonQualifyingReason('Handler error');
    });
    expect(result.current.buildScoreData().nonQualifyingReason).toBe('Handler error');
  });

  it('saves no reason when a non-qualifying result has none', () => {
    const { result } = setup();
    act(() => result.current.setQualifying('NQ'));
    expect(result.current.buildScoreData().nonQualifyingReason).toBeUndefined();
  });

  it('drops a leftover reason once the result is Q', () => {
    const { result } = setup();
    act(() => {
      result.current.setNonQualifyingReason('Handler error');
      result.current.setQualifying('Q');
    });
    expect(result.current.buildScoreData().nonQualifyingReason).toBeUndefined();
  });

  it('hands the built score, with the caller extras, to the save', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = setup();
    act(() => {
      result.current.setQualifying('Q');
      result.current.handleAreaUpdate(0, 'time', '0:45.20');
      result.current.setFaultCount(1);
    });
    await act(async () => {
      await result.current.handleSubmit(onSubmit, { element: 'Interior' });
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        resultText: 'Q',
        searchTime: '0:45.20',
        areaTimes: ['0:45.20'],
        faultCount: 1,
        element: 'Interior',
      })
    );
  });
});

describe('useScoresheetScoring: results the sheet decides', () => {
  it('clears faults and area marks on a disqualification, as on an excusal', () => {
    const { result } = setup();
    act(() => {
      result.current.setFaultCount(3);
      result.current.handleAreaUpdate(0, 'found', true);
      result.current.handleAreaUpdate(0, 'correct', true);
    });
    act(() => result.current.setQualifying('DQ'));

    expect(result.current.faultCount).toBe(0);
    expect(result.current.areas[0]).toEqual(
      expect.objectContaining({ found: false, correct: false })
    );
  });

  it('keeps faults and area marks on a plain NQ', () => {
    const { result } = setup();
    act(() => {
      result.current.setFaultCount(3);
      result.current.handleAreaUpdate(0, 'found', true);
      result.current.handleAreaUpdate(0, 'correct', true);
    });
    act(() => result.current.setQualifying('NQ'));

    expect(result.current.faultCount).toBe(3);
    expect(result.current.areas[0]).toEqual(
      expect.objectContaining({ found: true, correct: true })
    );
  });

  it.each(['', 'Q', 'NQ'] as const)(
    'max time expiring turns a %j result into NQ "Max Time"',
    chosen => {
      const { result } = setup();
      act(() => result.current.setQualifying(chosen));
      act(() => result.current.applyMaxTimeNQ());

      expect(result.current.qualifying).toBe('NQ');
      expect(result.current.nonQualifyingReason).toBe('Max Time');
    }
  );

  it.each(['DQ', 'EX', 'ABS'] as const)(
    'max time expiring never overwrites a %s the judge chose',
    chosen => {
      const { result } = setup();
      act(() => {
        result.current.setQualifying(chosen);
        result.current.setNonQualifyingReason('Judge reason');
      });
      act(() => result.current.applyMaxTimeNQ());

      expect(result.current.qualifying).toBe(chosen);
      expect(result.current.nonQualifyingReason).toBe('Judge reason');
    }
  );
});

describe('useScoresheetScoring: what validation refuses', () => {
  it('refuses a disqualification with no reason', () => {
    const { result } = setup();
    act(() => result.current.setQualifying('DQ'));

    expect(result.current.disqualifyReasonMissing).toBe(true);
    expect(result.current.validate()).toEqual({
      valid: false,
      errors: ['A disqualification needs a reason'],
      warnings: [],
    });
  });

  it('treats a reason of only spaces as no reason', () => {
    const { result } = setup();
    act(() => {
      result.current.setQualifying('DQ');
      result.current.setNonQualifyingReason('   ');
    });
    expect(result.current.disqualifyReasonMissing).toBe(true);
  });

  it('accepts a disqualification once it has a reason', () => {
    const { result } = setup();
    act(() => {
      result.current.setQualifying('DQ');
      result.current.setNonQualifyingReason('Aggression');
    });

    expect(result.current.disqualifyReasonMissing).toBe(false);
    expect(result.current.validate()).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('asks for a reason only on a disqualification', () => {
    const { result } = setup();
    act(() => result.current.setQualifying('NQ'));

    expect(result.current.disqualifyReasonMissing).toBe(false);
    expect(result.current.validate().errors).toEqual([]);
  });

  it('names the area whose time is not a valid time', () => {
    const { result } = setup({ rules: rulesFor({ areaCount: 2 }) });
    act(() => {
      result.current.setQualifying('Q');
      result.current.handleAreaUpdate(0, 'time', '0:30.00');
      result.current.handleAreaUpdate(1, 'time', '1:99.00');
    });

    expect(result.current.hasUnresolvedTime).toBe(true);
    expect(result.current.validate().errors).toEqual(['Area 2 time is not a valid time']);
  });

  it('reads an area time as a scoring time, hundredths included', () => {
    const { result } = setup();
    act(() => {
      result.current.setQualifying('Q');
      result.current.handleAreaUpdate(0, 'time', '1:23.45');
    });

    expect(result.current.hasUnresolvedTime).toBe(false);
    expect(result.current.validate()).toEqual({ valid: true, errors: [], warnings: [] });
  });

  // Five bare digits are 1:23.45 as a scoring time and too many for a max time.
  it('reads bare digits as a scoring time, never as a max time', () => {
    const { result } = setup();
    act(() => {
      result.current.setQualifying('Q');
      result.current.handleAreaUpdate(0, 'time', '12345');
    });

    expect(result.current.hasUnresolvedTime).toBe(false);
    expect(result.current.validate()).toEqual({ valid: true, errors: [], warnings: [] });
  });
});

describe('useScoresheetScoring: the over-max-time warning', () => {
  const timed = (maxTimeSeconds: number, time: string) => {
    const hook = setup({ rules: rulesFor({ maxTimeSeconds }) });
    act(() => {
      hook.result.current.setQualifying('Q');
      hook.result.current.handleAreaUpdate(0, 'time', time);
    });
    return hook.result.current.validate();
  };

  it('states the time and the limit as m:ss', () => {
    expect(timed(65, '2:00.50')).toEqual({
      valid: true,
      errors: [],
      warnings: ['Time 2:00.50 exceeds max 1:05'],
    });
  });

  it('does not warn for a time exactly at the limit', () => {
    expect(timed(180, '3:00.00').warnings).toEqual([]);
  });

  it('warns one hundredth past the limit', () => {
    expect(timed(180, '3:00.01').warnings).toEqual(['Time 3:00.01 exceeds max 3:00']);
  });

  it('does not warn under the limit', () => {
    expect(timed(180, '2:59.99').warnings).toEqual([]);
  });

  it('warns for an over-limit time typed as bare digits', () => {
    expect(timed(60, '12345').warnings).toHaveLength(1);
  });

  it('never warns when the class has no time limit', () => {
    expect(timed(0, '9:00.00').warnings).toEqual([]);
  });
});

describe('useScoresheetScoring: submitting', () => {
  it('reports a submission in flight until the save settles', async () => {
    let finishSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishSubmit = resolve;
        })
    );
    const { result } = setup();
    act(() => result.current.setQualifying('Q'));

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.handleSubmit(onSubmit);
    });
    expect(result.current.isSubmitting).toBe(true);

    await act(async () => {
      finishSubmit?.();
      await pending;
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('shows why a save failed, and clears it when the retry succeeds', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce('not an Error')
      .mockResolvedValueOnce(undefined);
    const { result } = setup();
    act(() => result.current.setQualifying('Q'));

    await act(async () => {
      await result.current.handleSubmit(onSubmit);
    });
    expect(result.current.submitError).toBe('offline');

    await act(async () => {
      await result.current.handleSubmit(onSubmit);
    });
    expect(result.current.submitError).toBe('Score submission failed');

    await act(async () => {
      await result.current.handleSubmit(onSubmit);
    });
    expect(result.current.submitError).toBeNull();
  });
});

describe('useScoresheetScoring: reset', () => {
  it('clears the reason along with the result', () => {
    const { result } = setup();
    act(() => {
      result.current.setQualifying('NQ');
      result.current.setNonQualifyingReason('Handler error');
    });
    act(() => result.current.reset());

    expect(result.current.nonQualifyingReason).toBe('');
    expect(result.current.buildScoreData().nonQualifyingReason).toBeUndefined();
  });

  it('rebuilds the areas from the rules in force at the time of the reset', () => {
    const { result, rerender } = renderHook(
      ({ rules }: { rules: ResolvedClassRules }) => useScoresheetScoring({ rules }),
      { initialProps: { rules: rulesFor({ areaCount: 1 }) } }
    );
    rerender({ rules: rulesFor({ areaCount: 2 }) });
    act(() => result.current.reset());

    expect(result.current.areas.map(area => area.areaName)).toEqual(['Area 1', 'Area 2']);
  });
});
