# Report Generation & Printing System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a report engine with iframe preview and port 3 myK9Q reports (check-in, scoresheet, results) to a dedicated `/secretary/reports` page in myK9Show.

**Architecture:** Registry-driven report system where each report type is a config entry declaring its scopes, sort options, and React component. A top controls bar drives cascading scope selection, and an iframe renders a WYSIWYG print preview. The browser's native print dialog handles printing and PDF export.

**Tech Stack:** React 19, TypeScript, shadcn/ui Select components, ReactDOMServer.renderToStaticMarkup(), React Query, Zustand (show store), Vitest + Testing Library.

**Design Spec:** `docs/superpowers/specs/2026-04-06-report-generation-design.md`

---

## File Map

### New Files (all paths relative to `apps/myk9show/`)

| File                                                    | Responsibility                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/reports/types.ts`                              | `ReportDefinition`, `ReportProps`, `ReportSortOption`, `ReportDataSet` types |
| `src/lib/reports/reportUtils.ts`                        | Formatting/sorting utilities ported from myK9Q                               |
| `src/lib/reports/reportRegistry.ts`                     | Array of report definitions (3 enabled, 6 stubs)                             |
| `src/lib/reports/reportStyles.ts`                       | Print stylesheet as a string constant for iframe injection                   |
| `src/lib/reports/reportRenderer.ts`                     | `renderReportToHtml()` — renders component(s) to full HTML document          |
| `src/components/reports/CheckInSheet.tsx`               | Check-in sheet report component                                              |
| `src/components/reports/ResultsSheet.tsx`               | Results sheet report component                                               |
| `src/components/reports/ScoresheetReport.tsx`           | Scoresheet report component                                                  |
| `src/hooks/queries/useReportData.ts`                    | React Query hook for fetching report data                                    |
| `src/pages/secretary/ReportsPage/index.tsx`             | Page component with header, show selector, controls, preview                 |
| `src/pages/secretary/ReportsPage/ReportControlsBar.tsx` | 4 dropdowns + Print button                                                   |
| `src/pages/secretary/ReportsPage/ReportPreview.tsx`     | Iframe-based WYSIWYG preview                                                 |

### Test Files

| File                                                                   | Covers                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| `src/lib/reports/__tests__/reportUtils.test.ts`                        | Formatting, sorting, result status utilities    |
| `src/lib/reports/__tests__/reportRegistry.test.ts`                     | Registry integrity                              |
| `src/lib/reports/__tests__/reportRenderer.test.ts`                     | HTML generation, batch page breaks              |
| `src/components/reports/__tests__/CheckInSheet.test.tsx`               | Columns, sort order, empty entries              |
| `src/components/reports/__tests__/ResultsSheet.test.tsx`               | Scored filtering, placement sort, qualification |
| `src/components/reports/__tests__/ScoresheetReport.test.tsx`           | Scoring fields, time boxes, section badge       |
| `src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx` | Dropdown cascading, disabled states             |
| `src/pages/secretary/ReportsPage/__tests__/ReportsPage.test.tsx`       | Full page render, show selector, preview        |
| `src/hooks/queries/__tests__/useReportData.test.ts`                    | Data fetching, batch mode, error states         |

### Modified Files

| File                                                    | Change                         |
| ------------------------------------------------------- | ------------------------------ |
| `src/routes/secretaryRoutes.tsx`                        | Add `/secretary/reports` route |
| `src/components/layout/sidebar/unifiedSidebarConfig.ts` | Add "Reports" nav item         |
| `src/lib/queryClient.ts`                                | Add `reportData` query key     |

---

## Task 1: Report Types and Utilities

**Files:**

- Create: `src/lib/reports/types.ts`
- Create: `src/lib/reports/reportUtils.ts`
- Test: `src/lib/reports/__tests__/reportUtils.test.ts`

- [ ] **Step 1: Write the report utility tests**

```typescript
// src/lib/reports/__tests__/reportUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
  formatReportDate,
  formatReportTime,
  sortByRunOrder,
  sortByArmband,
  sortByPlacement,
  getPlacementText,
  getResultStatusText,
  isQualified,
  countQualified,
  getOrgTitle,
  formatTimeLimit,
} from '../reportUtils';
import type { ReportEntry } from '../types';

// Helper to create a minimal entry for testing
function makeEntry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    id: 'entry-1',
    armband: 101,
    runOrder: null,
    callName: 'Buddy',
    breed: 'Golden Retriever',
    handler: 'Sarah Mitchell',
    registrationNumber: 'WS12345',
    checkInStatus: null,
    section: null,
    isScored: false,
    resultText: null,
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    ...overrides,
  };
}

describe('formatReportDate', () => {
  it('formats ISO date to US format', () => {
    expect(formatReportDate('2026-04-12')).toBe('4/12/2026');
  });

  it('does not pad single-digit month/day', () => {
    expect(formatReportDate('2026-01-05')).toBe('1/5/2026');
  });
});

describe('formatReportTime', () => {
  it('formats seconds to mm:ss.hh', () => {
    expect(formatReportTime(1.76)).toBe('00:01.76');
  });

  it('handles minutes', () => {
    expect(formatReportTime(125.5)).toBe('02:05.50');
  });

  it('returns empty string for null', () => {
    expect(formatReportTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatReportTime(undefined)).toBe('');
  });

  it('parses string input', () => {
    expect(formatReportTime('3.25')).toBe('00:03.25');
  });
});

describe('formatTimeLimit', () => {
  it('formats even minutes', () => {
    expect(formatTimeLimit(120)).toBe('2 min');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeLimit(150)).toBe('2:30');
  });

  it('returns empty string for undefined', () => {
    expect(formatTimeLimit(undefined)).toBe('');
  });
});

describe('sortByRunOrder', () => {
  it('sorts by runOrder when present', () => {
    const entries = [
      makeEntry({ id: 'a', armband: 200, runOrder: 3 }),
      makeEntry({ id: 'b', armband: 100, runOrder: 1 }),
      makeEntry({ id: 'c', armband: 150, runOrder: 2 }),
    ];
    const sorted = sortByRunOrder(entries);
    expect(sorted.map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to armband when runOrder is null', () => {
    const entries = [
      makeEntry({ id: 'a', armband: 200, runOrder: null }),
      makeEntry({ id: 'b', armband: 100, runOrder: null }),
    ];
    const sorted = sortByRunOrder(entries);
    expect(sorted.map(e => e.id)).toEqual(['b', 'a']);
  });
});

describe('sortByArmband', () => {
  it('sorts by armband number ascending', () => {
    const entries = [makeEntry({ id: 'a', armband: 200 }), makeEntry({ id: 'b', armband: 100 })];
    const sorted = sortByArmband(entries);
    expect(sorted.map(e => e.id)).toEqual(['b', 'a']);
  });
});

describe('sortByPlacement', () => {
  it('puts qualified entries first by placement', () => {
    const entries = [
      makeEntry({ id: 'nq', resultText: 'nq', finalPlacement: 9996 }),
      makeEntry({ id: 'q2', resultText: 'qualified', finalPlacement: 2 }),
      makeEntry({ id: 'q1', resultText: 'qualified', finalPlacement: 1 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['q1', 'q2', 'nq']);
  });

  it('sorts non-qualified: absent > excused > NQ', () => {
    const entries = [
      makeEntry({ id: 'nq', resultText: 'nq', finalPlacement: 9996, armband: 100 }),
      makeEntry({ id: 'abs', resultText: 'absent', finalPlacement: 9997, armband: 101 }),
      makeEntry({ id: 'exc', resultText: 'excused', finalPlacement: 9998, armband: 102 }),
    ];
    const sorted = sortByPlacement(entries);
    expect(sorted.map(e => e.id)).toEqual(['abs', 'exc', 'nq']);
  });
});

describe('getPlacementText', () => {
  it('returns number for qualified placement', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 1 }))).toBe('1');
  });

  it('returns NQ for code 9996', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 9996 }))).toBe('NQ');
  });

  it('returns ABS for code 9997', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: 9997 }))).toBe('ABS');
  });

  it('returns empty string for null', () => {
    expect(getPlacementText(makeEntry({ finalPlacement: null }))).toBe('');
  });
});

describe('getResultStatusText', () => {
  it('returns Qualified for q', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'q' }))).toBe('Qualified');
  });

  it('returns Qualified for qualified', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'qualified' }))).toBe('Qualified');
  });

  it('returns NQ for nq', () => {
    expect(getResultStatusText(makeEntry({ resultText: 'nq' }))).toBe('NQ');
  });

  it('returns empty string for null', () => {
    expect(getResultStatusText(makeEntry({ resultText: null }))).toBe('');
  });
});

describe('isQualified', () => {
  it('returns true for q', () => {
    expect(isQualified(makeEntry({ resultText: 'q' }))).toBe(true);
  });

  it('returns false for nq', () => {
    expect(isQualified(makeEntry({ resultText: 'nq' }))).toBe(false);
  });
});

describe('countQualified', () => {
  it('counts qualified entries', () => {
    const entries = [
      makeEntry({ resultText: 'qualified' }),
      makeEntry({ resultText: 'nq' }),
      makeEntry({ resultText: 'q' }),
    ];
    expect(countQualified(entries)).toBe(2);
  });
});

describe('getOrgTitle', () => {
  it('returns AKC Scent Work for scent elements', () => {
    expect(getOrgTitle('Scent Work')).toBe('AKC Scent Work');
  });

  it('returns Dog Sport for unknown elements', () => {
    expect(getOrgTitle('Unknown')).toBe('Dog Sport');
  });

  it('returns empty string for undefined', () => {
    expect(getOrgTitle(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/lib/reports/__tests__/reportUtils.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create the types file**

```typescript
// src/lib/reports/types.ts
import type { DbShow, DbTrial, DbClass, DbEntry } from '@/types/database-mappings';

/**
 * Lightweight entry shape used by report components.
 * Maps from DbEntry fields to a report-friendly interface.
 */
export interface ReportEntry {
  id: string;
  armband: number;
  runOrder: number | null;
  callName: string;
  breed: string;
  handler: string;
  registrationNumber: string | null;
  checkInStatus: string | null;
  section: string | null;
  isScored: boolean;
  resultText: string | null;
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  finalPlacement: number | null;
}

/** Sort option for a report type */
export interface ReportSortOption {
  value: string;
  label: string;
}

/** Props passed to every report component */
export interface ReportProps {
  showName: string;
  trial?: {
    date: string;
    trialNumber: string;
    judgeName: string;
  };
  classData?: {
    element: string;
    level: string;
    section: string;
    timeLimitSeconds?: number | null;
    timeLimitArea2Seconds?: number | null;
    timeLimitArea3Seconds?: number | null;
    areaCount?: number | null;
    hidesText?: string | null;
    distractionsText?: string | null;
  };
  entries: ReportEntry[];
  sortOrder: string;
  organization?: string;
  activityType?: string;
}

/** Report definition in the registry */
export interface ReportDefinition {
  id: string;
  name: string;
  category: string;
  scopes: ('show' | 'trial' | 'class')[];
  sortOptions: ReportSortOption[];
  defaultSort: string;
  component: React.ComponentType<ReportProps>;
  enabled: boolean;
}

/** Grouped data returned by useReportData */
export interface ReportDataSet {
  show: DbShow;
  /** One item per report page to render */
  pages: ReportPageData[];
}

export interface ReportPageData {
  trial: DbTrial;
  classData: DbClass;
  entries: DbEntry[];
}
```

- [ ] **Step 4: Create the utilities file**

```typescript
// src/lib/reports/reportUtils.ts
import type { ReportEntry } from './types';

/** Format ISO date to US format: "2026-04-12" → "4/12/2026" */
export function formatReportDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${month}/${day}/${year}`;
}

/** Format seconds to mm:ss.hh: 1.76 → "00:01.76" */
export function formatReportTime(time: string | number | null | undefined): string {
  if (time == null) return '';
  const seconds = typeof time === 'string' ? parseFloat(time) : time;
  if (isNaN(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds - Math.floor(seconds)) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

/** Format time limit: 120 → "2 min", 150 → "2:30" */
export function formatTimeLimit(seconds: number | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins} min`;
}

/** Sort entries by run_order (falls back to armband) */
export function sortByRunOrder(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.runOrder ?? a.armband;
    const bOrder = b.runOrder ?? b.armband;
    return aOrder - bOrder;
  });
}

/** Sort entries by armband number ascending */
export function sortByArmband(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => a.armband - b.armband);
}

/** Sort entries by placement: qualified first (by place #), then absent > excused > NQ */
export function sortByPlacement(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => {
    const aResult = a.resultText?.toLowerCase() || '';
    const bResult = b.resultText?.toLowerCase() || '';
    const aQualified = (aResult === 'q' || aResult === 'qualified') && a.finalPlacement;
    const bQualified = (bResult === 'q' || bResult === 'qualified') && b.finalPlacement;

    if (aQualified && !bQualified) return -1;
    if (!aQualified && bQualified) return 1;
    if (aQualified && bQualified) return (a.finalPlacement || 0) - (b.finalPlacement || 0);

    const aAbsent = aResult === 'absent';
    const bAbsent = bResult === 'absent';
    if (aAbsent && !bAbsent) return -1;
    if (!aAbsent && bAbsent) return 1;

    const aExcused = aResult === 'excused';
    const bExcused = bResult === 'excused';
    if (aExcused && !bExcused) return -1;
    if (!aExcused && bExcused) return 1;

    return a.armband - b.armband;
  });
}

/** Placement display text: number for qualified, code for others */
export function getPlacementText(entry: ReportEntry): string {
  const p = entry.finalPlacement;
  if (p == null) return '';
  if (p < 9000) return p.toString();
  if (p === 9995) return 'EXC';
  if (p === 9996) return 'NQ';
  if (p === 9997) return 'ABS';
  if (p === 9998) return 'EX';
  if (p === 9999) return 'WD';
  if (p === 10000) return 'DQ';
  if (p === 10001) return 'COMP';
  return '';
}

/** Human-readable result status */
export function getResultStatusText(entry: ReportEntry): string {
  const r = entry.resultText?.toLowerCase();
  if (!r) return '';
  if (r === 'q' || r === 'qualified') return 'Qualified';
  if (r === 'nq') return 'NQ';
  if (r === 'absent') return 'Absent';
  if (r === 'excused') return 'Excused';
  if (r === 'withdrawn') return 'Withdrawn';
  return entry.resultText || '';
}

/** Check if entry is qualified */
export function isQualified(entry: ReportEntry): boolean {
  const r = entry.resultText?.toLowerCase();
  return r === 'q' || r === 'qualified';
}

/** Count qualified entries */
export function countQualified(entries: ReportEntry[]): number {
  return entries.filter(isQualified).length;
}

/** Get organization-specific title prefix from element name */
export function getOrgTitle(element?: string): string {
  if (!element) return '';
  const lower = element.toLowerCase();
  if (lower.includes('scent') || lower.includes('nose')) return 'AKC Scent Work';
  if (lower.includes('rally')) return 'UKC Rally';
  if (lower.includes('obedience')) return 'UKC Obedience';
  if (lower.includes('agility')) return 'UKC Agility';
  if (lower.includes('fastcat')) return 'AKC FastCAT';
  return 'Dog Sport';
}

/** Map a DbEntry to the lightweight ReportEntry shape */
export function mapDbEntryToReportEntry(
  dbEntry: {
    id: string;
    armband: number | null;
    run_order: number | null;
    check_in_status: string | null;
    section: string | null;
    is_scored: boolean | null;
    result_status: string | null;
    search_time_seconds: number | null;
    total_faults: number | null;
    final_placement: number | null;
  },
  dogName: string,
  breed: string,
  handler: string,
  registrationNumber: string | null
): ReportEntry {
  return {
    id: dbEntry.id,
    armband: dbEntry.armband ?? 0,
    runOrder: dbEntry.run_order,
    callName: dogName,
    breed,
    handler,
    registrationNumber,
    checkInStatus: dbEntry.check_in_status,
    section: dbEntry.section,
    isScored: dbEntry.is_scored ?? false,
    resultText: dbEntry.result_status,
    searchTimeSeconds: dbEntry.search_time_seconds,
    totalFaults: dbEntry.total_faults,
    finalPlacement: dbEntry.final_placement,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/lib/reports/__tests__/reportUtils.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/lib/reports/types.ts apps/myk9show/src/lib/reports/reportUtils.ts apps/myk9show/src/lib/reports/__tests__/reportUtils.test.ts
git commit -m "feat(reports): add report types and utility functions

Port formatting, sorting, and result status utilities from myK9Q.
Add ReportEntry, ReportProps, ReportDefinition types."
```

---

## Task 2: Report Registry

**Files:**

- Create: `src/lib/reports/reportRegistry.ts`
- Test: `src/lib/reports/__tests__/reportRegistry.test.ts`

- [ ] **Step 1: Write the registry tests**

```typescript
// src/lib/reports/__tests__/reportRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { reportRegistry, getReportById, getEnabledReports } from '../reportRegistry';

describe('reportRegistry', () => {
  it('has 9 total report definitions', () => {
    expect(reportRegistry).toHaveLength(9);
  });

  it('has 3 enabled reports for Phase 1', () => {
    expect(getEnabledReports()).toHaveLength(3);
  });

  it('every entry has a unique id', () => {
    const ids = reportRegistry.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every enabled entry has a component', () => {
    for (const report of getEnabledReports()) {
      expect(report.component).toBeDefined();
    }
  });

  it('every entry has at least one scope', () => {
    for (const report of reportRegistry) {
      expect(report.scopes.length).toBeGreaterThan(0);
    }
  });

  it('every entry with sort options has a valid defaultSort', () => {
    for (const report of reportRegistry) {
      if (report.sortOptions.length > 0) {
        const values = report.sortOptions.map(s => s.value);
        expect(values).toContain(report.defaultSort);
      }
    }
  });

  it('getReportById returns correct report', () => {
    const report = getReportById('check-in-sheet');
    expect(report?.name).toBe('Check-in Sheet');
  });

  it('getReportById returns undefined for unknown id', () => {
    expect(getReportById('nonexistent')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/lib/reports/__tests__/reportRegistry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the registry**

```typescript
// src/lib/reports/reportRegistry.ts
import { CheckInSheet } from '@/components/reports/CheckInSheet';
import { ScoresheetReport } from '@/components/reports/ScoresheetReport';
import { ResultsSheet } from '@/components/reports/ResultsSheet';
import type { ReportDefinition } from './types';

/** Placeholder component for Phase 2 stubs */
const PlaceholderReport = () => null;

export const reportRegistry: ReportDefinition[] = [
  // ── Operational ──
  {
    id: 'check-in-sheet',
    name: 'Check-in Sheet',
    category: 'operational',
    scopes: ['trial', 'class'],
    sortOptions: [
      { value: 'run-order', label: 'Run Order' },
      { value: 'armband', label: 'Armband #' },
    ],
    defaultSort: 'run-order',
    component: CheckInSheet,
    enabled: true,
  },
  {
    id: 'scoresheet',
    name: 'Score Sheet',
    category: 'operational',
    scopes: ['trial', 'class'],
    sortOptions: [
      { value: 'run-order', label: 'Run Order' },
      { value: 'armband', label: 'Armband #' },
    ],
    defaultSort: 'run-order',
    component: ScoresheetReport,
    enabled: true,
  },
  {
    id: 'results-sheet',
    name: 'Results Sheet',
    category: 'operational',
    scopes: ['trial', 'class'],
    sortOptions: [
      { value: 'placement', label: 'Placement' },
      { value: 'armband', label: 'Armband #' },
    ],
    defaultSort: 'placement',
    component: ResultsSheet,
    enabled: true,
  },
  // ── Phase 2 stubs ──
  {
    id: 'show-catalog',
    name: 'Show Catalog',
    category: 'operational',
    scopes: ['show', 'trial'],
    sortOptions: [
      { value: 'armband', label: 'Armband #' },
      { value: 'handler-name', label: 'Handler Name' },
      { value: 'breed', label: 'Breed' },
    ],
    defaultSort: 'armband',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'result-catalog',
    name: 'Result Catalog',
    category: 'operational',
    scopes: ['show', 'trial'],
    sortOptions: [
      { value: 'placement', label: 'Placement' },
      { value: 'armband', label: 'Armband #' },
      { value: 'handler-name', label: 'Handler Name' },
    ],
    defaultSort: 'placement',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'judges-schedule',
    name: "Judge's Schedule",
    category: 'operational',
    scopes: ['show'],
    sortOptions: [
      { value: 'trial-date', label: 'Trial Date' },
      { value: 'judge-name', label: 'Judge Name' },
    ],
    defaultSort: 'trial-date',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'trial-secretary-report',
    name: 'Trial Secretary Report',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'judges-certification',
    name: "Judge's Certification Report",
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'trial-chairman-report',
    name: 'Trial Chairman Report',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
];

export function getReportById(id: string): ReportDefinition | undefined {
  return reportRegistry.find(r => r.id === id);
}

export function getEnabledReports(): ReportDefinition[] {
  return reportRegistry.filter(r => r.enabled);
}
```

Note: The report component imports will fail until Task 4-6 create them. For now, create minimal placeholder files so the registry compiles:

```typescript
// src/components/reports/CheckInSheet.tsx
import type { ReportProps } from '@/lib/reports/types';
export const CheckInSheet: React.FC<ReportProps> = () => null;
```

```typescript
// src/components/reports/ScoresheetReport.tsx
import type { ReportProps } from '@/lib/reports/types';
export const ScoresheetReport: React.FC<ReportProps> = () => null;
```

```typescript
// src/components/reports/ResultsSheet.tsx
import type { ReportProps } from '@/lib/reports/types';
export const ResultsSheet: React.FC<ReportProps> = () => null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/lib/reports/__tests__/reportRegistry.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/lib/reports/reportRegistry.ts apps/myk9show/src/lib/reports/__tests__/reportRegistry.test.ts apps/myk9show/src/components/reports/CheckInSheet.tsx apps/myk9show/src/components/reports/ScoresheetReport.tsx apps/myk9show/src/components/reports/ResultsSheet.tsx
git commit -m "feat(reports): add report registry with Phase 1 entries and Phase 2 stubs

3 enabled reports (check-in, scoresheet, results) + 6 disabled stubs.
Registry-driven pattern for extensibility."
```

---

## Task 3: Print Stylesheet and Report Renderer

**Files:**

- Create: `src/lib/reports/reportStyles.ts`
- Create: `src/lib/reports/reportRenderer.ts`
- Test: `src/lib/reports/__tests__/reportRenderer.test.ts`

- [ ] **Step 1: Write the renderer tests**

```typescript
// src/lib/reports/__tests__/reportRenderer.test.ts
import { describe, it, expect } from 'vitest';
import { renderReportToHtml } from '../reportRenderer';

describe('renderReportToHtml', () => {
  it('produces a complete HTML document', () => {
    const html = renderReportToHtml('<div>Report content</div>');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('inlines the print stylesheet', () => {
    const html = renderReportToHtml('<div>content</div>');
    expect(html).toContain('@page');
    expect(html).toContain('size: letter');
  });

  it('includes the report content', () => {
    const html = renderReportToHtml('<div class="my-report">Hello</div>');
    expect(html).toContain('class="my-report"');
    expect(html).toContain('Hello');
  });

  it('concatenates multiple pages with page breaks', () => {
    const pages = ['<div>Page 1</div>', '<div>Page 2</div>', '<div>Page 3</div>'];
    const html = renderReportToHtml(pages.join(''));
    expect(html).toContain('Page 1');
    expect(html).toContain('Page 2');
    expect(html).toContain('Page 3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/lib/reports/__tests__/reportRenderer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the print stylesheet constant**

```typescript
// src/lib/reports/reportStyles.ts

/**
 * Print stylesheet for report iframe.
 * Inlined as a string because dynamically written iframes cannot load external CSS files.
 * Based on myK9Q's PRINT_STYLES but adapted for myK9Show branding.
 */
export const REPORT_STYLES = `
@page { size: letter; margin: 0.5in; }

.report-page {
  font-family: Arial, sans-serif;
  color: #000;
  background: #fff;
  max-width: 8.5in;
  margin: 0 auto;
  padding: 0;
  box-sizing: border-box;
}

.report-page + .report-page {
  page-break-before: always;
}

/* Header */
.report-header {
  position: relative;
  text-align: center;
  margin-bottom: 1.5rem;
  padding-top: 0.5rem;
}
.report-logo {
  position: absolute;
  left: 0;
  top: 0;
  font-size: 16px;
  font-weight: bold;
  color: #14b8a6;
  letter-spacing: -0.3px;
}
.report-title {
  font-size: 20px;
  font-weight: bold;
  margin: 0;
  padding: 0;
  line-height: 1.2;
}
.report-show-id {
  position: absolute;
  right: 0;
  top: 0;
  font-size: 12px;
}
.report-show-name {
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  margin: 0.5rem 0;
}

/* Trial info box */
.trial-info-box {
  border: 1px solid #000;
  padding: 0.75rem;
  margin: 1rem 0 1.5rem 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 1rem;
  font-size: 12px;
}
.info-row { display: flex; gap: 0.5rem; }
.info-label { font-weight: 600; }

/* Tables */
.report-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 11px;
}
.report-table th {
  background-color: #f0f0f0;
  border: 1px solid #000;
  padding: 6px 8px;
  text-align: left;
  font-weight: bold;
  font-size: 10px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.report-table td {
  border: 1px solid #000;
  padding: 6px 8px;
  vertical-align: middle;
}
.report-table tbody tr:nth-child(even) {
  background-color: #fafafa;
}

/* Checkboxes */
.checkbox-cell { text-align: center; padding: 4px; }
.checkbox-square {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1.5px solid #000;
  vertical-align: middle;
}

/* Result styling */
.qualified-text { color: #14b8a6; font-weight: bold; }
.nq-text { color: #ef4444; font-weight: bold; }
.place-cell { font-weight: bold; text-align: center; }
.time-cell { font-family: 'Courier New', monospace; }
.armband-cell { text-align: center; font-weight: 600; }

/* Footer */
.report-footer {
  margin-top: 2rem;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}

/* Scoresheet-specific */
.scoresheet-header {
  border: 1px solid #000;
  padding: 0.4rem 0.5rem;
  margin-bottom: 0.5rem;
}
.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.35rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #ccc;
}
.header-columns {
  display: flex;
  gap: 1.5rem;
  font-size: 10px;
}
.header-col { display: flex; flex-direction: column; gap: 1px; }
.header-col:first-child { min-width: 140px; }
.header-col:nth-child(2) { min-width: 100px; }
.scoresheet-entries { display: flex; flex-direction: column; gap: 0.4rem; }
.scoresheet-entry-row {
  display: grid;
  grid-template-columns: 150px 140px 1fr 140px;
  gap: 0.5rem;
  border: 1px solid #000;
  padding: 0.5rem;
  page-break-inside: avoid;
}
.entry-info { display: flex; gap: 0.5rem; align-items: flex-start; }
.entry-armband { font-size: 18px; font-weight: 700; min-width: 36px; }
.entry-details { display: flex; flex-direction: column; gap: 2px; }
.entry-callname { font-weight: 600; font-size: 12px; }
.entry-reg { font-size: 9px; color: #666; }
.entry-breed { font-size: 10px; color: #444; }
.entry-handler { font-size: 10px; font-weight: 500; margin-top: 4px; padding-top: 2px; border-top: 1px dotted #ccc; }
.entry-results { display: flex; flex-direction: column; gap: 0.25rem; }
.results-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem; flex-wrap: wrap; }
.result-item { display: flex; align-items: center; gap: 3px; font-size: 9px; }
.result-item .checkbox-square { width: 12px; height: 12px; }
.scoring-fields { display: flex; flex-direction: column; gap: 2px; }
.field-row { display: flex; align-items: baseline; gap: 0.25rem; }
.field-label { font-size: 9px; min-width: 75px; }
.field-line { width: 30px; border-bottom: 1px solid #999; }
.entry-reasons { display: flex; gap: 0.75rem; font-size: 8px; }
.reasons-group { display: flex; flex-direction: column; gap: 1px; }
.reasons-label { font-weight: 700; font-size: 9px; margin-bottom: 2px; }
.reasons-list { display: flex; flex-direction: column; gap: 1px; }
.reason-item { display: flex; align-items: center; gap: 3px; }
.reason-item .checkbox-square { width: 9px; height: 9px; border-width: 1px; }
.entry-time { display: flex; gap: 4px; align-items: flex-start; }
.time-box { width: 40px; height: 40px; border: 1px solid #000; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.time-label { font-size: 9px; color: #666; margin-bottom: 3px; }
.entry-time.multi-area { flex-direction: column; gap: 3px; }
.time-row { display: flex; gap: 3px; align-items: center; }
.time-row-total { margin-top: 2px; padding-top: 3px; border-top: 1px solid #999; }
.area-label { font-size: 9px; font-weight: 600; min-width: 20px; }
.time-box-sm { width: 28px; height: 28px; border: 1px solid #000; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.time-box-sm .time-label { font-size: 7px; margin-bottom: 2px; }

/* Print overrides */
@media print {
  .report-table th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .report-table tbody tr:nth-child(even) { background-color: #fafafa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .qualified-text { color: #14b8a6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .nq-text { color: #ef4444 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .scoresheet-entry-row { border: 1px solid #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
```

- [ ] **Step 4: Create the renderer**

```typescript
// src/lib/reports/reportRenderer.ts
import { REPORT_STYLES } from './reportStyles';

/**
 * Wrap report HTML content in a complete document with the print stylesheet.
 * Used to write into an iframe for WYSIWYG preview and printing.
 */
export function renderReportToHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report Preview</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  ${content}
</body>
</html>`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/lib/reports/__tests__/reportRenderer.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/lib/reports/reportStyles.ts apps/myk9show/src/lib/reports/reportRenderer.ts apps/myk9show/src/lib/reports/__tests__/reportRenderer.test.ts
git commit -m "feat(reports): add print stylesheet and HTML renderer

Inline CSS for iframe injection. renderReportToHtml wraps content
in a complete document with the print stylesheet."
```

---

## Task 4: Check-in Sheet Report Component

**Files:**

- Modify: `src/components/reports/CheckInSheet.tsx` (replace placeholder)
- Test: `src/components/reports/__tests__/CheckInSheet.test.tsx`

- [ ] **Step 1: Write the tests**

```typescript
// src/components/reports/__tests__/CheckInSheet.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckInSheet } from '../CheckInSheet';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Patricia Smith' },
  classData: { element: 'Buried', level: 'Novice', section: '' },
  entries: [
    { id: '1', armband: 142, runOrder: 2, callName: 'Buddy', breed: 'Golden Retriever', handler: 'Sarah Mitchell', registrationNumber: 'WS12345', checkInStatus: 'checked-in', section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null },
    { id: '2', armband: 108, runOrder: 1, callName: 'Max', breed: 'German Shepherd', handler: 'Tom Rivera', registrationNumber: 'WS67890', checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null },
  ],
  sortOrder: 'run-order',
};

describe('CheckInSheet', () => {
  it('renders the report title', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText(/Check-in/)).toBeInTheDocument();
  });

  it('renders myK9Show branding', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
  });

  it('renders trial info fields', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText('4/12/2026')).toBeInTheDocument();
    expect(screen.getByText('Dr. Patricia Smith')).toBeInTheDocument();
    expect(screen.getByText('Buried')).toBeInTheDocument();
    expect(screen.getByText('Novice')).toBeInTheDocument();
  });

  it('renders entries in run order by default', () => {
    const { container } = render(<CheckInSheet {...baseProps} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    // runOrder 1 (Max, armband 108) should come first
    expect(rows[0].textContent).toContain('Max');
    expect(rows[1].textContent).toContain('Buddy');
  });

  it('renders entries in armband order when specified', () => {
    const { container } = render(<CheckInSheet {...baseProps} sortOrder="armband" />);
    const rows = container.querySelectorAll('tbody tr');
    // armband 108 (Max) should come first
    expect(rows[0].textContent).toContain('Max');
    expect(rows[1].textContent).toContain('Buddy');
  });

  it('renders entry count in footer', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText(/Class Entries: 2/)).toBeInTheDocument();
  });

  it('handles empty entries', () => {
    render(<CheckInSheet {...baseProps} entries={[]} />);
    expect(screen.getByText(/Class Entries: 0/)).toBeInTheDocument();
  });

  it('shows section when provided and non-empty', () => {
    render(<CheckInSheet {...baseProps} classData={{ element: 'Buried', level: 'Novice', section: 'A' }} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/CheckInSheet.test.tsx`
Expected: FAIL — component renders null

- [ ] **Step 3: Implement CheckInSheet**

```typescript
// src/components/reports/CheckInSheet.tsx
import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate, sortByRunOrder, sortByArmband, getOrgTitle } from '@/lib/reports/reportUtils';

export const CheckInSheet: React.FC<ReportProps> = ({
  showName,
  trial,
  classData,
  entries,
  sortOrder,
  organization,
  activityType,
}) => {
  const sortedEntries = sortOrder === 'armband' ? sortByArmband(entries) : sortByRunOrder(entries);

  const orgTitle =
    organization && activityType
      ? `${organization} ${activityType}`
      : organization
        ? `${organization} ${classData?.element ?? ''}`
        : getOrgTitle(classData?.element);

  return (
    <div className="report-page">
      {/* Header */}
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle} Check-in</h1>
      </div>

      {/* Show Name */}
      {showName && <div className="report-show-name">{showName}</div>}

      {/* Trial Info Box */}
      {trial && (
        <div className="trial-info-box">
          <div className="info-row">
            <span className="info-label">Trial Date:</span>
            <span>{formatReportDate(trial.date)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Element:</span>
            <span>{classData?.element}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Trial #:</span>
            <span>{trial.trialNumber}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Level:</span>
            <span>{classData?.level}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Judge:</span>
            <span>{trial.judgeName || 'TBD'}</span>
          </div>
          {classData?.section && classData.section.trim() !== '' && (
            <div className="info-row">
              <span className="info-label">Section:</span>
              <span>{classData.section}</span>
            </div>
          )}
        </div>
      )}

      {/* Entry Table */}
      <table className="report-table">
        <thead>
          <tr>
            <th>Gate</th>
            <th>Armband</th>
            <th>Call Name</th>
            <th>Breed</th>
            <th>Reg #</th>
            <th>Handler</th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map(entry => (
            <tr key={entry.id}>
              <td className="checkbox-cell">
                <div className="checkbox-square" />
              </td>
              <td className="armband-cell">{entry.armband}</td>
              <td>{entry.callName}</td>
              <td>{entry.breed}</td>
              <td>{entry.registrationNumber ?? ''}</td>
              <td>{entry.handler}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className="report-footer">
        <span>Class Entries: {sortedEntries.length}</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/CheckInSheet.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/CheckInSheet.tsx apps/myk9show/src/components/reports/__tests__/CheckInSheet.test.tsx
git commit -m "feat(reports): implement CheckInSheet report component

Ported from myK9Q with myK9Show branding. Supports run-order
and armband sort. Uses ReportProps contract."
```

---

## Task 5: Results Sheet Report Component

**Files:**

- Modify: `src/components/reports/ResultsSheet.tsx` (replace placeholder)
- Test: `src/components/reports/__tests__/ResultsSheet.test.tsx`

- [ ] **Step 1: Write the tests**

```typescript
// src/components/reports/__tests__/ResultsSheet.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultsSheet } from '../ResultsSheet';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';

function makeEntry(overrides: Partial<ReportEntry>): ReportEntry {
  return {
    id: 'e1', armband: 101, runOrder: null, callName: 'Buddy', breed: 'Golden Retriever',
    handler: 'Sarah Mitchell', registrationNumber: null, checkInStatus: null, section: null,
    isScored: true, resultText: 'qualified', searchTimeSeconds: 45.2, totalFaults: 0,
    finalPlacement: 1, ...overrides,
  };
}

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Smith' },
  classData: { element: 'Buried', level: 'Novice', section: '' },
  entries: [
    makeEntry({ id: '1', armband: 142, callName: 'Buddy', finalPlacement: 2, searchTimeSeconds: 55.3 }),
    makeEntry({ id: '2', armband: 108, callName: 'Max', finalPlacement: 1, searchTimeSeconds: 45.2 }),
    makeEntry({ id: '3', armband: 215, callName: 'Duke', resultText: 'nq', finalPlacement: 9996, searchTimeSeconds: null, totalFaults: 2 }),
  ],
  sortOrder: 'placement',
};

describe('ResultsSheet', () => {
  it('renders the report title', () => {
    render(<ResultsSheet {...baseProps} />);
    expect(screen.getByText(/Preliminary Results/)).toBeInTheDocument();
  });

  it('renders myK9Show branding', () => {
    render(<ResultsSheet {...baseProps} />);
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
  });

  it('sorts by placement by default', () => {
    const { container } = render(<ResultsSheet {...baseProps} />);
    const rows = container.querySelectorAll('tbody tr');
    // Place 1 (Max, armband 108) first, Place 2 (Buddy, armband 142) second, NQ last
    expect(rows[0].textContent).toContain('Max');
    expect(rows[1].textContent).toContain('Buddy');
  });

  it('renders qualified count', () => {
    render(<ResultsSheet {...baseProps} />);
    expect(screen.getByText(/Qualified Entries: 2/)).toBeInTheDocument();
  });

  it('formats search time', () => {
    render(<ResultsSheet {...baseProps} />);
    expect(screen.getByText('00:45.20')).toBeInTheDocument();
  });

  it('renders NQ text for non-qualified entries', () => {
    render(<ResultsSheet {...baseProps} />);
    expect(screen.getByText('NQ')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/ResultsSheet.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement ResultsSheet**

```typescript
// src/components/reports/ResultsSheet.tsx
import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import {
  formatReportDate,
  formatReportTime,
  sortByPlacement,
  sortByArmband,
  getPlacementText,
  getResultStatusText,
  isQualified,
  countQualified,
  getOrgTitle,
} from '@/lib/reports/reportUtils';

export const ResultsSheet: React.FC<ReportProps> = ({
  showName,
  trial,
  classData,
  entries,
  sortOrder,
  organization,
  activityType,
}) => {
  const sortedEntries = sortOrder === 'armband' ? sortByArmband(entries) : sortByPlacement(entries);
  const qualifiedCount = countQualified(sortedEntries);

  const orgTitle =
    organization && activityType
      ? `${organization} ${activityType}`
      : organization
        ? `${organization} ${classData?.element ?? ''}`
        : getOrgTitle(classData?.element);

  return (
    <div className="report-page">
      {/* Header */}
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle} Preliminary Results</h1>
      </div>

      {showName && <div className="report-show-name">{showName}</div>}

      {trial && (
        <div className="trial-info-box">
          <div className="info-row">
            <span className="info-label">Trial Date:</span>
            <span>{formatReportDate(trial.date)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Element:</span>
            <span>{classData?.element}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Trial #:</span>
            <span>{trial.trialNumber}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Level:</span>
            <span>{classData?.level}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Judge:</span>
            <span>{trial.judgeName || 'TBD'}</span>
          </div>
          {classData?.section && classData.section.trim() !== '' && (
            <div className="info-row">
              <span className="info-label">Section:</span>
              <span>{classData.section}</span>
            </div>
          )}
        </div>
      )}

      <table className="report-table">
        <thead>
          <tr>
            <th>Place</th>
            <th>Armband</th>
            <th>Call Name</th>
            <th>Breed</th>
            <th>Handler</th>
            <th>Qualified</th>
            <th>Faults</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map(entry => {
            const qualified = isQualified(entry);
            return (
              <tr key={entry.id}>
                <td className="place-cell">{getPlacementText(entry)}</td>
                <td className="armband-cell">{entry.armband}</td>
                <td>{entry.callName}</td>
                <td>{entry.breed}</td>
                <td>{entry.handler}</td>
                <td className={qualified ? 'qualified-text' : 'nq-text'}>
                  {getResultStatusText(entry)}
                </td>
                <td>{entry.totalFaults ?? 0}</td>
                <td className="time-cell">{formatReportTime(entry.searchTimeSeconds)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="report-footer">
        <span>
          Class Entries: {sortedEntries.length}
          <span style={{ marginLeft: '1.5rem' }}>Qualified Entries: {qualifiedCount}</span>
        </span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/ResultsSheet.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/ResultsSheet.tsx apps/myk9show/src/components/reports/__tests__/ResultsSheet.test.tsx
git commit -m "feat(reports): implement ResultsSheet report component

Ported from myK9Q with myK9Show branding. Placement and armband
sort. Qualified/NQ status and count."
```

---

## Task 6: Scoresheet Report Component

**Files:**

- Modify: `src/components/reports/ScoresheetReport.tsx` (replace placeholder)
- Test: `src/components/reports/__tests__/ScoresheetReport.test.tsx`

- [ ] **Step 1: Write the tests**

```typescript
// src/components/reports/__tests__/ScoresheetReport.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoresheetReport } from '../ScoresheetReport';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';

const entry: ReportEntry = {
  id: '1', armband: 101, runOrder: 1, callName: 'Buddy', breed: 'Golden Retriever',
  handler: 'Sarah Mitchell', registrationNumber: 'WS12345', checkInStatus: null,
  section: null, isScored: false, resultText: null, searchTimeSeconds: null,
  totalFaults: null, finalPlacement: null,
};

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Smith' },
  classData: {
    element: 'Buried', level: 'Novice', section: '',
    timeLimitSeconds: 120, areaCount: 1,
    hidesText: '1', distractionsText: 'None',
  },
  entries: [entry],
  sortOrder: 'run-order',
};

describe('ScoresheetReport', () => {
  it('renders the scoresheet title', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText(/Scoresheet/)).toBeInTheDocument();
  });

  it('renders myK9Show branding', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
  });

  it('renders entry armband', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('renders dog name and handler', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
  });

  it('renders class requirements', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText(/Hides:/)).toBeInTheDocument();
  });

  it('renders time limit', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText(/2 min/)).toBeInTheDocument();
  });

  it('renders NQ and Excused reason checkboxes', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('Incorrect Call')).toBeInTheDocument();
    expect(screen.getByText('Handler Request')).toBeInTheDocument();
  });

  it('renders multi-area time boxes when areaCount > 1', () => {
    const multiAreaProps = {
      ...baseProps,
      classData: {
        ...baseProps.classData!,
        areaCount: 3,
        timeLimitSeconds: 120,
        timeLimitArea2Seconds: 90,
        timeLimitArea3Seconds: 60,
      },
    };
    const { container } = render(<ScoresheetReport {...multiAreaProps} />);
    expect(container.querySelectorAll('.area-label').length).toBeGreaterThanOrEqual(3);
  });

  it('renders entry count', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText(/Entries: 1/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/ScoresheetReport.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement ScoresheetReport**

```typescript
// src/components/reports/ScoresheetReport.tsx
import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate, sortByRunOrder, sortByArmband, getOrgTitle, formatTimeLimit } from '@/lib/reports/reportUtils';

export const ScoresheetReport: React.FC<ReportProps> = ({
  trial,
  classData,
  entries,
  sortOrder,
  organization,
  activityType,
}) => {
  const sortedEntries = sortOrder === 'armband' ? sortByArmband(entries) : sortByRunOrder(entries);

  const orgTitle =
    organization && activityType
      ? `${organization} ${activityType}`
      : organization
        ? `${organization} ${classData?.element ?? ''}`
        : getOrgTitle(classData?.element);

  const timeLimit1 = formatTimeLimit(classData?.timeLimitSeconds ?? undefined);
  const timeLimit2 = formatTimeLimit(classData?.timeLimitArea2Seconds ?? undefined);
  const timeLimit3 = formatTimeLimit(classData?.timeLimitArea3Seconds ?? undefined);
  const areaCount = classData?.areaCount || 1;

  const sectionDisplay =
    classData?.section && classData.section.trim() !== '' ? ` - ${classData.section}` : '';

  return (
    <div className="report-page">
      {/* Compact Header */}
      <div className="scoresheet-header">
        <div className="header-top">
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#14b8a6' }}>myK9Show</span>
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{orgTitle} Scoresheet</span>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>Entries: {sortedEntries.length}</span>
        </div>
        <div className="header-columns">
          <div className="header-col">
            <div><strong>Trial Date:</strong> {trial ? formatReportDate(trial.date) : ''}</div>
            <div><strong>Trial #:</strong> {trial?.trialNumber}</div>
            <div><strong>Judge:</strong> {trial?.judgeName || 'TBD'}</div>
          </div>
          <div className="header-col">
            <div><strong>Element:</strong> {classData?.element}</div>
            <div><strong>Level:</strong> {classData?.level}{sectionDisplay}</div>
          </div>
          <div className="header-col">
            <div>
              <strong>Req:</strong> Hides: {classData?.hidesText || '___'} - Distractions:{' '}
              {classData?.distractionsText || '___'}
            </div>
          </div>
          <div className="header-col">
            <div><strong>Used:</strong> Hides: ___</div>
            <div>
              <strong>Time:</strong> A1: {timeLimit1 || '___'}
              {areaCount >= 2 ? ` - A2: ${timeLimit2 || '___'}` : ''}
              {areaCount >= 3 ? ` - A3: ${timeLimit3 || '___'}` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Entry Rows */}
      <div className="scoresheet-entries">
        {sortedEntries.map(entry => (
          <div key={entry.id} className="scoresheet-entry-row">
            {/* Dog Info */}
            <div className="entry-info">
              <div className="entry-armband">{entry.armband}</div>
              <div className="entry-details">
                <div className="entry-callname">{entry.callName}</div>
                <div className="entry-reg">{entry.registrationNumber ?? ''}</div>
                <div className="entry-breed">{entry.breed}</div>
                <div className="entry-handler">{entry.handler}</div>
              </div>
            </div>

            {/* Results */}
            <div className="entry-results">
              <div className="results-row">
                <div className="result-item"><div className="checkbox-square" /><span>Q</span></div>
                <div className="result-item"><div className="checkbox-square" /><span>Absent</span></div>
              </div>
              <div className="scoring-fields">
                <div className="field-row"><span className="field-label">Handler Error:</span><span className="field-line" /></div>
                <div className="field-row"><span className="field-label">Safety Concern:</span><span className="field-line" /></div>
                <div className="field-row"><span className="field-label">Mild Disruption:</span><span className="field-line" /></div>
              </div>
            </div>

            {/* Reasons */}
            <div className="entry-reasons">
              <div className="reasons-group">
                <span className="reasons-label">NQ:</span>
                <div className="reasons-list">
                  {['Incorrect Call', 'Max Time', 'Point to Hide', 'Harsh Correction', 'Significant Disruption'].map(reason => (
                    <div key={reason} className="reason-item"><div className="checkbox-square" /><span>{reason}</span></div>
                  ))}
                </div>
              </div>
              <div className="reasons-group">
                <span className="reasons-label">EX:</span>
                <div className="reasons-list">
                  {['Eliminated in Area', 'Handler Request', 'Out of Control', 'Overly Stressed', 'Other'].map(reason => (
                    <div key={reason} className="reason-item"><div className="checkbox-square" /><span>{reason}</span></div>
                  ))}
                </div>
              </div>
            </div>

            {/* Time Entry */}
            <div className={`entry-time ${areaCount > 1 ? 'multi-area' : ''}`}>
              {areaCount === 1 ? (
                <>
                  <div className="time-box"><span className="time-label">MM</span></div>
                  <div className="time-box"><span className="time-label">SS</span></div>
                  <div className="time-box"><span className="time-label">TT</span></div>
                </>
              ) : (
                <>
                  {Array.from({ length: areaCount }, (_, i) => (
                    <div key={i} className="time-row">
                      <span className="area-label">A{i + 1}</span>
                      <div className="time-box-sm"><span className="time-label">MM</span></div>
                      <div className="time-box-sm"><span className="time-label">SS</span></div>
                      <div className="time-box-sm"><span className="time-label">TT</span></div>
                    </div>
                  ))}
                  <div className="time-row time-row-total">
                    <span className="area-label">Tot</span>
                    <div className="time-box-sm"><span className="time-label">MM</span></div>
                    <div className="time-box-sm"><span className="time-label">SS</span></div>
                    <div className="time-box-sm"><span className="time-label">TT</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/ScoresheetReport.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/ScoresheetReport.tsx apps/myk9show/src/components/reports/__tests__/ScoresheetReport.test.tsx
git commit -m "feat(reports): implement ScoresheetReport component

Ported from myK9Q with myK9Show branding. Single and multi-area
time entry, NQ/Excused reasons, class requirements."
```

---

## Task 7: Report Data Hook

**Files:**

- Create: `src/hooks/queries/useReportData.ts`
- Modify: `src/lib/queryClient.ts`
- Test: `src/hooks/queries/__tests__/useReportData.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// src/hooks/queries/__tests__/useReportData.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useReportData } from '../useReportData';

// Mock the query functions
vi.mock('@/services/database/queries/showQueries', () => ({
  getShowById: vi.fn().mockResolvedValue({
    data: { id: 'show-1', name: 'Spring Trial', organization: 'AKC' },
    error: null,
  }),
}));

vi.mock('@/services/database/queries/trialQueries', () => ({
  getTrialsByShow: vi.fn().mockResolvedValue({
    data: [{ id: 'trial-1', trial_number: 1, date: '2026-04-12', show_id: 'show-1' }],
    error: null,
  }),
}));

vi.mock('@/services/database/queries/classQueries', () => ({
  getClassesByTrialId: vi.fn().mockResolvedValue({
    data: [{ id: 'class-1', trial_id: 'trial-1', element: 'Buried', level: 'Novice', section: '' }],
    error: null,
  }),
}));

vi.mock('@/services/database/queries/entryQueries', () => ({
  getEntriesByClass: vi.fn().mockResolvedValue({
    data: [{ id: 'entry-1', armband: 101, class_id: 'class-1', is_scored: false }],
    error: null,
  }),
  getEntriesByShow: vi.fn().mockResolvedValue({
    data: [{ id: 'entry-1', armband: 101, class_id: 'class-1', is_scored: false }],
    error: null,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useReportData', () => {
  it('returns null data when showId is empty', () => {
    const { result } = renderHook(
      () =>
        useReportData({ showId: '', trialId: 'all', classId: 'all', reportType: 'check-in-sheet' }),
      { wrapper: createWrapper() }
    );
    expect(result.current.show).toBeUndefined();
  });

  it('fetches show data when showId is provided', async () => {
    const { result } = renderHook(
      () =>
        useReportData({
          showId: 'show-1',
          trialId: 'all',
          classId: 'all',
          reportType: 'check-in-sheet',
        }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => {
      expect(result.current.show).toBeDefined();
    });
    expect(result.current.show?.name).toBe('Spring Trial');
  });

  it('fetches trials when showId is provided', async () => {
    const { result } = renderHook(
      () =>
        useReportData({
          showId: 'show-1',
          trialId: 'all',
          classId: 'all',
          reportType: 'check-in-sheet',
        }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => {
      expect(result.current.trials).toBeDefined();
      expect(result.current.trials?.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useReportData.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Add query key to queryClient.ts**

Add to `queryKeys` in `src/lib/queryClient.ts`:

```typescript
  // Reports
  reportData: (showId: string, trialId: string, classId: string) =>
    ['reports', showId, trialId, classId] as const,
```

- [ ] **Step 4: Create the useReportData hook**

```typescript
// src/hooks/queries/useReportData.ts
import { useQuery } from '@tanstack/react-query';
import { getShowById } from '@/services/database/queries/showQueries';
import { getTrialsByShow } from '@/services/database/queries/trialQueries';
import { getClassesByTrialId } from '@/services/database/queries/classQueries';
import { getEntriesByClass, getEntriesByShow } from '@/services/database/queries/entryQueries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

interface UseReportDataOptions {
  showId: string;
  trialId: string | 'all';
  classId: string | 'all';
  reportType: string;
}

export function useReportData({ showId, trialId, classId }: UseReportDataOptions) {
  const showQuery = useQuery({
    queryKey: queryKeys.show(showId),
    queryFn: async () => {
      const { data, error } = await getShowById(showId);
      if (error) throw error;
      return data;
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });

  const trialsQuery = useQuery({
    queryKey: queryKeys.showTrials(showId),
    queryFn: async () => {
      const { data, error } = await getTrialsByShow(showId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });

  const classesQuery = useQuery({
    queryKey: [...queryKeys.showClasses(showId), trialId],
    queryFn: async () => {
      if (trialId === 'all') {
        // Fetch classes for all trials
        const trials = trialsQuery.data ?? [];
        const allClasses = await Promise.all(
          trials.map(async t => {
            const { data } = await getClassesByTrialId(t.id);
            return data ?? [];
          })
        );
        return allClasses.flat();
      }
      const { data, error } = await getClassesByTrialId(trialId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId && trialsQuery.isSuccess,
    ...cacheStrategies.moderate,
  });

  const entriesQuery = useQuery({
    queryKey: queryKeys.reportData(showId, trialId, classId),
    queryFn: async () => {
      if (classId !== 'all') {
        const { data, error } = await getEntriesByClass(classId);
        if (error) throw error;
        return data ?? [];
      }
      // Fetch all entries for the show and filter client-side
      const { data, error } = await getEntriesByShow(showId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId && classesQuery.isSuccess,
    ...cacheStrategies.moderate,
  });

  const isLoading =
    showQuery.isLoading ||
    trialsQuery.isLoading ||
    classesQuery.isLoading ||
    entriesQuery.isLoading;
  const isError =
    showQuery.isError || trialsQuery.isError || classesQuery.isError || entriesQuery.isError;

  return {
    show: showQuery.data,
    trials: trialsQuery.data,
    classes: classesQuery.data,
    entries: entriesQuery.data,
    isLoading,
    isError,
    refetch: () => {
      showQuery.refetch();
      trialsQuery.refetch();
      classesQuery.refetch();
      entriesQuery.refetch();
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useReportData.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useReportData.ts apps/myk9show/src/hooks/queries/__tests__/useReportData.test.ts apps/myk9show/src/lib/queryClient.ts
git commit -m "feat(reports): add useReportData hook

Fetches show, trials, classes, and entries for report generation.
Supports batch mode (all trials/classes)."
```

---

## Task 8: Report Controls Bar

**Files:**

- Create: `src/pages/secretary/ReportsPage/ReportControlsBar.tsx`
- Test: `src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx`

- [ ] **Step 1: Write the tests**

```typescript
// src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ReportControlsBar } from '../ReportControlsBar';

const mockTrials = [
  { id: 'trial-1', trial_number: 1, date: '2026-04-12' },
  { id: 'trial-2', trial_number: 2, date: '2026-04-12' },
];

const mockClasses = [
  { id: 'class-1', element: 'Buried', level: 'Novice', section: '', trial_id: 'trial-1' },
  { id: 'class-2', element: 'Interior', level: 'Advanced', section: '', trial_id: 'trial-1' },
];

const baseProps = {
  reportType: 'check-in-sheet',
  trialId: 'all' as const,
  classId: 'all' as const,
  sortOrder: 'run-order',
  trials: mockTrials,
  classes: mockClasses,
  onReportTypeChange: vi.fn(),
  onTrialChange: vi.fn(),
  onClassChange: vi.fn(),
  onSortChange: vi.fn(),
  onPrint: vi.fn(),
};

describe('ReportControlsBar', () => {
  it('renders all four dropdowns and Print button', () => {
    render(<ReportControlsBar {...baseProps} />);
    expect(screen.getByText('Print')).toBeInTheDocument();
  });

  it('shows enabled report types in the report dropdown', () => {
    render(<ReportControlsBar {...baseProps} />);
    expect(screen.getByText('Check-in Sheet')).toBeInTheDocument();
  });

  it('shows "All Trials" option', () => {
    render(<ReportControlsBar {...baseProps} />);
    expect(screen.getByText('All Trials')).toBeInTheDocument();
  });

  it('shows "All Classes" option', () => {
    render(<ReportControlsBar {...baseProps} />);
    expect(screen.getByText('All Classes')).toBeInTheDocument();
  });

  it('disables class dropdown when trialId is all', () => {
    render(<ReportControlsBar {...baseProps} trialId="all" />);
    // Class dropdown should show "All Classes" and be disabled
    const classSelect = screen.getByText('All Classes').closest('button');
    expect(classSelect).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ReportControlsBar**

```typescript
// src/pages/secretary/ReportsPage/ReportControlsBar.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { reportRegistry, getReportById } from '@/lib/reports/reportRegistry';

interface ReportControlsBarProps {
  reportType: string;
  trialId: string;
  classId: string;
  sortOrder: string;
  trials: Array<{ id: string; trial_number: number; date: string }>;
  classes: Array<{ id: string; element: string; level: string; section: string; trial_id: string }>;
  onReportTypeChange: (value: string) => void;
  onTrialChange: (value: string) => void;
  onClassChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPrint: () => void;
}

export const ReportControlsBar: React.FC<ReportControlsBarProps> = ({
  reportType,
  trialId,
  classId,
  sortOrder,
  trials,
  classes,
  onReportTypeChange,
  onTrialChange,
  onClassChange,
  onSortChange,
  onPrint,
}) => {
  const report = getReportById(reportType);
  const hasTrialScope = report?.scopes.includes('trial') || report?.scopes.includes('class');
  const hasClassScope = report?.scopes.includes('class');
  const classDisabled = !hasClassScope || trialId === 'all';

  const filteredClasses =
    trialId === 'all' ? classes : classes.filter(c => c.trial_id === trialId);

  const operationalReports = reportRegistry.filter(r => r.category === 'operational');
  const organizationReports = reportRegistry.filter(r => r.category === 'organization');

  return (
    <div className="flex items-end gap-3 flex-wrap border-b px-4 py-3">
      {/* Report Type */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground uppercase font-semibold">Report</label>
        <Select value={reportType} onValueChange={onReportTypeChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Operational</SelectLabel>
              {operationalReports.map(r => (
                <SelectItem key={r.id} value={r.id} disabled={!r.enabled}>
                  {r.name}{!r.enabled ? ' (Coming Soon)' : ''}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Organization</SelectLabel>
              {organizationReports.map(r => (
                <SelectItem key={r.id} value={r.id} disabled={!r.enabled}>
                  {r.name}{!r.enabled ? ' (Coming Soon)' : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Trial */}
      {hasTrialScope && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground uppercase font-semibold">Trial</label>
          <Select value={trialId} onValueChange={onTrialChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trials</SelectItem>
              {trials.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  Trial {t.trial_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Class */}
      {hasClassScope && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground uppercase font-semibold">Class</label>
          <Select value={classId} onValueChange={onClassChange} disabled={classDisabled}>
            <SelectTrigger className="w-[180px]">
              <SelectValue>{classDisabled ? 'All Classes' : undefined}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {filteredClasses.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.element} {c.level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sort */}
      {report && report.sortOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground uppercase font-semibold">Sort by</label>
          <Select value={sortOrder} onValueChange={onSortChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {report.sortOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Print */}
      <div className="ml-auto">
        <Button onClick={onPrint}>Print</Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx apps/myk9show/src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx
git commit -m "feat(reports): add ReportControlsBar with cascading dropdowns

4 dropdowns (report type, trial, class, sort) + Print button.
Scope options dynamic per report type. Class disables for All Trials."
```

---

## Task 9: Report Preview Component

**Files:**

- Create: `src/pages/secretary/ReportsPage/ReportPreview.tsx`

- [ ] **Step 1: Implement ReportPreview**

```typescript
// src/pages/secretary/ReportsPage/ReportPreview.tsx
import React, { useRef, useEffect } from 'react';
import ReactDOMServer from 'react-dom/server';
import { renderReportToHtml } from '@/lib/reports/reportRenderer';
import { getReportById } from '@/lib/reports/reportRegistry';
import { mapDbEntryToReportEntry } from '@/lib/reports/reportUtils';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';
import type { DbShow, DbTrial, DbClass, DbEntry } from '@/types/database-mappings';

interface ReportPreviewProps {
  reportType: string;
  show: DbShow | null | undefined;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
  trialId: string;
  classId: string;
  sortOrder: string;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Build the list of (trial, class, entries) pages to render.
 * Handles batch mode ("all" trials/classes) by iterating children.
 */
function buildPages(
  trialId: string,
  classId: string,
  trials: DbTrial[],
  classes: DbClass[],
  entries: DbEntry[],
): Array<{ trial: DbTrial; classData: DbClass; entries: DbEntry[] }> {
  const pages: Array<{ trial: DbTrial; classData: DbClass; entries: DbEntry[] }> = [];

  const selectedTrials = trialId === 'all' ? trials : trials.filter(t => t.id === trialId);

  for (const trial of selectedTrials) {
    const trialClasses =
      classId === 'all'
        ? classes.filter(c => c.trial_id === trial.id)
        : classes.filter(c => c.id === classId && c.trial_id === trial.id);

    for (const cls of trialClasses) {
      const classEntries = entries.filter(e => e.class_id === cls.id);
      pages.push({ trial, classData: cls, entries: classEntries });
    }
  }

  return pages;
}

/**
 * [EXPANDED] Map DbEntry[] to ReportEntry[].
 * getEntriesByClass joins: entry.dog (call_name, breed, owner(first_name, last_name))
 * getEntriesByShow joins the same structure.
 * Access nested Supabase join data safely with fallbacks.
 */
function mapEntries(dbEntries: DbEntry[]): ReportEntry[] {
  return dbEntries.map(e => {
    // Supabase PostgREST joins: entry.dog.call_name, entry.dog.breed, entry.dog.owner.first_name
    const entry = e as Record<string, unknown>;
    const dog = entry.dog as Record<string, unknown> | null;
    const owner = dog?.owner as Record<string, unknown> | null;
    const handlerName = owner
      ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim()
      : '';
    return mapDbEntryToReportEntry(
      e,
      (dog?.call_name as string) ?? `Dog ${e.armband ?? '?'}`,
      (dog?.breed as string) ?? '',
      handlerName,
      null, // registration_number not in current join — acceptable for Phase 1
    );
  });
}

export const ReportPreview: React.FC<ReportPreviewProps> = ({
  reportType,
  show,
  trials,
  classes,
  entries,
  trialId,
  classId,
  sortOrder,
  isLoading,
  isError,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !show || !trials?.length || !classes?.length || !entries) return;

    const report = getReportById(reportType);
    if (!report || !report.enabled) return;

    const Component = report.component;
    const pages = buildPages(trialId, classId, trials, classes, entries);

    const pagesHtml = pages
      .map(({ trial, classData, entries: pageEntries }) => {
        const props: ReportProps = {
          showName: show.name ?? '',
          trial: {
            date: trial.date ?? '',
            trialNumber: String(trial.trial_number ?? ''),
            // [EXPANDED] Judge name: query judge_assignments table joined with people
            // for the class. For Phase 1, falls back to 'TBD' if not available.
            // Fast follow: add judge name fetching to useReportData hook via
            // supabase.from('judge_assignments').select('*, people(*)').eq('class_id', classData.id)
            judgeName: (classData as Record<string, unknown>).judge_name as string ?? 'TBD',
          },
          classData: {
            element: classData.element ?? '',
            level: classData.level ?? '',
            section: classData.section ?? '',
            timeLimitSeconds: classData.time_limit_seconds,
            areaCount: classData.num_areas,
            hidesText: classData.num_hides ? String(classData.num_hides) : null,
            distractionsText: classData.distraction_count ? String(classData.distraction_count) : null,
          },
          entries: mapEntries(pageEntries),
          sortOrder,
          organization: show.organization ?? undefined,
        };

        return ReactDOMServer.renderToStaticMarkup(
          React.createElement(Component, props),
        );
      })
      .join('');

    const html = renderReportToHtml(pagesHtml);
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      // [ADDED] Auto-resize iframe to fit content (batch reports may exceed one page)
      setTimeout(() => {
        if (iframe.contentDocument?.body) {
          iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
        }
      }, 100);
    }
  }, [reportType, show, trials, classes, entries, trialId, classId, sortOrder]);

  if (isLoading) {
    return (
      <div className="flex-1 bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">Loading report data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 bg-muted flex items-center justify-center">
        <p className="text-destructive">Failed to load report data. Please try again.</p>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="flex-1 bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">Select a show to generate reports</p>
      </div>
    );
  }

  // [ADDED] Empty entries state per spec
  if (entries && entries.length === 0 && !isLoading) {
    return (
      <div className="flex-1 bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">No entries found for this selection</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-muted p-6 flex justify-center overflow-auto">
      <iframe
        ref={iframeRef}
        title="Report Preview"
        className="bg-white shadow-lg rounded-sm"
        style={{ width: '8.5in', minHeight: '11in', border: 'none' }}
      />
    </div>
  );
};

/** Trigger print on the iframe contents */
export function printIframe(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  iframeRef.current?.contentWindow?.print();
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx
git commit -m "feat(reports): add ReportPreview with iframe rendering

Renders report components to static HTML in an isolated iframe.
Supports batch mode with page breaks. Print via iframe.contentWindow.print()."
```

---

## Task 10: Reports Page, Route, and Sidebar

**Files:**

- Create: `src/pages/secretary/ReportsPage/index.tsx`
- Modify: `src/routes/secretaryRoutes.tsx`
- Modify: `src/components/layout/sidebar/unifiedSidebarConfig.ts`
- Test: `src/pages/secretary/ReportsPage/__tests__/ReportsPage.test.tsx`

- [ ] **Step 1: Write the page tests**

```typescript
// src/pages/secretary/ReportsPage/__tests__/ReportsPage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import ReportsPage from '../index';

// Mock the hooks
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: 'show-1',
    shows: [{ id: 'show-1', name: 'Spring Scent Trial 2026' }],
    selectShow: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1', name: 'Spring Scent Trial 2026' },
    trials: [{ id: 'trial-1', trial_number: 1, date: '2026-04-12' }],
    classes: [{ id: 'class-1', element: 'Buried', level: 'Novice', section: '', trial_id: 'trial-1' }],
    entries: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

describe('ReportsPage', () => {
  it('renders the page title', () => {
    render(<ReportsPage />);
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders the controls bar', () => {
    render(<ReportsPage />);
    expect(screen.getByText('Print')).toBeInTheDocument();
  });

  it('renders the show name', () => {
    render(<ReportsPage />);
    expect(screen.getByText('Spring Scent Trial 2026')).toBeInTheDocument();
  });

  it('renders the default report type', () => {
    render(<ReportsPage />);
    expect(screen.getByText('Check-in Sheet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ReportsPage/__tests__/ReportsPage.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ReportsPage**

```typescript
// src/pages/secretary/ReportsPage/index.tsx
import React, { useState, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useShowStore } from '@/store/showStore';
import { useReportData } from '@/hooks/queries/useReportData';
import { getReportById } from '@/lib/reports/reportRegistry';
import { ReportControlsBar } from './ReportControlsBar';
import { ReportPreview, printIframe } from './ReportPreview';

export default function ReportsPage() {
  const { selectedShowId, shows, selectShow } = useShowStore();

  const [reportType, setReportType] = useState('check-in-sheet');
  const [trialId, setTrialId] = useState<string>('all');
  const [classId, setClassId] = useState<string>('all');

  const report = getReportById(reportType);
  const [sortOrder, setSortOrder] = useState(report?.defaultSort ?? 'run-order');

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { show, trials, classes, entries, isLoading, isError } = useReportData({
    showId: selectedShowId,
    trialId,
    classId,
    reportType,
  });

  const selectedShow = shows.find(s => s.id === selectedShowId);

  function handleReportTypeChange(value: string) {
    setReportType(value);
    const newReport = getReportById(value);
    setSortOrder(newReport?.defaultSort ?? '');
    // Reset scope when report type changes
    setTrialId('all');
    setClassId('all');
  }

  function handleTrialChange(value: string) {
    setTrialId(value);
    if (value === 'all') {
      setClassId('all');
    }
  }

  function handleShowChange(value: string) {
    selectShow(value);
    setTrialId('all');
    setClassId('all');
  }

  return (
    <div className="container mx-auto py-6 flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4 px-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          {selectedShow && (
            <p className="text-sm text-muted-foreground">{selectedShow.name}</p>
          )}
        </div>
        <Select value={selectedShowId} onValueChange={handleShowChange}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select a show" />
          </SelectTrigger>
          <SelectContent>
            {shows.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Controls Bar */}
      <ReportControlsBar
        reportType={reportType}
        trialId={trialId}
        classId={classId}
        sortOrder={sortOrder}
        trials={(trials ?? []).map(t => ({
          id: t.id,
          trial_number: t.trial_number ?? 0,
          date: t.date ?? '',
        }))}
        classes={(classes ?? []).map(c => ({
          id: c.id,
          element: c.element ?? '',
          level: c.level ?? '',
          section: c.section ?? '',
          trial_id: c.trial_id ?? '',
        }))}
        onReportTypeChange={handleReportTypeChange}
        onTrialChange={handleTrialChange}
        onClassChange={setClassId}
        onSortChange={setSortOrder}
        onPrint={() => printIframe(iframeRef)}
      />

      {/* Preview */}
      <ReportPreview
        reportType={reportType}
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        trialId={trialId}
        classId={classId}
        sortOrder={sortOrder}
        isLoading={isLoading}
        isError={isError}
      />
    </div>
  );
}
```

- [ ] **Step 4: Add route to secretaryRoutes.tsx**

Add after the existing lazy imports at the top of `src/routes/secretaryRoutes.tsx`:

```typescript
const ReportsPage = lazy(() => import('@/pages/secretary/ReportsPage'));
```

Add this route block inside `SecretaryRoutes`, after the `/secretary/results-control` route:

```typescript
    <Route
      path="/secretary/reports"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ReportsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
```

- [ ] **Step 5: Add sidebar entry to unifiedSidebarConfig.ts**

Add to the "Manage" section items array in `src/components/layout/sidebar/unifiedSidebarConfig.ts`, after the "Messages" entry. First, add `FileBarChart` to the lucide-react imports:

```typescript
import { ..., FileBarChart } from 'lucide-react';
```

Then add the nav item:

```typescript
        {
          title: 'Reports',
          href: '/secretary/reports',
          icon: FileBarChart,
          description: 'Generate and print reports',
        },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ReportsPage/__tests__/ReportsPage.test.tsx`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: No regressions. All existing tests still pass.

- [ ] **Step 8: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: Clean

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ReportsPage/index.tsx apps/myk9show/src/pages/secretary/ReportsPage/__tests__/ReportsPage.test.tsx apps/myk9show/src/routes/secretaryRoutes.tsx apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts
git commit -m "feat(reports): add ReportsPage with route and sidebar entry

Dedicated /secretary/reports page with show selector, controls bar,
and iframe preview. Added to Manage sidebar section."
```

---

## Task 11: Final Integration Verification

- [ ] **Step 1: Run full myK9Show test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass, including all new report tests.

- [ ] **Step 2: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 3: Run lint across monorepo**

Run: `pnpm lint`
Expected: Clean

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: Successful build

- [ ] **Step 5: Manual smoke test**

Run: `pnpm dev:show`

1. Log in as secretary
2. Navigate to Reports in sidebar
3. Verify show selector works
4. Select "Check-in Sheet" — verify preview renders
5. Change trial/class — verify cascading works
6. Change sort order — verify preview updates
7. Click Print — verify browser print dialog opens
8. Select "Score Sheet" — verify scoresheet renders
9. Select "Results Sheet" — verify results render
10. Verify Phase 2 report types show "(Coming Soon)" and are disabled

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(reports): address integration issues from smoke test"
```
