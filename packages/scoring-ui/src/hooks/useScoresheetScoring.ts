/**
 * useScoresheetScoring Hook
 *
 * Core scoring state management for all scoresheet types.
 * Pure form state — no routing, data fetching, or persistence.
 *
 * Used by both LiveScoresheet (judge) and EntryScoresheet (secretary).
 */

import { useState, useCallback } from 'react';

import type { AreaScore, ScoreData, ExtendedResult, ResolvedClassRules } from '../types';

export interface ScoresheetScoringConfig {
  rules: ResolvedClassRules;
  areaNames?: string[];
  existingScore?: ScoreData;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ScoresheetScoringReturn {
  areas: AreaScore[];
  qualifying: ExtendedResult | '';
  setQualifying: (value: ExtendedResult | '') => void;
  nonQualifyingReason: string;
  setNonQualifyingReason: (value: string) => void;
  faultCount: number;
  setFaultCount: (value: number) => void;
  isSubmitting: boolean;
  submitError: string | null;
  handleAreaUpdate: (
    index: number,
    field: keyof AreaScore,
    value: AreaScore[keyof AreaScore]
  ) => void;
  calculateTotalTime: () => string;
  handleSubmit: (
    onSubmit: (data: ScoreData) => void | Promise<void>,
    extra?: Partial<ScoreData>
  ) => Promise<void>;
  buildScoreData: (extra?: Partial<ScoreData>) => ScoreData;
  validate: () => ValidationResult;
  reset: () => void;
}

function initializeAreas(
  rules: ResolvedClassRules,
  areaNames?: string[],
  existingScore?: ScoreData
): AreaScore[] {
  const count = rules.areaCount || 1;
  return Array.from({ length: count }, (_, i) => {
    const name = areaNames?.[i] ?? `Area ${i + 1}`;
    const key = name.toLowerCase();
    const existingArea = existingScore?.areas?.[key];

    if (existingArea) {
      return {
        areaName: name,
        time: existingScore?.areaTimes?.[i] ?? '',
        found: existingArea.includes('FOUND') && !existingArea.includes('NOT FOUND'),
        correct: existingArea.includes('CORRECT') && !existingArea.includes('INCORRECT'),
      };
    }

    return { areaName: name, time: '', found: false, correct: false };
  });
}

export function useScoresheetScoring(config: ScoresheetScoringConfig): ScoresheetScoringReturn {
  const { rules, areaNames, existingScore } = config;

  const [areas, setAreas] = useState<AreaScore[]>(() =>
    initializeAreas(rules, areaNames, existingScore)
  );
  const [qualifying, setQualifyingRaw] = useState<ExtendedResult | ''>(
    (existingScore?.resultText as ExtendedResult) ?? ''
  );
  const [nonQualifyingReason, setNonQualifyingReason] = useState(
    existingScore?.nonQualifyingReason ?? ''
  );
  const [faultCount, setFaultCount] = useState(existingScore?.faultCount ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setQualifying = useCallback((value: ExtendedResult | '') => {
    setQualifyingRaw(value);
    if (value === 'EX') {
      setFaultCount(0);
      setAreas(prev => prev.map(area => ({ ...area, found: false, correct: false })));
    }
  }, []);

  const handleAreaUpdate = useCallback(
    (index: number, field: keyof AreaScore, value: AreaScore[keyof AreaScore]) => {
      setAreas(prev => prev.map((area, i) => (i === index ? { ...area, [field]: value } : area)));
    },
    []
  );

  const calculateTotalTime = useCallback((): string => {
    const validTimes = areas.filter(area => area.time && area.time !== '').map(area => area.time);

    if (validTimes.length === 0) return '0.00';
    if (validTimes.length === 1) return validTimes[0];

    const totalSeconds = validTimes.reduce((sum, time) => {
      const parts = time.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseFloat(parts[1]) || 0;
        return sum + (minutes * 60 + seconds);
      }
      return sum + (parseFloat(time) || 0);
    }, 0);

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(2);
    return `${minutes}:${seconds.padStart(5, '0')}`;
  }, [areas]);

  const buildScoreData = useCallback(
    (extra?: Partial<ScoreData>): ScoreData => {
      const areaResults: Record<string, string> = {};
      areas.forEach(area => {
        areaResults[area.areaName.toLowerCase()] =
          `${area.time}${area.found ? ' FOUND' : ' NOT FOUND'}${area.correct ? ' CORRECT' : ' INCORRECT'}`;
      });

      return {
        resultText: qualifying || 'NQ',
        searchTime: calculateTotalTime() || '0.00',
        nonQualifyingReason: qualifying === 'Q' ? undefined : nonQualifyingReason || undefined,
        areas: areaResults,
        areaTimes: areas.map(a => a.time).filter(t => t && t !== ''),
        correctCount: areas.filter(a => a.correct).length,
        incorrectCount: areas.filter(a => !a.correct && a.time !== '').length,
        faultCount,
        finishCallErrors: 0,
        points: 0,
        ...extra,
      };
    },
    [areas, qualifying, nonQualifyingReason, faultCount, calculateTotalTime]
  );

  const validate = useCallback((): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!qualifying) {
      errors.push('No result selected');
    }

    if (rules.maxTimeSeconds > 0) {
      const totalTime = calculateTotalTime();
      if (totalTime !== '0.00') {
        const parts = totalTime.split(':');
        const totalSeconds =
          parts.length === 2
            ? (parseInt(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0)
            : parseFloat(totalTime) || 0;
        if (totalSeconds > rules.maxTimeSeconds) {
          warnings.push(
            `Time ${totalTime} exceeds max ${Math.floor(rules.maxTimeSeconds / 60)}:${String(rules.maxTimeSeconds % 60).padStart(2, '0')}`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }, [qualifying, rules.maxTimeSeconds, calculateTotalTime]);

  const handleSubmit = useCallback(
    async (onSubmit: (data: ScoreData) => void | Promise<void>, extra?: Partial<ScoreData>) => {
      const validation = validate();
      if (!validation.valid) return;

      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await onSubmit(buildScoreData(extra));
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Score submission failed');
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, buildScoreData]
  );

  const reset = useCallback(() => {
    setAreas(initializeAreas(rules, areaNames));
    setQualifyingRaw('');
    setNonQualifyingReason('');
    setFaultCount(0);
    setSubmitError(null);
  }, [rules, areaNames]);

  return {
    areas,
    qualifying,
    setQualifying,
    nonQualifyingReason,
    setNonQualifyingReason,
    faultCount,
    setFaultCount,
    isSubmitting,
    submitError,
    handleAreaUpdate,
    calculateTotalTime,
    handleSubmit,
    buildScoreData,
    validate,
    reset,
  };
}
