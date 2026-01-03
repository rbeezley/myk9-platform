# Podium Results Display - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a mobile-first `/results` page with podium-style class placements and integrate results into TVRunOrder page rotation.

**Architecture:** Shared podium components (`PodiumCard`, `PodiumPosition`) used by both a standalone Results page and enhanced TVRunOrder. Data fetched via hooks respecting existing visibility settings cascade.

**Tech Stack:** React, TypeScript, CSS (semantic with design tokens), Zustand for state, existing Supabase queries and visibility service.

---

## Task 1: Create PodiumPosition Component

**Files:**
- Create: `src/components/podium/PodiumPosition.tsx`
- Create: `src/components/podium/PodiumPosition.test.tsx`
- Create: `src/components/podium/podium.css`

**Step 1: Write the failing test**

```typescript
// src/components/podium/PodiumPosition.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PodiumPosition } from './PodiumPosition';

describe('PodiumPosition', () => {
  const defaultProps = {
    placement: 1 as const,
    handlerName: 'Sarah Mitchell',
    dogName: 'Biscuit',
    breed: 'Golden Retriever',
  };

  it('renders handler name', () => {
    render(<PodiumPosition {...defaultProps} />);
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
  });

  it('renders dog name with quotes', () => {
    render(<PodiumPosition {...defaultProps} />);
    expect(screen.getByText(/"Biscuit"/)).toBeInTheDocument();
  });

  it('renders breed', () => {
    render(<PodiumPosition {...defaultProps} />);
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });

  it('renders placement badge with correct label', () => {
    render(<PodiumPosition {...defaultProps} placement={1} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
  });

  it('renders 2nd place correctly', () => {
    render(<PodiumPosition {...defaultProps} placement={2} />);
    expect(screen.getByText('2nd')).toBeInTheDocument();
  });

  it('renders 3rd place correctly', () => {
    render(<PodiumPosition {...defaultProps} placement={3} />);
    expect(screen.getByText('3rd')).toBeInTheDocument();
  });

  it('renders 4th place correctly', () => {
    render(<PodiumPosition {...defaultProps} placement={4} />);
    expect(screen.getByText('4th')).toBeInTheDocument();
  });

  it('applies correct placement class', () => {
    const { container } = render(<PodiumPosition {...defaultProps} placement={1} />);
    expect(container.querySelector('.podium-position--first')).toBeInTheDocument();
  });

  it('renders armband when provided', () => {
    render(<PodiumPosition {...defaultProps} armband={42} />);
    expect(screen.getByText('#42')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/podium/PodiumPosition.test.tsx`
Expected: FAIL with "Cannot find module './PodiumPosition'"

**Step 3: Create CSS file with design tokens**

```css
/* src/components/podium/podium.css */

/* Podium color tokens */
:root {
  --podium-first-bg: #1e4b94;
  --podium-first-text: #ffffff;
  --podium-first-gradient: linear-gradient(135deg, #1e4b94 0%, #2d5aa8 100%);
  --podium-first-glow: 0 0 20px rgba(212, 175, 55, 0.4);

  --podium-second-bg: #c41e3a;
  --podium-second-text: #ffffff;
  --podium-second-gradient: linear-gradient(135deg, #c41e3a 0%, #d63050 100%);

  --podium-third-bg: #f4c430;
  --podium-third-text: #1a1a1a;
  --podium-third-gradient: linear-gradient(135deg, #f4c430 0%, #f7d048 100%);

  --podium-fourth-bg: #f0f0f0;
  --podium-fourth-text: #1a1a1a;
  --podium-fourth-gradient: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  --podium-fourth-border: 2px solid #ccc;
}

/* PodiumPosition styles */
.podium-position {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.podium-position__card {
  background: var(--color-surface);
  border-radius: var(--token-space-3);
  padding: var(--token-space-4);
  box-shadow: var(--shadow-md);
  position: relative;
  min-width: 140px;
}

.podium-position__badge {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
}

.podium-position--first .podium-position__badge {
  background: var(--podium-first-gradient);
  color: var(--podium-first-text);
  box-shadow: var(--podium-first-glow), 0 3px 8px rgba(0, 0, 0, 0.25);
}

.podium-position--second .podium-position__badge {
  background: var(--podium-second-gradient);
  color: var(--podium-second-text);
}

.podium-position--third .podium-position__badge {
  background: var(--podium-third-gradient);
  color: var(--podium-third-text);
}

.podium-position--fourth .podium-position__badge {
  background: var(--podium-fourth-gradient);
  color: var(--podium-fourth-text);
  border: var(--podium-fourth-border);
}

.podium-position__handler {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-top: var(--token-space-4);
  margin-bottom: var(--token-space-1);
}

.podium-position__dog {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: var(--token-space-1);
}

.podium-position__breed {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-style: italic;
}

.podium-position__armband {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: var(--token-space-1);
}

.podium-position__platform {
  border-radius: 6px 6px 0 0;
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: var(--token-space-2);
  font-weight: 700;
  font-size: 22px;
  margin-top: var(--token-space-2);
}

.podium-position--first .podium-position__platform {
  background: var(--podium-first-gradient);
  color: var(--podium-first-text);
  height: 90px;
}

.podium-position--second .podium-position__platform {
  background: var(--podium-second-gradient);
  color: var(--podium-second-text);
  height: 68px;
}

.podium-position--third .podium-position__platform {
  background: var(--podium-third-gradient);
  color: var(--podium-third-text);
  height: 50px;
}

.podium-position--fourth .podium-position__platform {
  background: var(--podium-fourth-gradient);
  color: var(--podium-fourth-text);
  border: var(--podium-fourth-border);
  height: 32px;
}
```

**Step 4: Write minimal implementation**

```typescript
// src/components/podium/PodiumPosition.tsx
import './podium.css';

export interface PodiumPositionProps {
  placement: 1 | 2 | 3 | 4;
  handlerName: string;
  dogName: string;
  breed: string;
  armband?: number;
  animate?: boolean;
}

const PLACEMENT_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
};

const PLACEMENT_CLASSES: Record<1 | 2 | 3 | 4, string> = {
  1: 'podium-position--first',
  2: 'podium-position--second',
  3: 'podium-position--third',
  4: 'podium-position--fourth',
};

export function PodiumPosition({
  placement,
  handlerName,
  dogName,
  breed,
  armband,
}: PodiumPositionProps) {
  const placementClass = PLACEMENT_CLASSES[placement];
  const placementLabel = PLACEMENT_LABELS[placement];

  return (
    <div className={`podium-position ${placementClass}`}>
      <div className="podium-position__card">
        <div className="podium-position__badge">{placementLabel}</div>
        <div className="podium-position__handler">{handlerName}</div>
        <div className="podium-position__dog">"{dogName}"</div>
        <div className="podium-position__breed">{breed}</div>
        {armband && <div className="podium-position__armband">#{armband}</div>}
      </div>
      <div className="podium-position__platform">{placement}</div>
    </div>
  );
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- src/components/podium/PodiumPosition.test.tsx`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/components/podium/
git commit -m "feat(podium): add PodiumPosition component with AKC ribbon colors"
```

---

## Task 2: Create PodiumCard Component

**Files:**
- Create: `src/components/podium/PodiumCard.tsx`
- Create: `src/components/podium/PodiumCard.test.tsx`
- Modify: `src/components/podium/podium.css`

**Step 1: Write the failing test**

```typescript
// src/components/podium/PodiumCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PodiumCard } from './PodiumCard';

describe('PodiumCard', () => {
  const defaultProps = {
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    placements: [
      { placement: 1 as const, handlerName: 'Sarah', dogName: 'Biscuit', breed: 'Golden' },
      { placement: 2 as const, handlerName: 'Tom', dogName: 'Pepper', breed: 'Border Collie' },
      { placement: 3 as const, handlerName: 'Linda', dogName: 'Mochi', breed: 'Shiba' },
      { placement: 4 as const, handlerName: 'David', dogName: 'Bruno', breed: 'GSD' },
    ],
  };

  it('renders class name in header', () => {
    render(<PodiumCard {...defaultProps} />);
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
  });

  it('renders element icon', () => {
    render(<PodiumCard {...defaultProps} />);
    // Container element should show box icon
    expect(screen.getByText('📦')).toBeInTheDocument();
  });

  it('renders all four placements', () => {
    render(<PodiumCard {...defaultProps} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('3rd')).toBeInTheDocument();
    expect(screen.getByText('4th')).toBeInTheDocument();
  });

  it('renders all handler names', () => {
    render(<PodiumCard {...defaultProps} />);
    expect(screen.getByText('Sarah')).toBeInTheDocument();
    expect(screen.getByText('Tom')).toBeInTheDocument();
    expect(screen.getByText('Linda')).toBeInTheDocument();
    expect(screen.getByText('David')).toBeInTheDocument();
  });

  it('handles missing placements gracefully', () => {
    const props = {
      ...defaultProps,
      placements: [
        { placement: 1 as const, handlerName: 'Sarah', dogName: 'Biscuit', breed: 'Golden' },
      ],
    };
    render(<PodiumCard {...props} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.queryByText('2nd')).not.toBeInTheDocument();
  });

  it('renders Interior element icon', () => {
    render(<PodiumCard {...defaultProps} element="Interior" />);
    expect(screen.getByText('🏠')).toBeInTheDocument();
  });

  it('renders Exterior element icon', () => {
    render(<PodiumCard {...defaultProps} element="Exterior" />);
    expect(screen.getByText('🌲')).toBeInTheDocument();
  });

  it('renders Buried element icon', () => {
    render(<PodiumCard {...defaultProps} element="Buried" />);
    expect(screen.getByText('🦴')).toBeInTheDocument();
  });

  it('renders Handler Discrimination element icon', () => {
    render(<PodiumCard {...defaultProps} element="Handler Discrimination" />);
    expect(screen.getByText('🎯')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/podium/PodiumCard.test.tsx`
Expected: FAIL with "Cannot find module './PodiumCard'"

**Step 3: Add PodiumCard styles to CSS**

Add to `src/components/podium/podium.css`:

```css
/* PodiumCard styles */
.podium-card {
  background: var(--color-surface);
  border-radius: var(--token-space-3);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.podium-card__header {
  display: flex;
  align-items: center;
  gap: var(--token-space-3);
  padding: var(--token-space-4);
  background: var(--color-surface-elevated);
  border-bottom: 1px solid var(--color-border);
}

.podium-card__icon {
  font-size: 28px;
}

.podium-card__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.podium-card__podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: var(--token-space-3);
  padding: var(--token-space-4);
  padding-top: var(--token-space-6);
}

/* Horizontal layout - podium order: 2nd, 1st, 3rd, 4th */
.podium-card__podium .podium-position:nth-child(1) { order: 2; } /* 1st in center */
.podium-card__podium .podium-position:nth-child(2) { order: 1; } /* 2nd on left */
.podium-card__podium .podium-position:nth-child(3) { order: 3; } /* 3rd on right */
.podium-card__podium .podium-position:nth-child(4) { order: 4; } /* 4th far right */

/* Mobile: vertical stack */
@media (max-width: 639px) {
  .podium-card__podium {
    flex-direction: column;
    align-items: stretch;
  }

  .podium-card__podium .podium-position {
    order: unset !important;
  }

  .podium-position__platform {
    display: none;
  }

  .podium-position__card {
    width: 100%;
  }
}
```

**Step 4: Write minimal implementation**

```typescript
// src/components/podium/PodiumCard.tsx
import { PodiumPosition, PodiumPositionProps } from './PodiumPosition';
import './podium.css';

export interface PodiumCardProps {
  className: string;
  element: string;
  level: string;
  section?: string;
  placements: Omit<PodiumPositionProps, 'animate'>[];
  variant?: 'compact' | 'full';
}

const ELEMENT_ICONS: Record<string, string> = {
  'Container': '📦',
  'Interior': '🏠',
  'Exterior': '🌲',
  'Buried': '🦴',
  'Handler Discrimination': '🎯',
};

export function PodiumCard({
  className,
  element,
  placements,
}: PodiumCardProps) {
  const icon = ELEMENT_ICONS[element] || '🏆';

  // Sort placements by position
  const sortedPlacements = [...placements].sort((a, b) => a.placement - b.placement);

  return (
    <div className="podium-card">
      <div className="podium-card__header">
        <span className="podium-card__icon">{icon}</span>
        <span className="podium-card__title">{className}</span>
      </div>
      <div className="podium-card__podium">
        {sortedPlacements.map((placement) => (
          <PodiumPosition key={placement.placement} {...placement} />
        ))}
      </div>
    </div>
  );
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- src/components/podium/PodiumCard.test.tsx`
Expected: All tests PASS

**Step 6: Create index export**

```typescript
// src/components/podium/index.ts
export { PodiumPosition } from './PodiumPosition';
export type { PodiumPositionProps } from './PodiumPosition';
export { PodiumCard } from './PodiumCard';
export type { PodiumCardProps } from './PodiumCard';
```

**Step 7: Commit**

```bash
git add src/components/podium/
git commit -m "feat(podium): add PodiumCard component with responsive layout"
```

---

## Task 3: Create useResultsData Hook

**Files:**
- Create: `src/pages/Results/hooks/useResultsData.ts`
- Create: `src/pages/Results/hooks/useResultsData.test.ts`

**Step 1: Write the failing test**

```typescript
// src/pages/Results/hooks/useResultsData.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useResultsData } from './useResultsData';

// Mock dependencies
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

vi.mock('../../../services/resultVisibilityService', () => ({
  getVisibleResultFields: vi.fn(() => Promise.resolve({
    showPlacement: true,
    showQualification: true,
    showTime: true,
    showFaults: true,
  })),
}));

describe('useResultsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useResultsData({
      trialId: 1,
      licenseKey: 'test-key',
    }));

    expect(result.current.isLoading).toBe(true);
  });

  it('returns empty array when no completed classes', async () => {
    const { result } = renderHook(() => useResultsData({
      trialId: 1,
      licenseKey: 'test-key',
    }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.completedClasses).toEqual([]);
  });

  it('provides filter state and setters', () => {
    const { result } = renderHook(() => useResultsData({
      trialId: 1,
      licenseKey: 'test-key',
    }));

    expect(result.current.filters).toEqual({
      element: null,
      level: null,
    });
    expect(typeof result.current.setFilters).toBe('function');
  });

  it('filters results by element', async () => {
    const { result } = renderHook(() => useResultsData({
      trialId: 1,
      licenseKey: 'test-key',
    }));

    result.current.setFilters({ element: 'Container', level: null });

    expect(result.current.filters.element).toBe('Container');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/Results/hooks/useResultsData.test.ts`
Expected: FAIL with "Cannot find module './useResultsData'"

**Step 3: Write minimal implementation**

```typescript
// src/pages/Results/hooks/useResultsData.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { getVisibleResultFields } from '../../../services/resultVisibilityService';
import type { UserRole } from '../../../utils/auth';

export interface ResultsFilters {
  element: string | null;
  level: string | null;
}

export interface CompletedClassResult {
  classId: number;
  className: string;
  element: string;
  level: string;
  section?: string;
  placements: {
    placement: 1 | 2 | 3 | 4;
    handlerName: string;
    dogName: string;
    breed: string;
    armband: number;
  }[];
}

export interface UseResultsDataParams {
  trialId: number;
  licenseKey: string;
  userRole?: UserRole;
}

export interface UseResultsDataReturn {
  completedClasses: CompletedClassResult[];
  isLoading: boolean;
  error: Error | null;
  filters: ResultsFilters;
  setFilters: (filters: ResultsFilters) => void;
  refetch: () => void;
}

export function useResultsData({
  trialId,
  licenseKey,
  userRole = 'exhibitor',
}: UseResultsDataParams): UseResultsDataReturn {
  const [completedClasses, setCompletedClasses] = useState<CompletedClassResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<ResultsFilters>({
    element: null,
    level: null,
  });

  const fetchResults = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch completed classes for this trial
      const { data: classes, error: classError } = await supabase
        .from('classes')
        .select(`
          id,
          element,
          level,
          section,
          status,
          results_released_at
        `)
        .eq('trial_id', trialId)
        .eq('status', 'completed')
        .order('element')
        .order('level');

      if (classError) throw classError;
      if (!classes || classes.length === 0) {
        setCompletedClasses([]);
        setIsLoading(false);
        return;
      }

      // Check visibility and fetch placements for each class
      const visibleClasses: CompletedClassResult[] = [];

      for (const cls of classes) {
        const visibility = await getVisibleResultFields({
          classId: cls.id,
          trialId,
          licenseKey,
          userRole,
          isClassComplete: true,
          resultsReleasedAt: cls.results_released_at,
        });

        if (!visibility.showPlacement) continue;

        // Fetch top 4 placements for this class
        const { data: entries, error: entryError } = await supabase
          .from('entries')
          .select(`
            id,
            armband,
            call_name,
            breed,
            handler_name,
            final_placement
          `)
          .eq('class_id', cls.id)
          .gte('final_placement', 1)
          .lte('final_placement', 4)
          .order('final_placement');

        if (entryError) throw entryError;

        const className = cls.section
          ? `${cls.element} ${cls.level} ${cls.section}`
          : `${cls.element} ${cls.level}`;

        visibleClasses.push({
          classId: cls.id,
          className,
          element: cls.element,
          level: cls.level,
          section: cls.section,
          placements: (entries || []).map((e) => ({
            placement: e.final_placement as 1 | 2 | 3 | 4,
            handlerName: e.handler_name,
            dogName: e.call_name,
            breed: e.breed,
            armband: e.armband,
          })),
        });
      }

      setCompletedClasses(visibleClasses);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch results'));
    } finally {
      setIsLoading(false);
    }
  }, [trialId, licenseKey, userRole]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Apply filters
  const filteredClasses = completedClasses.filter((cls) => {
    if (filters.element && cls.element !== filters.element) return false;
    if (filters.level && cls.level !== filters.level) return false;
    return true;
  });

  return {
    completedClasses: filteredClasses,
    isLoading,
    error,
    filters,
    setFilters,
    refetch: fetchResults,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/pages/Results/hooks/useResultsData.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/pages/Results/
git commit -m "feat(results): add useResultsData hook with visibility integration"
```

---

## Task 4: Create Results Page

**Files:**
- Create: `src/pages/Results/Results.tsx`
- Create: `src/pages/Results/Results.css`
- Create: `src/pages/Results/components/ResultsFilters.tsx`
- Modify: `src/App.tsx` (add route)

**Step 1: Create ResultsFilters component**

```typescript
// src/pages/Results/components/ResultsFilters.tsx
import type { ResultsFilters as Filters } from '../hooks/useResultsData';
import './ResultsFilters.css';

const ELEMENTS = ['Container', 'Interior', 'Exterior', 'Buried', 'Handler Discrimination'];
const LEVELS = ['Novice A', 'Novice B', 'Advanced', 'Excellent', 'Masters'];

interface ResultsFiltersProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  resultCount: number;
}

export function ResultsFilters({ filters, onFilterChange, resultCount }: ResultsFiltersProps) {
  return (
    <div className="results-filters">
      <div className="results-filters__group">
        <label htmlFor="element-filter">Element</label>
        <select
          id="element-filter"
          value={filters.element || ''}
          onChange={(e) => onFilterChange({ ...filters, element: e.target.value || null })}
        >
          <option value="">All Elements</option>
          {ELEMENTS.map((el) => (
            <option key={el} value={el}>{el}</option>
          ))}
        </select>
      </div>

      <div className="results-filters__group">
        <label htmlFor="level-filter">Level</label>
        <select
          id="level-filter"
          value={filters.level || ''}
          onChange={(e) => onFilterChange({ ...filters, level: e.target.value || null })}
        >
          <option value="">All Levels</option>
          {LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>{lvl}</option>
          ))}
        </select>
      </div>

      <div className="results-filters__count">
        Showing {resultCount} class{resultCount !== 1 ? 'es' : ''}
      </div>
    </div>
  );
}
```

**Step 2: Create ResultsFilters CSS**

```css
/* src/pages/Results/components/ResultsFilters.css */
.results-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--token-space-4);
  padding: var(--token-space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.results-filters__group {
  display: flex;
  flex-direction: column;
  gap: var(--token-space-1);
}

.results-filters__group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
}

.results-filters__group select {
  padding: var(--token-space-2) var(--token-space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--token-space-2);
  background: var(--color-surface);
  font-size: 14px;
  min-width: 150px;
}

.results-filters__count {
  margin-left: auto;
  display: flex;
  align-items: flex-end;
  font-size: 14px;
  color: var(--color-text-secondary);
}

@media (max-width: 639px) {
  .results-filters {
    flex-direction: column;
  }

  .results-filters__group select {
    width: 100%;
  }

  .results-filters__count {
    margin-left: 0;
  }
}
```

**Step 3: Create Results page**

```typescript
// src/pages/Results/Results.tsx
import { useSearchParams } from 'react-router-dom';
import { useTrialContext } from '../../contexts/TrialContext';
import { useResultsData } from './hooks/useResultsData';
import { ResultsFilters } from './components/ResultsFilters';
import { PodiumCard } from '../../components/podium';
import './Results.css';

export function Results() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTrial, licenseKey } = useTrialContext();

  const initialFilters = {
    element: searchParams.get('element'),
    level: searchParams.get('level'),
  };

  const {
    completedClasses,
    isLoading,
    error,
    filters,
    setFilters,
    refetch,
  } = useResultsData({
    trialId: currentTrial?.id || 0,
    licenseKey: licenseKey || '',
  });

  // Sync filters with URL
  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    const params = new URLSearchParams();
    if (newFilters.element) params.set('element', newFilters.element);
    if (newFilters.level) params.set('level', newFilters.level);
    setSearchParams(params);
  };

  if (!currentTrial) {
    return (
      <div className="results-page results-page--empty">
        <p>Please select a trial to view results.</p>
      </div>
    );
  }

  return (
    <div className="results-page">
      <header className="results-page__header">
        <h1>Class Results</h1>
      </header>

      <ResultsFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        resultCount={completedClasses.length}
      />

      <main className="results-page__content">
        {isLoading && (
          <div className="results-page__loading">Loading results...</div>
        )}

        {error && (
          <div className="results-page__error">
            Error loading results. <button onClick={refetch}>Retry</button>
          </div>
        )}

        {!isLoading && !error && completedClasses.length === 0 && (
          <div className="results-page__empty">
            <span className="results-page__empty-icon">🏁</span>
            <h2>No results available yet</h2>
            <p>Results will appear here as classes complete scoring.</p>
          </div>
        )}

        {!isLoading && !error && completedClasses.length > 0 && (
          <div className="results-page__grid">
            {completedClasses.map((cls) => (
              <PodiumCard
                key={cls.classId}
                className={cls.className}
                element={cls.element}
                level={cls.level}
                section={cls.section}
                placements={cls.placements}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

**Step 4: Create Results CSS**

```css
/* src/pages/Results/Results.css */
.results-page {
  min-height: 100vh;
  background: var(--color-background);
}

.results-page__header {
  padding: var(--token-space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.results-page__header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.results-page__content {
  padding: var(--token-space-4);
}

.results-page__grid {
  display: grid;
  gap: var(--token-space-4);
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.results-page__loading,
.results-page__error,
.results-page__empty {
  text-align: center;
  padding: var(--token-space-8);
  color: var(--color-text-secondary);
}

.results-page__empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: var(--token-space-4);
}

.results-page__empty h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--token-space-2);
}

.results-page__error button {
  margin-top: var(--token-space-2);
  padding: var(--token-space-2) var(--token-space-4);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--token-space-2);
  cursor: pointer;
}

@media (max-width: 639px) {
  .results-page__grid {
    grid-template-columns: 1fr;
  }
}
```

**Step 5: Add route to App.tsx**

Find the routes section in `src/App.tsx` and add:

```typescript
import { Results } from './pages/Results/Results';

// In the routes:
<Route path="/results" element={<Results />} />
```

**Step 6: Commit**

```bash
git add src/pages/Results/ src/App.tsx
git commit -m "feat(results): add Results page with filters and podium grid"
```

---

## Task 5: Enhance TVRunOrder with Results Pages

**Files:**
- Modify: `src/pages/TVRunOrder/TVRunOrder.tsx`
- Create: `src/pages/TVRunOrder/components/TVPodiumPage.tsx`
- Modify: `src/pages/TVRunOrder/hooks/useTVDisplayData.ts`

**Step 1: Create TVPodiumPage component**

```typescript
// src/pages/TVRunOrder/components/TVPodiumPage.tsx
import { PodiumCard } from '../../../components/podium';
import type { CompletedClassResult } from '../../Results/hooks/useResultsData';
import './TVPodiumPage.css';

interface TVPodiumPageProps {
  classes: CompletedClassResult[];
}

export function TVPodiumPage({ classes }: TVPodiumPageProps) {
  return (
    <div className="tv-podium-page">
      <div className="tv-podium-page__header">
        <span className="tv-podium-page__icon">🏆</span>
        <span className="tv-podium-page__title">Completed Results</span>
      </div>
      <div className="tv-podium-page__grid">
        {classes.map((cls) => (
          <PodiumCard
            key={cls.classId}
            className={cls.className}
            element={cls.element}
            level={cls.level}
            section={cls.section}
            placements={cls.placements}
            variant="full"
          />
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create TVPodiumPage CSS**

```css
/* src/pages/TVRunOrder/components/TVPodiumPage.css */
.tv-podium-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tv-podium-page__header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--token-space-3);
  padding: var(--token-space-4);
  background: var(--color-surface-elevated);
}

.tv-podium-page__icon {
  font-size: 32px;
}

.tv-podium-page__title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.tv-podium-page__grid {
  flex: 1;
  display: grid;
  gap: var(--token-space-4);
  padding: var(--token-space-4);
  grid-template-columns: repeat(2, 1fr);
  align-content: center;
}

/* Single class - center it */
.tv-podium-page__grid:has(> :only-child) {
  grid-template-columns: 1fr;
  max-width: 600px;
  margin: 0 auto;
}
```

**Step 3: Extend useTVDisplayData hook**

Add to `src/pages/TVRunOrder/hooks/useTVDisplayData.ts`:

```typescript
// Add to existing imports
import type { CompletedClassResult } from '../../Results/hooks/useResultsData';

// Add to the hook's return type and implementation:
export interface TVPage {
  type: 'run-order' | 'results';
  classes: any[]; // ClassRunOrderData for run-order, CompletedClassResult for results
}

// In the hook, after fetching in-progress classes, also fetch completed:
const fetchCompletedClasses = async () => {
  // ... similar to useResultsData but returns TVPage format
};

// Combine pages: [...inProgressPages, ...resultsPages]
```

**Step 4: Modify TVRunOrder to render both page types**

In `src/pages/TVRunOrder/TVRunOrder.tsx`:

```typescript
// Add import
import { TVPodiumPage } from './components/TVPodiumPage';

// In the render, check page type:
{currentPage.type === 'run-order' ? (
  <ClassRunOrderGrid classes={currentPage.classes} />
) : (
  <TVPodiumPage classes={currentPage.classes} />
)}
```

**Step 5: Add keyboard shortcuts for results navigation**

```typescript
// In the useEffect for keyboard handling:
case 'KeyR':
  // Jump to first results page
  const resultsPageIndex = pages.findIndex(p => p.type === 'results');
  if (resultsPageIndex >= 0) setCurrentPageIndex(resultsPageIndex);
  break;
case 'KeyI':
  // Jump to first in-progress page
  const inProgressPageIndex = pages.findIndex(p => p.type === 'run-order');
  if (inProgressPageIndex >= 0) setCurrentPageIndex(inProgressPageIndex);
  break;
```

**Step 6: Commit**

```bash
git add src/pages/TVRunOrder/
git commit -m "feat(tv): integrate podium results into TVRunOrder rotation"
```

---

## Task 6: Add Animations

**Files:**
- Modify: `src/components/podium/podium.css`
- Modify: `src/components/podium/PodiumPosition.tsx`

**Step 1: Add entrance animations to CSS**

```css
/* Add to podium.css */

/* Entrance animations */
@keyframes podium-rise {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes card-drop {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes golden-glow {
  0%, 100% {
    box-shadow: var(--podium-first-glow), 0 3px 8px rgba(0, 0, 0, 0.25);
  }
  50% {
    box-shadow: 0 0 30px rgba(212, 175, 55, 0.6), 0 3px 8px rgba(0, 0, 0, 0.25);
  }
}

.podium-position--animate {
  animation: podium-rise 0.5s ease-out backwards;
}

.podium-position--animate.podium-position--first {
  animation-delay: 0.1s;
}

.podium-position--animate.podium-position--second {
  animation-delay: 0.2s;
}

.podium-position--animate.podium-position--third {
  animation-delay: 0.3s;
}

.podium-position--animate.podium-position--fourth {
  animation-delay: 0.4s;
}

.podium-position--animate .podium-position__card {
  animation: card-drop 0.3s ease-out backwards;
  animation-delay: inherit;
}

.podium-position--first .podium-position__badge {
  animation: golden-glow 2s ease-in-out infinite;
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .podium-position--animate,
  .podium-position--animate .podium-position__card,
  .podium-position--first .podium-position__badge {
    animation: none;
  }
}
```

**Step 2: Update PodiumPosition to use animate prop**

```typescript
// In PodiumPosition.tsx, add animate class when prop is true:
const animateClass = animate ? 'podium-position--animate' : '';

return (
  <div className={`podium-position ${placementClass} ${animateClass}`}>
    ...
  </div>
);
```

**Step 3: Commit**

```bash
git add src/components/podium/
git commit -m "feat(podium): add entrance animations with reduced motion support"
```

---

## Task 7: Final Integration & Testing

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass

**Step 2: Run type check**

```bash
npm run typecheck
```

Expected: No type errors

**Step 3: Run lint**

```bash
npm run lint
```

Expected: No lint errors

**Step 4: Manual testing checklist**

- [ ] `/results` page loads without errors
- [ ] Filters work correctly
- [ ] Podium cards render with correct placement order
- [ ] Mobile view shows vertical layout
- [ ] Desktop view shows horizontal podium
- [ ] TVRunOrder shows results pages in rotation
- [ ] Keyboard shortcuts work (R for results, I for in-progress)
- [ ] Animations play on first render
- [ ] Animations respect prefers-reduced-motion

**Step 5: Final commit**

```bash
git add .
git commit -m "feat(podium): complete podium results display implementation"
```

---

## Summary

| Task | Component | Files Created/Modified |
|------|-----------|----------------------|
| 1 | PodiumPosition | 3 files |
| 2 | PodiumCard | 3 files |
| 3 | useResultsData | 2 files |
| 4 | Results page | 5 files |
| 5 | TVRunOrder integration | 4 files |
| 6 | Animations | 2 files |
| 7 | Testing | N/A |

**Total new files:** ~15
**Estimated implementation time:** 4-6 hours
