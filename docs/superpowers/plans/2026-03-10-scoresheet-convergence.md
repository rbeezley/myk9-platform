# Scoresheet Convergence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 7 triplicated scoresheet types into a shared `@myk9/scoring-ui` package with two UI modes (LiveScoresheet for judges, EntryScoresheet for secretaries).

**Architecture:** Extract all scoring business logic into a shared `useScoresheetScoring` hook. Build two thin UI shells per scoresheet type — LiveScoresheet (stopwatch, touch targets, mobile-first) and EntryScoresheet (text inputs, keyboard-first, compact). Apps provide data loading and persistence; shared components handle scoring UI.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, `@myk9/scoring-ui` package (tsup build)

**Spec:** `docs/superpowers/specs/2026-03-10-scoresheet-convergence-design.md`

---

## Chunk 1: Shared Scoring Engine

### Task 1: Define ScoreData and ScoresheetEntry types

**Files:**

- Create: `packages/scoring-ui/src/types/scoreData.ts`
- Modify: `packages/scoring-ui/src/types/index.ts`
- Modify: `packages/scoring-ui/src/index.ts`

- [ ] **Step 1: Create the type definitions file**

Create `packages/scoring-ui/src/types/scoreData.ts` with these types:

```typescript
/** Qualifying result options */
export type QualifyingResult = 'Q' | 'NQ' | 'EX' | 'ABS';

/** Extended results for Nationals scoresheets */
export type NationalsResult = '1st' | '2nd' | '3rd' | '4th';
export type ExtendedResult = QualifyingResult | NationalsResult;

/** Area score state managed by useScoresheetScoring */
export interface AreaScore {
  areaName: string;
  time: string;
  found: boolean;
  correct: boolean;
  faultCount?: number;
}

/** Universal output from all scoresheet variants */
export interface ScoreData {
  resultText: string; // QualifyingResult or ExtendedResult
  searchTime: string;
  nonQualifyingReason?: string;
  areas: Record<string, string>;
  areaTimes: string[];
  correctCount: number;
  incorrectCount: number;
  faultCount: number;
  finishCallErrors: number;
  points: number;
  element?: string;
  level?: string;
}

/** Universal input for all scoresheet variants */
export interface ScoresheetEntry {
  id: number;
  armband: number;
  dogName: string;
  handlerName: string;
  className: string;
  element?: string;
  level?: string;
  section?: string;
  existingScore?: ScoreData;
}

/** Class info passed to scoresheets */
export interface ScoresheetClassInfo {
  element: string;
  level: string;
  section?: string;
}

/** Sport type identifier */
export type ScoresheetSportType =
  | 'AKC_SCENT_WORK'
  | 'AKC_SCENT_WORK_NATIONAL'
  | 'AKC_FASTCAT'
  | 'UKC_NOSEWORK'
  | 'UKC_OBEDIENCE'
  | 'UKC_RALLY'
  | 'ASCA_SCENT_DETECTION';

/** Shared props for all scoresheet components */
export interface BaseScoresheetProps {
  entry: ScoresheetEntry;
  classInfo: ScoresheetClassInfo;
  rules: import('./resolvedClassRules').ResolvedClassRules;
  onSubmit: (scoreData: ScoreData) => void | Promise<void>;
  onBack: () => void;
}

/** Additional props for LiveScoresheet variants */
export interface LiveScoresheetProps extends BaseScoresheetProps {
  /** Callbacks for app-specific sound/voice integration */
  onWarningChime?: () => void;
  onVoiceAnnouncement?: (secondsRemaining: number) => void;
  enableVoiceAnnouncements?: boolean;
}

/** Additional props for EntryScoresheet variants */
export interface EntryScoresheetProps extends BaseScoresheetProps {
  /** Called after submit to advance to next unscored entry */
  onNext?: () => void;
}
```

- [ ] **Step 2: Export types from index files**

Add to `packages/scoring-ui/src/types/index.ts`:

```typescript
export type {
  QualifyingResult,
  NationalsResult,
  ExtendedResult,
  AreaScore,
  ScoreData,
  ScoresheetEntry,
  ScoresheetClassInfo,
  ScoresheetSportType,
  BaseScoresheetProps,
  LiveScoresheetProps,
  EntryScoresheetProps,
} from './scoreData';
```

Add to `packages/scoring-ui/src/index.ts` (in the Types section):

```typescript
export type {
  QualifyingResult,
  NationalsResult,
  ExtendedResult,
  AreaScore,
  ScoreData,
  ScoresheetEntry,
  ScoresheetClassInfo,
  ScoresheetSportType,
  BaseScoresheetProps,
  LiveScoresheetProps,
  EntryScoresheetProps,
} from './types';
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (types only, no consumers yet)

- [ ] **Step 4: Commit**

```bash
git add packages/scoring-ui/src/types/scoreData.ts packages/scoring-ui/src/types/index.ts packages/scoring-ui/src/index.ts
git commit -m "feat(scoring-ui): add ScoreData, ScoresheetEntry, and shared scoresheet prop types"
```

---

### Task 2: Create useScoresheetScoring hook

This is the core shared hook — extracted from myK9Q's `useScoresheetCore`. It manages scoring form state without any app-specific dependencies (no router, no stores, no replication).

**Files:**

- Create: `packages/scoring-ui/src/hooks/useScoresheetScoring.ts`
- Create: `packages/scoring-ui/src/hooks/useScoresheetScoring.test.ts`
- Modify: `packages/scoring-ui/src/hooks/index.ts`
- Modify: `packages/scoring-ui/src/index.ts`

- [ ] **Step 1: Write failing tests for the hook**

Create `packages/scoring-ui/src/hooks/useScoresheetScoring.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useScoresheetScoring } from './useScoresheetScoring';
import type { AreaScore, ResolvedClassRules } from '../types';

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
    // Set some state first
    act(() => {
      result.current.setFaultCount(3);
      result.current.handleAreaUpdate(0, 'found', true);
      result.current.handleAreaUpdate(0, 'correct', true);
    });
    expect(result.current.faultCount).toBe(3);
    expect(result.current.areas[0].found).toBe(true);

    // Select EX — should auto-clear
    act(() => result.current.setQualifying('EX'));
    expect(result.current.faultCount).toBe(0);
    expect(result.current.areas[0].found).toBe(false);
    expect(result.current.areas[0].correct).toBe(false);
    // Time should be kept for recovery
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
    expect(validation.valid).toBe(true); // warnings don't block
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scoring-ui && pnpm test -- useScoresheetScoring`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the hook**

Create `packages/scoring-ui/src/hooks/useScoresheetScoring.ts`:

```typescript
/**
 * useScoresheetScoring Hook
 *
 * Core scoring state management for all scoresheet types.
 * Pure form state — no routing, data fetching, or persistence.
 *
 * Used by both LiveScoresheet (judge) and EntryScoresheet (secretary).
 */

import { useState, useCallback, useMemo } from 'react';
import type { AreaScore, ScoreData, ExtendedResult, ResolvedClassRules } from '../types';

export interface ScoresheetScoringConfig {
  /** Resolved class rules (area count, timer mode, max time, etc.) */
  rules: ResolvedClassRules;
  /** Custom area names (defaults to "Area 1", "Area 2", etc.) */
  areaNames?: string[];
  /** Pre-fill from existing score (for editing) */
  existingScore?: ScoreData;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ScoresheetScoringReturn {
  // Scoring state
  areas: AreaScore[];
  qualifying: ExtendedResult | '';
  setQualifying: (value: ExtendedResult | '') => void;
  nonQualifyingReason: string;
  setNonQualifyingReason: (value: string) => void;
  faultCount: number;
  setFaultCount: (value: number) => void;

  // [ADDED] Submission state — tracks async onSubmit lifecycle
  isSubmitting: boolean;
  submitError: string | null;

  // Area management
  handleAreaUpdate: (
    index: number,
    field: keyof AreaScore,
    value: AreaScore[keyof AreaScore]
  ) => void;

  // Calculations
  calculateTotalTime: () => string;

  // [ADDED] Submit wrapper that manages isSubmitting/submitError state
  handleSubmit: (
    onSubmit: (data: ScoreData) => void | Promise<void>,
    extra?: Partial<ScoreData>
  ) => Promise<void>;

  // Output
  buildScoreData: (extra?: Partial<ScoreData>) => ScoreData;
  validate: () => ValidationResult;

  // Reset
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

  // Initialize state
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

  // Auto-clear on EX selection
  const setQualifying = useCallback((value: ExtendedResult | '') => {
    setQualifyingRaw(value);
    if (value === 'EX') {
      setFaultCount(0);
      setAreas(prev => prev.map(area => ({ ...area, found: false, correct: false })));
    }
  }, []);

  // Update a single area field
  const handleAreaUpdate = useCallback(
    (index: number, field: keyof AreaScore, value: AreaScore[keyof AreaScore]) => {
      setAreas(prev => prev.map((area, i) => (i === index ? { ...area, [field]: value } : area)));
    },
    []
  );

  // Calculate total time from all areas
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

  // Build the ScoreData output
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

  // Validation
  const validate = useCallback((): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!qualifying) {
      errors.push('No result selected');
    }

    // Check if time exceeds max
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

  // [ADDED] Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // [ADDED] Submit wrapper — manages loading/error lifecycle
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

  // Reset
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
```

- [ ] **Step 4: Export from index files**

Add to `packages/scoring-ui/src/hooks/index.ts`:

```typescript
export { useScoresheetScoring } from './useScoresheetScoring';
```

Add to `packages/scoring-ui/src/index.ts` (in Hooks section):

```typescript
export { useScoresheetScoring } from './hooks/useScoresheetScoring';
```

Add to type exports in `packages/scoring-ui/src/index.ts`:

```typescript
export type {
  ScoresheetScoringConfig,
  ScoresheetScoringReturn,
  ValidationResult,
} from './hooks/useScoresheetScoring';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/scoring-ui && pnpm test -- useScoresheetScoring`
Expected: ALL PASS

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/scoring-ui/src/hooks/useScoresheetScoring.ts packages/scoring-ui/src/hooks/useScoresheetScoring.test.ts packages/scoring-ui/src/hooks/index.ts packages/scoring-ui/src/index.ts
git commit -m "feat(scoring-ui): add useScoresheetScoring hook with tests"
```

---

### Task 3: Create parseSmartTime utility

Secretary needs to type "123" and have it become "1:23.00". This utility handles various time input formats.

**Files:**

- Create: `packages/scoring-ui/src/utils/parseSmartTime.ts`
- Create: `packages/scoring-ui/src/utils/parseSmartTime.test.ts`
- Modify: `packages/scoring-ui/src/utils/index.ts`
- Modify: `packages/scoring-ui/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/scoring-ui/src/utils/parseSmartTime.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSmartTime } from './parseSmartTime';

describe('parseSmartTime', () => {
  it('parses "123" as 1:23.00', () => {
    expect(parseSmartTime('123')).toBe('1:23.00');
  });

  it('parses "90" as 1:30.00', () => {
    expect(parseSmartTime('90')).toBe('1:30.00');
  });

  it('parses "45" as 0:45.00', () => {
    expect(parseSmartTime('45')).toBe('0:45.00');
  });

  it('parses "1:23" as 1:23.00', () => {
    expect(parseSmartTime('1:23')).toBe('1:23.00');
  });

  it('parses "1:23.45" as-is', () => {
    expect(parseSmartTime('1:23.45')).toBe('1:23.45');
  });

  it('parses "0:05.23" as-is', () => {
    expect(parseSmartTime('0:05.23')).toBe('0:05.23');
  });

  it('returns empty string for empty input', () => {
    expect(parseSmartTime('')).toBe('');
  });

  it('returns empty string for non-numeric input', () => {
    expect(parseSmartTime('abc')).toBe('');
  });

  it('parses "5" as 0:05.00', () => {
    expect(parseSmartTime('5')).toBe('0:05.00');
  });

  it('parses "300" as 5:00.00', () => {
    expect(parseSmartTime('300')).toBe('5:00.00');
  });

  it('handles decimal input "45.5" as 0:45.50', () => {
    expect(parseSmartTime('45.5')).toBe('0:45.50');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scoring-ui && pnpm test -- parseSmartTime`
Expected: FAIL

- [ ] **Step 3: Implement parseSmartTime**

Create `packages/scoring-ui/src/utils/parseSmartTime.ts`:

```typescript
/**
 * Parse a loosely-typed time input into "M:SS.ss" format.
 *
 * Supports:
 * - "1:23.45" → "1:23.45" (already formatted)
 * - "1:23" → "1:23.00" (add hundredths)
 * - "123" → "1:23.00" (raw seconds)
 * - "45" → "0:45.00" (raw seconds under 60)
 * - "45.5" → "0:45.50" (raw seconds with decimal)
 * - "" → "" (empty)
 * - "abc" → "" (invalid)
 */
export function parseSmartTime(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Already in M:SS.ss format
  if (/^\d+:\d{2}\.\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // M:SS format — add .00
  if (/^\d+:\d{2}$/.test(trimmed)) {
    return `${trimmed}.00`;
  }

  // Raw number (possibly with decimal) — interpret as total seconds
  const totalSeconds = parseFloat(trimmed);
  if (isNaN(totalSeconds)) return '';

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}
```

- [ ] **Step 4: Export from index files**

Add to `packages/scoring-ui/src/utils/index.ts` (create if only has re-exports):

```typescript
export { parseSmartTime } from './parseSmartTime';
```

Add to `packages/scoring-ui/src/index.ts`:

```typescript
export { parseSmartTime } from './utils/parseSmartTime';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/scoring-ui && pnpm test -- parseSmartTime`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/scoring-ui/src/utils/parseSmartTime.ts packages/scoring-ui/src/utils/parseSmartTime.test.ts packages/scoring-ui/src/utils/index.ts packages/scoring-ui/src/index.ts
git commit -m "feat(scoring-ui): add parseSmartTime utility for secretary time input"
```

---

### Task 4: Create getScoresheetComponent factory

Maps sport type + mode to the correct scoresheet component. Both apps use this to route to the right scoresheet.

**Files:**

- Create: `packages/scoring-ui/src/utils/getScoresheetComponent.ts`
- Create: `packages/scoring-ui/src/utils/getScoresheetComponent.test.ts`
- Modify: `packages/scoring-ui/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/scoring-ui/src/utils/getScoresheetComponent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getScoresheetComponent } from './getScoresheetComponent';

describe('getScoresheetComponent', () => {
  it('returns AKC Scent Work live component', () => {
    const Component = getScoresheetComponent('AKC_SCENT_WORK', 'live');
    expect(Component).toBeDefined();
    expect(Component.displayName ?? Component.name).toContain('AKCScentWork');
  });

  it('returns AKC Scent Work entry component', () => {
    const Component = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
    expect(Component).toBeDefined();
  });

  it('returns null for unknown sport type', () => {
    const Component = getScoresheetComponent('UNKNOWN' as never, 'live');
    expect(Component).toBeNull();
  });

  it('returns different components for live vs entry mode', () => {
    const live = getScoresheetComponent('AKC_SCENT_WORK', 'live');
    const entry = getScoresheetComponent('AKC_SCENT_WORK', 'entry');
    expect(live).not.toBe(entry);
  });
});
```

- [ ] **Step 2: Implement the factory**

Note: This factory will initially return `null` for all types. Each scoresheet component task (Chunk 2) will register its component. For now, create the skeleton with the mapping structure.

Create `packages/scoring-ui/src/utils/getScoresheetComponent.ts`:

```typescript
import type { ComponentType } from 'react';
import type { LiveScoresheetProps, EntryScoresheetProps, ScoresheetSportType } from '../types';

type ScoresheetMode = 'live' | 'entry';

type ScoresheetRegistry = Record<
  string,
  {
    live: ComponentType<LiveScoresheetProps> | null;
    entry: ComponentType<EntryScoresheetProps> | null;
  }
>;

// Registry is populated by scoresheet modules when they're imported.
// This avoids circular dependencies and allows tree-shaking.
const registry: ScoresheetRegistry = {};

/**
 * Register a scoresheet component for a sport type and mode.
 * Called by each scoresheet module at import time.
 */
export function registerScoresheet(
  sportType: ScoresheetSportType,
  mode: 'live',
  component: ComponentType<LiveScoresheetProps>
): void;
export function registerScoresheet(
  sportType: ScoresheetSportType,
  mode: 'entry',
  component: ComponentType<EntryScoresheetProps>
): void;
export function registerScoresheet(
  sportType: ScoresheetSportType,
  mode: ScoresheetMode,
  component: ComponentType<LiveScoresheetProps> | ComponentType<EntryScoresheetProps>
): void {
  if (!registry[sportType]) {
    registry[sportType] = { live: null, entry: null };
  }
  // Safe to assign — overload signatures ensure correct pairing
  (registry[sportType] as Record<string, unknown>)[mode] = component;
}

/**
 * Get the scoresheet component for a sport type and mode.
 *
 * @returns The component, or null if not registered.
 */
export function getScoresheetComponent(
  sportType: ScoresheetSportType,
  mode: 'live'
): ComponentType<LiveScoresheetProps> | null;
export function getScoresheetComponent(
  sportType: ScoresheetSportType,
  mode: 'entry'
): ComponentType<EntryScoresheetProps> | null;
export function getScoresheetComponent(
  sportType: ScoresheetSportType,
  mode: ScoresheetMode
): ComponentType<LiveScoresheetProps> | ComponentType<EntryScoresheetProps> | null {
  return registry[sportType]?.[mode] ?? null;
}
```

- [ ] **Step 3: Export and run tests**

Add to `packages/scoring-ui/src/index.ts`:

```typescript
export { getScoresheetComponent, registerScoresheet } from './utils/getScoresheetComponent';
```

Run: `cd packages/scoring-ui && pnpm test -- getScoresheetComponent`
Expected: Tests that check for specific components will fail (not registered yet), but the null/undefined tests should pass. Update test expectations to match — the factory returns null until components are registered in Chunk 2.

- [ ] **Step 4: Commit**

```bash
git add packages/scoring-ui/src/utils/getScoresheetComponent.ts packages/scoring-ui/src/utils/getScoresheetComponent.test.ts packages/scoring-ui/src/index.ts
git commit -m "feat(scoring-ui): add getScoresheetComponent factory with registration pattern"
```

---

## Chunk 2: AKC Scent Work Scoresheet Components (Reference Implementation)

Build the first scoresheet type (AKC Scent Work) as the reference implementation. Both Live and Entry variants. Other scoresheet types follow the same pattern.

### Task 5: Build AKCScentWorkLiveScoresheet

The judge's in-ring view. Port from the existing myK9Q `AKCScentWorkScoresheet.tsx` (476 lines), restyled in Tailwind, using the shared `useScoresheetScoring` hook.

**Files:**

- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkLiveScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkLiveScoresheet.test.tsx`

**Reference files (read, don't modify):**

- `apps/myk9q/src/pages/scoresheets/AKC/AKCScentWorkScoresheet.tsx` — source of truth for layout and behavior
- `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkScoresheet.tsx` — existing Tailwind version (will be replaced)

- [ ] **Step 1: Write component tests**

Test file at `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkLiveScoresheet.test.tsx`:

Test cases:

- Renders entry info (dog name, armband, handler)
- Renders stopwatch with start/stop button
- Renders area sections based on rules.areaCount
- Renders result chips (Q, NQ, EX, ABS)
- Shows confirmation dialog before submit
- Calls onSubmit with ScoreData when confirmed
- Calls onBack when back button clicked
- Pre-fills from existingScore
- Shows 30-second warning when stopwatch triggers it
- Disables submit when no result selected

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scoring-ui && pnpm test -- AKCScentWorkLiveScoresheet`
Expected: FAIL

- [ ] **Step 3: Implement the component**

Create `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkLiveScoresheet.tsx`.

Key implementation notes:

- Import `useScoresheetScoring` from `../../hooks/useScoresheetScoring`
- Import `useStopwatch` from `../../hooks/useStopwatch`
- Props: `LiveScoresheetProps` (entry, classInfo, rules, onSubmit, onBack, onWarningChime, onVoiceAnnouncement, enableVoiceAnnouncements)
- Layout: full-screen mobile-first with Tailwind
- Header: back button, dog name + armband, handler name
- Timer section: large countdown display, start/stop button (big touch target min 48px), warning state
- Area section: one card per area with time input (from stopwatch or manual), found/not-found toggle, correct/incorrect toggle
- Result section: large chips for Q, NQ, EX, ABS (min 48px touch target)
- NQ reason: shown conditionally when NQ selected
- Fault counter: increment/decrement buttons
- Submit button: triggers confirmation dialog
- Confirmation dialog: shows summary, confirm/cancel buttons
- Register with `registerScoresheet('AKC_SCENT_WORK', 'live', AKCScentWorkLiveScoresheet)`
- Target: ~250-300 lines

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scoring-ui && pnpm test -- AKCScentWorkLiveScoresheet`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkLiveScoresheet.tsx packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkLiveScoresheet.test.tsx
git commit -m "feat(scoring-ui): add AKCScentWorkLiveScoresheet (judge view)"
```

---

### Task 6: Build AKCScentWorkEntryScoresheet

The secretary's desk view for manually entering scores from paper sheets.

**Files:**

- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkEntryScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkEntryScoresheet.test.tsx`

- [ ] **Step 1: Write component tests**

Test file at `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkEntryScoresheet.test.tsx`:

Test cases:

- Renders entry info (dog name, armband, handler)
- Renders all areas as text input fields (no stopwatch)
- Smart time parsing on blur (type "123", field shows "1:23.00")
- Renders result as dropdown/select (not giant chips)
- Shows NQ reason dropdown when NQ selected
- Fault counter as number input
- Tab order: area 1 time → area 1 found → area 1 correct → area 2 time → ... → result → faults → submit
- "Save & Next" button calls onSubmit then onNext
- "Save" button calls onSubmit only (when onNext not provided)
- Calls onBack when back/cancel clicked
- Pre-fills from existingScore
- Shows validation error when submitting without result

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scoring-ui && pnpm test -- AKCScentWorkEntryScoresheet`
Expected: FAIL

- [ ] **Step 3: Implement the component**

Create `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkEntryScoresheet.tsx`.

Key implementation notes:

- Import `useScoresheetScoring` from `../../hooks/useScoresheetScoring`
- Import `parseSmartTime` from `../../utils/parseSmartTime`
- Props: `EntryScoresheetProps` (entry, classInfo, rules, onSubmit, onBack, onNext)
- Layout: compact form, all fields visible at once, keyboard-optimized
- Header: dog name + armband + handler (compact, single line)
- Areas: all visible in a grid/table — each row: area name, time input (with onBlur smart parse), found checkbox, correct checkbox
- Result: `<select>` with Q, NQ, EX, ABS options
- NQ reason: `<select>` shown when NQ chosen
- Faults: `<input type="number">` with min=0
- Actions: "Save & Next" primary button (if onNext provided), "Save" secondary, "Cancel" tertiary
- On submit: validate → buildScoreData → call onSubmit → if onNext, call onNext
- Register with `registerScoresheet('AKC_SCENT_WORK', 'entry', AKCScentWorkEntryScoresheet)`
- Target: ~200 lines

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scoring-ui && pnpm test -- AKCScentWorkEntryScoresheet`
Expected: ALL PASS

- [ ] **Step 5: Run full package test suite**

Run: `cd packages/scoring-ui && pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkEntryScoresheet.tsx packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkEntryScoresheet.test.tsx
git commit -m "feat(scoring-ui): add AKCScentWorkEntryScoresheet (secretary view)"
```

---

### Task 7: Update package exports for new AKC Scent Work components

**Files:**

- Modify: `packages/scoring-ui/src/components/scoresheets/index.ts`
- Modify: `packages/scoring-ui/src/index.ts`

- [ ] **Step 1: Update exports**

Add new exports alongside existing ones (don't remove old scoresheets yet — they're still consumed):

```typescript
// New Live/Entry variants
export { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
export { AKCScentWorkEntryScoresheet } from './AKC/AKCScentWorkEntryScoresheet';
```

- [ ] **Step 2: Run typecheck and tests**

Run: `pnpm typecheck && cd packages/scoring-ui && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add packages/scoring-ui/src/components/scoresheets/index.ts packages/scoring-ui/src/index.ts
git commit -m "feat(scoring-ui): export AKC Scent Work Live and Entry scoresheets"
```

---

## Chunk 3: Remaining Scoresheet Components

Build the remaining 6 scoresheet types following the same Live/Entry pattern established in Chunk 2.

### Task 8: Build AKC FastCAT Live and Entry scoresheets

**Files:**

- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCFastCatLiveScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCFastCatEntryScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCFastCatLiveScoresheet.test.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCFastCatEntryScoresheet.test.tsx`

**Reference:** `apps/myk9q/src/pages/scoresheets/AKC/AKCFastCatScoresheet.tsx` (447 lines)

**Sport-specific behavior:**

- MPH calculation from distance and time
- Single area (straight run)
- No found/correct toggles — just time and result
- Entry variant: distance input + time input → auto-calculate MPH

**[EXPANDED] Required test cases:**

- MPH calculation: distance=100yd, time=6.5s → correct MPH
- MPH edge case: time=0 → no division by zero
- Entry variant: changing distance or time recalculates MPH
- No found/correct toggles rendered (unlike scent work)

- [ ] **Steps:** Follow same TDD pattern as Task 5-6 (tests → fail → implement → pass → commit)

---

### Task 9: Build AKC Nationals Live and Entry scoresheets

**Files:**

- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCNationalsLiveScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/AKC/AKCNationalsEntryScoresheet.tsx`
- Create: tests for both

**Reference:** `apps/myk9q/src/pages/scoresheets/AKC/AKCNationalsScoresheet.tsx` (673 lines)

**Sport-specific behavior:**

- Extended results: 1st, 2nd, 3rd, 4th placements in addition to Q/NQ/EX/ABS
- Points calculation based on placement
- Nationals-specific area initialization (mostly 1 area except Handler Discrimination)
- Confirmation dialog includes placement and points summary

**[EXPANDED] Required test cases:**

- Placement chips render (1st-4th) alongside Q/NQ/EX/ABS
- Points calculation: 1st=10, 2nd=7, 3rd=5, 4th=3 (verify against myK9Q logic)
- Handler Discrimination: initializes with rules-based area count, not 1
- buildScoreData includes points and placement in output

- [ ] **Steps:** Follow same TDD pattern

---

### Task 10: Build UKC Nosework Live and Entry scoresheets

**Files:**

- Create: `packages/scoring-ui/src/components/scoresheets/UKC/UKCNoseworkLiveScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/UKC/UKCNoseworkEntryScoresheet.tsx`
- Create: tests for both

**Reference:** `apps/myk9q/src/pages/scoresheets/UKC/UKCNoseworkScoresheet.tsx` (722 lines)

**Sport-specific behavior:**

- Dual timer mode (search timer + element timer) when `rules.timerMode === 'dual'`
- Uses both `useStopwatch` and `useElementTimer`
- Multi-area support (1-3 areas based on level)
- Entry variant: two time inputs per area when dual mode

**[EXPANDED] Required test cases:**

- Dual timer: both stopwatch and element timer render when `rules.timerMode === 'dual'`
- Single timer: only stopwatch renders when `rules.timerMode === 'single'`
- Multi-area: renders 1, 2, or 3 area sections based on rules.areaCount
- Entry variant: two time columns per area when dual mode, one when single

- [ ] **Steps:** Follow same TDD pattern

---

### Task 11: Build UKC Obedience Live and Entry scoresheets

**Files:**

- Create: `packages/scoring-ui/src/components/scoresheets/UKC/UKCObedienceLiveScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/UKC/UKCObedienceEntryScoresheet.tsx`
- Create: tests for both

**Reference:** `apps/myk9q/src/pages/scoresheets/UKC/UKCObedienceScoresheet.tsx` (417 lines)

- [ ] **Steps:** Follow same TDD pattern

---

### Task 12: Build UKC Rally Live and Entry scoresheets

**Files:**

- Create: `packages/scoring-ui/src/components/scoresheets/UKC/UKCRallyLiveScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/UKC/UKCRallyEntryScoresheet.tsx`
- Create: tests for both

**Reference:** `apps/myk9q/src/pages/scoresheets/UKC/UKCRallyScoresheet.tsx` (462 lines)

- [ ] **Steps:** Follow same TDD pattern

---

### Task 13: Build ASCA Scent Detection Live and Entry scoresheets

**Files:**

- Create: `packages/scoring-ui/src/components/scoresheets/ASCA/ASCAScentDetectionLiveScoresheet.tsx`
- Create: `packages/scoring-ui/src/components/scoresheets/ASCA/ASCAScentDetectionEntryScoresheet.tsx`
- Create: tests for both

**Reference:** `apps/myk9q/src/pages/scoresheets/ASCA/ASCAScentDetectionScoresheet.tsx` (470 lines)

- [ ] **Steps:** Follow same TDD pattern

---

### Task 14: Export all new scoresheets and update factory tests

**Files:**

- Modify: `packages/scoring-ui/src/components/scoresheets/index.ts`
- Modify: `packages/scoring-ui/src/index.ts`
- Modify: `packages/scoring-ui/src/utils/getScoresheetComponent.test.ts`

- [ ] **Step 1: Add all exports**

- [ ] **Step 2: Update factory tests to verify all 7 sport types return components for both modes**

- [ ] **Step 3: Run full test suite**

Run: `cd packages/scoring-ui && pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(scoring-ui): export all 14 scoresheet components and update factory"
```

---

## Chunk 4: myK9Show Secretary Flow

Wire the new EntryScoresheet components into myK9Show's secretary workflow.

### Task 15: Create secretary scoring page in myK9Show

**Files:**

- Create: `apps/myk9show/src/pages/scoring/SecretaryScoringPage.tsx`
- Create: `apps/myk9show/src/pages/scoring/SecretaryScoringPage.test.tsx`

**Reference files:**

- `apps/myk9show/src/pages/scoring/ScoresheetPage.tsx` — existing page (read for context)
- `apps/myk9show/src/services/database/queries/entryQueries.ts` — entry data fetching
- `apps/myk9show/src/services/mappers/entryMappers.ts` — entry data mapping

- [ ] **Step 1: Write component tests**

Test cases:

- Renders loading state while fetching entry
- Renders the correct EntryScoresheet for the sport type
- Passes entry, classInfo, rules as props
- On submit: calls mutation to save score
- On next: navigates to next unscored entry
- On back: navigates to class details
- Shows error state when entry not found

- [ ] **Step 2: Implement the page**

Key implementation:

- Route: `/scoring/:classId/entry/:entryId`
- React Query: fetch entry by ID, class by ID, trial by class's trialId
- Build `ResolvedClassRules` from class data via `buildResolvedClassRules`
- Map DB entry → `ScoresheetEntry` type
- Use `getScoresheetComponent(sportType, 'entry')` to get the right component
- `onSubmit`: mutation that writes score to Supabase `entries` table (update score_data JSONB column)
- `onNext`: query for next unscored entry in class, navigate to it (or back to class if all scored)
- `onBack`: `navigate(-1)` or navigate to class details

Target: ~150 lines

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm test -- SecretaryScoringPage`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(myk9show): add SecretaryScoringPage for manual score entry"
```

---

### Task 16: Add route and navigation for secretary scoring

**Files:**

- Modify: `apps/myk9show/src/App.tsx` (or routes file) — add route
- Modify: `apps/myk9show/src/features/pipeline/components/ClassPipelineCard.tsx` — add "Enter Scores" action
- Modify: `apps/myk9show/src/pages/ClassDetailsPage.tsx` — add "Enter Scores" button for secretary

- [ ] **Step 1: Add route**

Add to the app router:

```tsx
<Route path="/scoring/:classId/entry/:entryId" element={<SecretaryScoringPage />} />
```

- [ ] **Step 2: Add navigation entry point from class details**

Add an "Enter Scores" button on the class details page (visible to secretaries) that navigates to the first unscored entry in the class.

- [ ] **Step 3: Add navigation from pipeline dashboard**

Add "Enter Scores" option to the ClassPipelineCard's action menu.

- [ ] **Step 4: Run typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(myk9show): wire secretary scoring routes and navigation"
```

---

## Chunk 5: myK9Q Migration

Migrate myK9Q to use the shared LiveScoresheet components. Add Tailwind to myK9Q.

### Task 17: Add Tailwind CSS to myK9Q

**Files:**

- Modify: `apps/myk9q/package.json` — add tailwindcss, postcss, autoprefixer
- Create: `apps/myk9q/tailwind.config.ts`
- Create: `apps/myk9q/postcss.config.js`
- Modify: `apps/myk9q/src/index.css` — add Tailwind directives

- [ ] **Step 1: Install Tailwind**

```bash
cd apps/myk9q && pnpm add -D tailwindcss @tailwindcss/postcss postcss autoprefixer
```

- [ ] **Step 2: Create config files**

Minimal config that scans only scoresheet components from the shared package:

```typescript
// tailwind.config.ts
export default {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/scoring-ui/src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  // Use same theme as myk9show for consistency
};
```

- [ ] **Step 3: Add Tailwind directives to CSS**

Add to top of `apps/myk9q/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Verify build works**

Run: `cd apps/myk9q && pnpm build`
Expected: PASS (existing semantic CSS should coexist with Tailwind)

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(myk9q): add Tailwind CSS for shared scoresheet components"
```

---

### [ADDED] Task 17b: Reconcile useStopwatch 30-second warning threshold

**Problem:** myK9Q's local `useStopwatch` triggers the 30-second warning at 32 seconds remaining (2-second buffer for display latency on mobile). The shared `useStopwatch` triggers at exactly 30 seconds. The shared version's behavior is correct per competition rules — keep 30 seconds. The 2-second buffer was a workaround for slow rendering that is no longer needed with the 100ms interval.

**Files:**

- Read: `apps/myk9q/src/pages/scoresheets/hooks/useStopwatch.ts` (line ~246: `remainingSeconds <= 32`)
- Read: `packages/scoring-ui/src/hooks/useStopwatch.ts` (line ~246: `remainingSeconds <= 30`)

- [ ] **Step 1: Verify shared version behavior is correct** — 30-second threshold is the competition standard
- [ ] **Step 2: Add a test to shared useStopwatch confirming the 30-second threshold**
- [ ] **Step 3: Document decision** — Add comment in shared useStopwatch: "30-second threshold per competition rules. No buffer needed with 100ms update interval."
- [ ] **Step 4: Commit**

---

### Task 18: Migrate myK9Q AKC Scent Work to shared component

**[ADDED] Rollout safety:** Migrate one scoresheet at a time (AKC Scent Work first). Deploy to staging (`app.myk9q.com`) and manually verify scoring flow works before migrating the remaining 6. If a visual regression is found, the git history preserves the old component for quick revert. Do NOT batch all 7 migrations into one commit.

**Files:**

- Modify: `apps/myk9q/src/pages/scoresheets/AKC/AKCScentWorkScoresheet.tsx` — replace with thin wrapper
- Keep: `apps/myk9q/src/pages/scoresheets/hooks/useEntryNavigation.ts` (app-specific)

- [ ] **Step 1: Rewrite as thin wrapper**

Replace the 476-line component with a ~50-line wrapper:

```tsx
import { AKCScentWorkLiveScoresheet } from '@myk9/scoring-ui';
import { useEntryNavigation } from '../hooks/useEntryNavigation';
import { useOptimisticScoring } from '../../../hooks/useOptimisticScoring';
import { useClassCompletion } from '../../../hooks/useClassCompletion';
import { markInRing } from '../../../services/entryService';
import type { ScoreData } from '@myk9/scoring-ui';

export default function AKCScentWorkScoresheetPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const navigation = useEntryNavigation({ classId, entryId, sportType: 'AKC_SCENT_WORK' });
  const { submitScoreOptimistically } = useOptimisticScoring();
  const { CelebrationModal, checkCompletion } = useClassCompletion(classId);

  if (navigation.isLoading || !navigation.currentEntry) {
    return <LoadingSpinner />;
  }

  const entry: ScoresheetEntry = {
    id: navigation.currentEntry.id,
    armband: navigation.currentEntry.armband,
    dogName: navigation.currentEntry.callName ?? '',
    handlerName: navigation.currentEntry.handler ?? '',
    className: navigation.currentEntry.className,
    element: navigation.currentEntry.element,
    level: navigation.currentEntry.level,
  };

  const handleSubmit = async (scoreData: ScoreData) => {
    await submitScoreOptimistically({
      entryId: entry.id,
      classId: parseInt(classId!),
      armband: entry.armband,
      className: entry.className,
      scoreData,
      onSuccess: async () => {
        await checkCompletion();
        if (navigation.currentEntry?.id) {
          await markInRing(navigation.currentEntry.id, false).catch(() => {});
        }
        navigate(-1);
      },
      onError: error => alert(`Failed: ${error.message}`),
    });
  };

  return (
    <>
      <AKCScentWorkLiveScoresheet
        entry={entry}
        classInfo={navigation.classInfo!}
        rules={navigation.rules!}
        onSubmit={handleSubmit}
        onBack={() => navigate(-1)}
      />
      {CelebrationModal}
    </>
  );
}
```

- [ ] **Step 2: Run myK9Q tests**

Run: `cd apps/myk9q && pnpm test`
Expected: PASS (or note which tests need updating due to the component swap)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(myk9q): migrate AKC Scent Work to shared LiveScoresheet"
```

---

### Task 19: Migrate remaining 6 myK9Q scoresheets

Follow the same pattern as Task 18 for each:

- [ ] `AKCFastCatScoresheet.tsx` → thin wrapper using `AKCFastCatLiveScoresheet`
- [ ] `AKCNationalsScoresheet.tsx` → thin wrapper using `AKCNationalsLiveScoresheet`
- [ ] `UKCNoseworkScoresheet.tsx` → thin wrapper using `UKCNoseworkLiveScoresheet`
- [ ] `UKCObedienceScoresheet.tsx` → thin wrapper using `UKCObedienceLiveScoresheet`
- [ ] `UKCRallyScoresheet.tsx` → thin wrapper using `UKCRallyLiveScoresheet`
- [ ] `ASCAScentDetectionScoresheet.tsx` → thin wrapper using `ASCAScentDetectionLiveScoresheet`

Each wrapper follows the same ~50-line pattern: useEntryNavigation → map to ScoresheetEntry → render shared component → handle submit with optimistic scoring.

- [ ] **Run full myK9Q test suite after all migrations**

Run: `cd apps/myk9q && pnpm test`
Expected: ALL PASS

- [ ] **Commit**

```bash
git commit -m "refactor(myk9q): migrate all 7 scoresheets to shared components"
```

---

### Task 20: Delete myK9Q duplicate hooks

**Files:**

- Delete: `apps/myk9q/src/pages/scoresheets/hooks/useScoresheetCore.ts`
- Delete: `apps/myk9q/src/pages/scoresheets/hooks/useStopwatch.ts`
- Delete: `apps/myk9q/src/pages/scoresheets/hooks/useStopwatch.test.ts`
- Delete: `apps/myk9q/src/pages/scoresheets/hooks/useElementTimer.ts`
- Modify: `apps/myk9q/src/pages/scoresheets/hooks/index.ts` — remove deleted exports

Keep: `useEntryNavigation.ts`, `useEntryNavigationHelpers.ts` (app-specific)

- [ ] **Step 1: Verify no other imports reference the deleted hooks**

Search for imports of the deleted hooks outside the scoresheet wrappers:

```bash
grep -r "useScoresheetCore\|from.*hooks/useStopwatch\|from.*hooks/useElementTimer" apps/myk9q/src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Delete files and update index**

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/myk9q && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(myk9q): delete duplicate scoring hooks (now in @myk9/scoring-ui)"
```

---

## Chunk 6: Cleanup and Final Verification

### Task 21: Delete myK9Show's unused scoresheet copies

**Files:**

- Delete: `apps/myk9show/src/pages/scoring/scoresheets/AKC/AKCScentWorkScoresheet.tsx`
- Delete: `apps/myk9show/src/pages/scoring/scoresheets/AKC/AKCFastCatScoresheet.tsx`
- Delete: `apps/myk9show/src/pages/scoring/scoresheets/AKC/AKCNationalsScoresheet.tsx`
- Delete: `apps/myk9show/src/pages/scoring/scoresheets/AKC/components/` (entire directory)
- Delete: `apps/myk9show/src/pages/scoring/scoresheets/UKC/UKCNoseworkScoresheet.tsx`
- Delete: `apps/myk9show/src/pages/scoring/scoresheets/UKC/UKCObedienceScoresheet.tsx`
- Delete: `apps/myk9show/src/pages/scoring/scoresheets/UKC/UKCRallyScoresheet.tsx`
- Delete: `apps/myk9show/src/pages/scoring/scoresheets/ASCA/ASCAScentDetectionScoresheet.tsx`
- Delete: Any associated CSS files (`BaseScoresheet.css`, `scoresheet-shared.css`, etc.)

- [ ] **Step 1: Verify no imports reference these files**

```bash
grep -r "from.*pages/scoring/scoresheets" apps/myk9show/src/ --include="*.ts" --include="*.tsx"
```

Update `apps/myk9show/src/pages/scoring/ScoresheetPage.tsx` if it imports from the deleted files — it should now use `getScoresheetComponent` from `@myk9/scoring-ui`.

- [ ] **Step 2: Delete files**

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(myk9show): delete unused scoresheet copies (now in @myk9/scoring-ui)"
```

---

### Task 22: Delete old scoresheet components from shared package

The original props-driven scoresheets in `packages/scoring-ui/src/components/scoresheets/` are now replaced by the Live/Entry variants.

**Files:**

- Delete: `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkScoresheet.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/AKC/AKCScentWorkScoresheet.test.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/AKC/AKCNationalsScoresheet.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/AKC/AKCFastCatScoresheet.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/UKC/UKCNoseworkScoresheet.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/UKC/UKCNoseworkScoresheet.test.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/UKC/UKCObedienceScoresheet.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/UKC/UKCRallyScoresheet.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/ASCA/ASCAScentDetectionScoresheet.tsx`
- Delete: `packages/scoring-ui/src/components/scoresheets/ASCA/ASCAScentDetectionScoresheet.test.tsx`
- Modify: `packages/scoring-ui/src/index.ts` — remove old exports

- [ ] **Step 1: Check for consumers of old exports**

```bash
grep -r "AKCScentWorkScoresheet\|AKCNationalsScoresheet\|AKCFastCatScoresheet\|UKCNoseworkScoresheet\|UKCObedienceScoresheet\|UKCRallyScoresheet\|ASCAScentDetectionScoresheet" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v "Live\|Entry\|test\|\.test\."
```

Any remaining imports should be updated to the new Live/Entry variants.

- [ ] **Step 2: Delete files and update exports**

- [ ] **Step 3: Run full monorepo quality gates**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(scoring-ui): remove old single-mode scoresheets (replaced by Live/Entry variants)"
```

---

### Task 23: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Mark the scoresheet convergence todo as complete**

Update the item under "Scoresheet Codebase Convergence - 2026-02-26" to `[x]` with a summary of what was done.

- [ ] **Step 2: Update the phase1-cleanup plan**

Mark item 6 in `docs/plans/2026-02-26-phase1-cleanup.md` as DONE.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: mark scoresheet convergence as complete"
```

---

## Summary

| Chunk | Tasks | What it delivers                                                                |
| ----- | ----- | ------------------------------------------------------------------------------- |
| 1     | 1-4   | Shared scoring engine: types, `useScoresheetScoring`, `parseSmartTime`, factory |
| 2     | 5-7   | AKC Scent Work reference implementation (Live + Entry)                          |
| 3     | 8-14  | Remaining 6 scoresheet types (12 components total)                              |
| 4     | 15-16 | myK9Show secretary scoring flow (new capability)                                |
| 5     | 17-20 | myK9Q migration to shared components + Tailwind                                 |
| 6     | 21-23 | Cleanup: delete ~25K lines of duplicated code                                   |

**Total new files:** ~30 (14 components + 14 tests + types + utils)
**Total deleted files:** ~25 (7 myK9Q scoresheets + 7 myK9Show copies + 7 old shared + hooks + CSS)
**Net line change:** Approximately -10,000 lines (25K deleted, 15K new shared code)
