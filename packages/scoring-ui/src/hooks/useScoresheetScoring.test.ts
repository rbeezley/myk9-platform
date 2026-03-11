import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { useScoresheetScoring } from './useScoresheetScoring';
import type { ResolvedClassRules } from '../types';

const defaultRules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

describe('useScoresheetScoring', () => {
  it('initializes with empty areas based on rules.areaCount', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    expect(result.current.areas).toHaveLength(1);
    expect(result.current.areas[0].areaName).toBe('Area 1');
    expect(result.current.areas[0].time).toBe('');
    expect(result.current.areas[0].found).toBe(false);
  });

  it('initializes multiple areas for multi-area rules', () => {
    const rules = { ...defaultRules, areaCount: 3 };
    const { result } = renderHook(() => useScoresheetScoring({ rules }));
    expect(result.current.areas).toHaveLength(3);
    expect(result.current.areas[2].areaName).toBe('Area 3');
  });

  it('initializes with custom area names', () => {
    const { result } = renderHook(() =>
      useScoresheetScoring({
        rules: { ...defaultRules, areaCount: 2 },
        areaNames: ['Interior', 'Exterior'],
      })
    );
    expect(result.current.areas[0].areaName).toBe('Interior');
    expect(result.current.areas[1].areaName).toBe('Exterior');
  });

  it('starts with no qualifying result selected', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    expect(result.current.qualifying).toBe('');
  });

  it('updates qualifying result', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    act(() => result.current.setQualifying('Q'));
    expect(result.current.qualifying).toBe('Q');
  });

  it('auto-clears faults and area marks when EX is selected', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    act(() => {
      result.current.setFaultCount(3);
      result.current.handleAreaUpdate(0, 'found', true);
      result.current.handleAreaUpdate(0, 'correct', true);
    });
    expect(result.current.faultCount).toBe(3);
    expect(result.current.areas[0].found).toBe(true);

    act(() => result.current.setQualifying('EX'));
    expect(result.current.faultCount).toBe(0);
    expect(result.current.areas[0].found).toBe(false);
    expect(result.current.areas[0].correct).toBe(false);
    expect(result.current.qualifying).toBe('EX');
  });

  it('updates area fields via handleAreaUpdate', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    act(() => result.current.handleAreaUpdate(0, 'time', '1:23.45'));
    expect(result.current.areas[0].time).toBe('1:23.45');

    act(() => result.current.handleAreaUpdate(0, 'found', true));
    expect(result.current.areas[0].found).toBe(true);
  });

  it('calculates total time from single area', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    act(() => result.current.handleAreaUpdate(0, 'time', '1:23.45'));
    expect(result.current.calculateTotalTime()).toBe('1:23.45');
  });

  it('calculates total time by summing multiple areas', () => {
    const rules = { ...defaultRules, areaCount: 2 };
    const { result } = renderHook(() => useScoresheetScoring({ rules }));
    act(() => {
      result.current.handleAreaUpdate(0, 'time', '1:00.00');
      result.current.handleAreaUpdate(1, 'time', '0:30.00');
    });
    expect(result.current.calculateTotalTime()).toBe('1:30.00');
  });

  it('returns 0.00 for total time when no areas have time', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    expect(result.current.calculateTotalTime()).toBe('0.00');
  });

  it('builds ScoreData on buildScoreData call', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    act(() => {
      result.current.handleAreaUpdate(0, 'time', '1:23.00');
      result.current.handleAreaUpdate(0, 'found', true);
      result.current.handleAreaUpdate(0, 'correct', true);
      result.current.setQualifying('Q');
    });
    const scoreData = result.current.buildScoreData();
    expect(scoreData.resultText).toBe('Q');
    expect(scoreData.searchTime).toBe('1:23.00');
    expect(scoreData.areaTimes).toEqual(['1:23.00']);
    expect(scoreData.areas['area 1']).toContain('FOUND');
    expect(scoreData.areas['area 1']).toContain('CORRECT');
  });

  it('pre-fills from existingScore', () => {
    const { result } = renderHook(() =>
      useScoresheetScoring({
        rules: defaultRules,
        existingScore: {
          resultText: 'NQ',
          searchTime: '2:00.00',
          nonQualifyingReason: 'Handler error',
          areas: { 'area 1': '2:00.00 NOT FOUND INCORRECT' },
          areaTimes: ['2:00.00'],
          correctCount: 0,
          incorrectCount: 1,
          faultCount: 2,
          finishCallErrors: 0,
          points: 0,
        },
      })
    );
    expect(result.current.qualifying).toBe('NQ');
    expect(result.current.nonQualifyingReason).toBe('Handler error');
    expect(result.current.faultCount).toBe(2);
  });

  it('validates: blocks submit when no result selected', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    const validation = result.current.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('No result selected');
  });

  it('validates: passes when result is selected', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    act(() => result.current.setQualifying('Q'));
    const validation = result.current.validate();
    expect(validation.valid).toBe(true);
  });

  it('validates: warns when time exceeds max', () => {
    const rules = { ...defaultRules, maxTimeSeconds: 60 };
    const { result } = renderHook(() => useScoresheetScoring({ rules }));
    act(() => {
      result.current.setQualifying('Q');
      result.current.handleAreaUpdate(0, 'time', '2:00.00');
    });
    const validation = result.current.validate();
    expect(validation.valid).toBe(true);
    expect(validation.warnings.length).toBeGreaterThan(0);
  });

  it('resets all state', () => {
    const { result } = renderHook(() => useScoresheetScoring({ rules: defaultRules }));
    act(() => {
      result.current.setQualifying('Q');
      result.current.setFaultCount(5);
      result.current.handleAreaUpdate(0, 'time', '1:00.00');
    });
    act(() => result.current.reset());
    expect(result.current.qualifying).toBe('');
    expect(result.current.faultCount).toBe(0);
    expect(result.current.areas[0].time).toBe('');
  });
});
