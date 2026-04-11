# Report Generation Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6 original Phase 2 reports (Show Catalog, Result Catalog, Judge's Schedule, Trial Secretary Report, Judge's Certification, Trial Chairman Report) plus 10 additional reports (Show/Trial/Breed/Judge Entry Counts, Financial Report with Accepted+Waitlist variants, Waitlist Report, Steward Report, Result Labels, AKC Judge's Report, Trial Secretary Certification) in myK9Show — total 16 report components, bringing parity with the Access `mySWT` production app.

**Architecture:** Each report is a React component receiving `ReportProps`, rendered via `renderToStaticMarkup` into the iframe preview. Catalog and schedule reports (show-scoped) need a new rendering mode that passes all trials/classes/entries in one call. AKC organizational forms (Trial Secretary, Judge's Cert, Trial Chairman) need a trial-level rendering mode (one call per trial, not per class). `ReportPreview` is updated to support these modes using a `getReportRenderingMode` helper.

**Tech Stack:** React, TypeScript, ReactDOMServer.renderToStaticMarkup, Vitest

**Reference screenshots:** `docs/mySWT/show_catalog.png`, `docs/mySWT/result_catalog.png`, `docs/mySWT/judging_schedule.png`, `docs/mySWT/akc_trial_secretary_report.png`, `docs/mySWT/akc_judge_certification.png`, `docs/mySWT/akc_trial_chair.png`

---

## File Structure

**New files:**

- `apps/myk9show/src/components/reports/ShowCatalog.tsx`
- `apps/myk9show/src/components/reports/ResultCatalog.tsx`
- `apps/myk9show/src/components/reports/JudgesSchedule.tsx`
- `apps/myk9show/src/components/reports/TrialSecretaryReport.tsx`
- `apps/myk9show/src/components/reports/JudgesCertification.tsx`
- `apps/myk9show/src/components/reports/TrialChairmanReport.tsx`
- `apps/myk9show/src/components/reports/__tests__/ShowCatalog.test.tsx`
- `apps/myk9show/src/components/reports/__tests__/ResultCatalog.test.tsx`
- `apps/myk9show/src/components/reports/__tests__/JudgesSchedule.test.tsx`
- `apps/myk9show/src/components/reports/__tests__/TrialSecretaryReport.test.tsx`
- `apps/myk9show/src/components/reports/__tests__/JudgesCertification.test.tsx`
- `apps/myk9show/src/components/reports/__tests__/TrialChairmanReport.test.tsx`

**Modified files:**

- `apps/myk9show/src/lib/reports/types.ts` — extend `ReportEntry` with class/trial metadata; extend `ReportProps` with `allTrials` and `allClasses`
- `apps/myk9show/src/lib/reports/reportUtils.ts` — [ADDED] add `sortByHandler` and `sortByBreed` utilities
- `apps/myk9show/src/lib/reports/reportStyles.ts` — add CSS classes for form and catalog layouts
- `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx` — replace `isShowScoped` branch with `getReportRenderingMode` supporting show/trial/class modes
- `apps/myk9show/src/lib/reports/reportRegistry.ts` — enable Phase 2 reports, assign components, add sort options

---

## Task 1: Extend types, CSS, and ReportPreview rendering modes

**Files:**

- Modify: `apps/myk9show/src/lib/reports/types.ts`
- Modify: `apps/myk9show/src/lib/reports/reportStyles.ts`
- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx`

This infrastructure is required before any Phase 2 component can be built or tested.

- [ ] **Step 1: Extend `ReportEntry` in `types.ts`**

Add optional fields to the existing `ReportEntry` interface (after `finalPlacement`):

```typescript
// Class/trial context — populated for show-level and trial-level catalog reports
classId?: string;
classElement?: string;
classLevel?: string;
classSection?: string;
trialId?: string;
trialNumber?: string;
trialDate?: string;
judgeName?: string;
```

- [ ] **Step 2: Extend `ReportProps` in `types.ts`**

Add optional arrays to the existing `ReportProps` interface (after `trialId`):

```typescript
// For show-scoped reports: all trials and classes in the show
allTrials?: Array<{
  id: string;
  date: string;
  trialNumber: string;
  judgeName?: string;
}>;
allClasses?: Array<{
  id: string;
  trialId: string;
  element: string;
  level: string;
  section?: string;
  judgeName?: string;
}>;
```

- [ ] **Step 3: [ADDED] Add `sortByHandler` and `sortByBreed` to `reportUtils.ts`**

Append to `apps/myk9show/src/lib/reports/reportUtils.ts`:

```typescript
export function sortByHandler(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => a.handler.localeCompare(b.handler));
}

export function sortByBreed(entries: ReportEntry[]): ReportEntry[] {
  return [...entries].sort((a, b) => a.breed.localeCompare(b.breed));
}
```

- [ ] **Step 4: Run typecheck to confirm additive changes are valid**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no errors (additive changes only).

- [ ] **Step 4b: Add CSS classes to `reportStyles.ts`**

Append to the `REPORT_STYLES` string constant:

```css
/* ─── Catalog layouts ─────────────────────────────────────────────────── */

.catalog-trial-section {
  margin-bottom: 24px;
}

.catalog-trial-header {
  font-size: 14px;
  font-weight: bold;
  border-bottom: 2px solid #14b8a6;
  margin-bottom: 8px;
  padding-bottom: 4px;
}

.catalog-class-section {
  margin-bottom: 20px;
}

.catalog-class-header {
  font-size: 13px;
  font-weight: bold;
  background: #f0fdfa;
  padding: 4px 8px;
  margin-bottom: 6px;
}

.catalog-class-summary {
  font-size: 10px;
  color: #555;
  text-align: right;
  margin-top: 4px;
}

.catalog-empty {
  color: #888;
  font-style: italic;
  font-size: 11px;
}

/* ─── AKC Form layouts ────────────────────────────────────────────────── */

.form-section {
  margin-bottom: 16px;
}

.form-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
}

.form-table td {
  padding: 4px 8px;
  vertical-align: top;
}

.form-label {
  font-weight: bold;
  white-space: nowrap;
  width: 180px;
  font-size: 11px;
}

.form-value {
  border-bottom: 1px solid #000;
  min-width: 160px;
  font-size: 11px;
}

.form-address {
  font-size: 10px;
  margin-top: 4px;
  font-style: italic;
}

.form-question {
  font-size: 11px;
  margin-bottom: 6px;
}

.form-checkbox-row {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 11px;
}

.form-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form-inline-label {
  font-size: 11px;
  margin-left: 8px;
}

.form-blank-lines {
  margin-top: 6px;
}

.form-blank-line {
  border-bottom: 1px solid #000;
  min-height: 20px;
  margin-bottom: 8px;
  font-size: 11px;
}

.form-field-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 8px;
}

.form-signature-section {
  margin-top: 32px;
  border-top: 1px solid #ccc;
  padding-top: 16px;
}

.signature-line {
  display: flex;
  gap: 16px;
  align-items: baseline;
  margin-bottom: 16px;
}

.signature-label {
  font-size: 11px;
  white-space: nowrap;
  min-width: 160px;
}

.signature-blank {
  border-bottom: 1px solid #000;
  flex: 1;
  min-height: 18px;
  display: block;
}

.total-row td {
  border-top: 2px solid #000;
}
```

- [ ] **Step 5: Update `ReportPreview.tsx` — add `getReportRenderingMode` and updated `mapEntries`**

In `ReportPreview.tsx`, add these helpers before the `ReportPreview` function:

```typescript
type RenderingMode = 'show' | 'trial' | 'class';

/**
 * Determines how the report should be rendered:
 * - 'show': one render call with all trials/classes/entries (Show Catalog, Result Catalog, Judge's Schedule)
 * - 'trial': one render call per trial with that trial's combined entries (Trial Secretary, Judge's Cert, Trial Chairman)
 * - 'class': existing behavior — one render call per class (Check-in Sheet, Scoresheet, Results Sheet)
 */
function getReportRenderingMode(report: ReportDefinition, trialId: string): RenderingMode {
  if (report.scopes.includes('show')) return 'show';
  if (report.scopes.includes('trial') && !report.scopes.includes('class')) return 'trial';
  return 'class';
}
```

Update `mapEntries` to accept optional trial and class context:

```typescript
function mapEntries(dbEntries: DbEntry[], trial?: DbTrial, classData?: DbClass): ReportEntry[] {
  return dbEntries.map(e => {
    const entry = e as Record<string, unknown>;
    const dog = entry.dog as Record<string, unknown> | null;
    const owner = dog?.owner as Record<string, unknown> | null;
    const handlerName = owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : '';
    const armbandNum = e.armband != null ? Number(e.armband) : null;
    const base = mapDbEntryToReportEntry(
      {
        id: e.id,
        armband: armbandNum,
        run_order: e.run_order,
        check_in_status: e.check_in_status,
        section: null,
        is_scored: e.is_scored,
        result_status: e.result_status,
        search_time_seconds: e.search_time_seconds,
        total_faults: e.total_faults,
        final_placement: e.final_placement,
      },
      (dog?.call_name as string) ?? `Dog ${e.armband ?? '?'}`,
      (dog?.breed as string) ?? '',
      handlerName,
      null
    );
    return {
      ...base,
      ...(trial
        ? {
            trialId: trial.id,
            trialNumber: String(trial.trial_number ?? ''),
            trialDate: trial.date ?? '',
          }
        : {}),
      ...(classData
        ? {
            classId: classData.id,
            classElement: classData.element ?? '',
            classLevel: classData.level ?? '',
            classSection: classData.section ?? '',
            judgeName: ((classData as Record<string, unknown>).judge_name as string) ?? undefined,
          }
        : {}),
    };
  });
}
```

- [ ] **Step 6: [EXPANDED] Update `ReportPreview.tsx` `useEffect` — replace `isShowScoped` branch with rendering-mode dispatch**

Replace the `if (showScoped) { ... } else { ... }` block in the `useEffect` with:

```typescript
const renderingMode = getReportRenderingMode(report, trialId);

if (renderingMode === 'show') {
  // [ADDED] Filter to selected trial when a specific trial is chosen
  const targetTrialIds =
    trialId === 'all'
      ? (trials ?? []).map(t => t.id)
      : [trialId];

  const filteredClasses = (classes ?? []).filter(c =>
    targetTrialIds.includes(c.trial_id ?? '')
  );
  const filteredClassIds = new Set(filteredClasses.map(c => c.id));

  // Build enriched entries with class and trial metadata attached to each entry
  const allEntriesEnriched = (entries ?? [])
    .filter(e => filteredClassIds.has(e.class_id ?? ''))
    .map(e => {
      const cls = filteredClasses.find(c => c.id === e.class_id);
      const trial = (trials ?? []).find(t => t.id === cls?.trial_id);
      return mapEntries([e], trial, cls)[0];
    });

  const allTrials = (trials ?? [])
    .filter(t => targetTrialIds.includes(t.id))
    .map(t => ({
      id: t.id,
      date: t.date ?? '',
      trialNumber: String(t.trial_number ?? ''),
      judgeName:
        ((t as Record<string, unknown>).judge_name as string) ?? undefined,
    }));

  const allClasses = filteredClasses.map(c => ({
    id: c.id,
    trialId: c.trial_id ?? '',
    element: c.element ?? '',
    level: c.level ?? '',
    section: c.section ?? '',
    judgeName:
      ((c as Record<string, unknown>).judge_name as string) ?? undefined,
  }));

  const showDates =
    show.startDate && show.endDate && show.startDate !== show.endDate
      ? `${show.startDate} – ${show.endDate}`
      : (show.startDate ?? undefined);

  const props: ReportProps = {
    showId: show.id,
    showName: show.name ?? '',
    entries: allEntriesEnriched,
    sortOrder,
    allTrials,
    allClasses,
    organization: show.organization ?? undefined,
    clubName: show.clubName ?? undefined,
    showDates,
    ...(dogId !== 'all' ? { dogId } : {}),
    ...(trialId !== 'all' ? { trialId } : {}),
  };
  const ReportComponent = report.component;
  combinedMarkup = ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
} else if (renderingMode === 'trial') {
  // One render call per trial — all that trial's entries combined
  const targetTrials =
    trialId === 'all'
      ? (trials ?? [])
      : (trials ?? []).filter(t => t.id === trialId);

  const allClasses = (classes ?? []).map(c => ({
    id: c.id,
    trialId: c.trial_id ?? '',
    element: c.element ?? '',
    level: c.level ?? '',
    section: c.section ?? '',
    judgeName:
      ((c as Record<string, unknown>).judge_name as string) ?? undefined,
  }));

  combinedMarkup = targetTrials
    .map(trial => {
      const trialClasses = (classes ?? []).filter(c => c.trial_id === trial.id);
      const trialEntries = (entries ?? []).filter(e =>
        trialClasses.some(c => c.id === e.class_id)
      );
      const enriched = trialEntries.map(e => {
        const cls = trialClasses.find(c => c.id === e.class_id);
        return mapEntries([e], trial, cls)[0];
      });
      const firstClassJudge =
        ((trialClasses[0] as Record<string, unknown> | undefined)
          ?.judge_name as string) ?? 'TBD';
      const props: ReportProps = {
        showId: show.id,
        showName: show.name ?? '',
        trial: {
          date: trial.date ?? '',
          trialNumber: String(trial.trial_number ?? ''),
          judgeName: firstClassJudge,
        },
        allClasses: allClasses.filter(c => c.trialId === trial.id),
        entries: enriched,
        sortOrder,
        organization: show.organization ?? undefined,
        clubName: show.clubName ?? undefined,
      };
      const ReportComponent = report.component;
      return ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
    })
    .join('');
} else {
  // Existing class-mode rendering (unchanged)
  const pages = buildPages(trialId, classId, trials, classes, entries);
  if (pages.length === 0) return;

  const ReportComponent = report.component;
  combinedMarkup = pages
    .map(({ trial, classData, entries: pageEntries }) => {
      const props: ReportProps = {
        showId: show.id,
        showName: show.name ?? '',
        trial: {
          date: trial.date ?? '',
          trialNumber: String(trial.trial_number ?? ''),
          judgeName:
            ((classData as Record<string, unknown>).judge_name as string) ?? 'TBD',
        },
        classData: {
          element: classData.element ?? '',
          level: classData.level ?? '',
          section: classData.section ?? '',
          timeLimitSeconds: classData.time_limit_seconds,
          areaCount: classData.num_areas,
          hidesText: classData.num_hides ? String(classData.num_hides) : null,
          distractionsText: classData.distraction_count
            ? String(classData.distraction_count)
            : null,
        },
        entries: mapEntries(pageEntries, trial, classData),
        sortOrder,
        organization: show.organization ?? undefined,
      };
      return ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
    })
    .join('');
}
```

- [ ] **Step 7: [EXPANDED] Update the `hasEntries` check at the bottom of `ReportPreview` to use `renderingMode`**

Find and replace the section near the bottom of `ReportPreview` that uses `isShowScoped`. The original code called `buildPages` for all non-show modes, but trial-scoped reports don't use class-level pagination — this caused blank previews for Trial Secretary, Judge's Cert, and Trial Chairman when `classId` was `'all'`.

```typescript
const report = getReportById(reportType);
const renderingMode = report ? getReportRenderingMode(report, trialId) : 'class';

// class-mode pages only — show-mode and trial-mode don't use buildPages
const pages =
  renderingMode === 'class' ? buildPages(trialId, classId, trials, classes, entries) : [];

const hasEntries =
  renderingMode === 'show'
    ? (entries ?? []).length > 0
    : renderingMode === 'trial'
      ? (entries ?? []).length > 0
      : pages.some(p => p.entries.length > 0);
```

- [ ] **Step 7b: [ADDED] Write tests for `getReportRenderingMode`**

Create `apps/myk9show/src/pages/secretary/ReportsPage/__tests__/renderingMode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Inline the function here since it's not exported — copy it from ReportPreview.tsx
// after implementing it in Step 5. If you export it for testability, import instead.
type RenderingMode = 'show' | 'trial' | 'class';
function getReportRenderingMode(
  report: { scopes: ('show' | 'trial' | 'class')[] },
  _trialId: string
): RenderingMode {
  if (report.scopes.includes('show')) return 'show';
  if (report.scopes.includes('trial') && !report.scopes.includes('class')) return 'trial';
  return 'class';
}

describe('getReportRenderingMode', () => {
  it('returns show for show-scoped reports', () => {
    expect(getReportRenderingMode({ scopes: ['show'] }, 'all')).toBe('show');
  });

  it('returns show for show+trial scoped reports (Show Catalog, Result Catalog)', () => {
    expect(getReportRenderingMode({ scopes: ['show', 'trial'] }, 'all')).toBe('show');
  });

  it('returns trial for trial-only reports (Trial Secretary, Judge Cert, Trial Chairman)', () => {
    expect(getReportRenderingMode({ scopes: ['trial'] }, 'all')).toBe('trial');
    expect(getReportRenderingMode({ scopes: ['trial'] }, 't1')).toBe('trial');
  });

  it('returns class for trial+class scoped reports (Check-in Sheet, Scoresheet, Results Sheet)', () => {
    expect(getReportRenderingMode({ scopes: ['trial', 'class'] }, 'all')).toBe('class');
    expect(getReportRenderingMode({ scopes: ['trial', 'class'] }, 't1')).toBe('class');
  });
});
```

> **Note:** Export `getReportRenderingMode` from `ReportPreview.tsx` for direct import, or copy the body into the test file. Either approach is acceptable.

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/ReportsPage/__tests__/renderingMode.test.ts`
Expected: all tests pass.

- [ ] **Step 8: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 9: Run existing report tests to confirm no regression**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/CheckInSheet.test.tsx src/components/reports/__tests__/ResultsSheet.test.tsx src/components/reports/__tests__/ScoresheetReport.test.tsx
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add apps/myk9show/src/lib/reports/types.ts apps/myk9show/src/lib/reports/reportStyles.ts apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx
git commit -m "feat(reports): extend types and add show/trial rendering modes for Phase 2"
```

---

## Task 2: Show Catalog

**Files:**

- Create: `apps/myk9show/src/components/reports/ShowCatalog.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/ShowCatalog.test.tsx`

Full-show or single-trial listing of all entries, organized by trial and sorted by armband within each trial. Each row shows: armband #, call name, breed, AKC reg #, class (element + level), handler. Reference: `docs/mySWT/show_catalog.png`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/reports/__tests__/ShowCatalog.test.tsx
import { render, screen } from '@testing-library/react';
import { ShowCatalog } from '../ShowCatalog';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'armband',
  entries: [
    {
      id: 'e1',
      armband: 108,
      runOrder: 2,
      callName: 'Max',
      breed: 'GSD',
      handler: 'Carlos Rivera',
      registrationNumber: 'DN99999999',
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      trialId: 't1',
      trialNumber: '1',
      trialDate: '2026-04-12',
      classElement: 'Container',
      classLevel: 'Novice',
      classId: 'c2',
    },
    {
      id: 'e2',
      armband: 101,
      runOrder: 1,
      callName: 'Buddy',
      breed: 'Golden Retriever',
      handler: 'Jane Mitchell',
      registrationNumber: 'DN12345678',
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      trialId: 't1',
      trialNumber: '1',
      trialDate: '2026-04-12',
      classElement: 'Buried',
      classLevel: 'Novice',
      classId: 'c1',
    },
  ],
  allTrials: [{ id: 't1', date: '2026-04-12', trialNumber: '1' }],
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Buried', level: 'Novice' },
    { id: 'c2', trialId: 't1', element: 'Container', level: 'Novice' },
  ],
};

describe('ShowCatalog', () => {
  it('renders report title', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText(/Show Catalog/i)).toBeInTheDocument();
  });

  it('renders show name', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText('Spring Scent Trial 2026')).toBeInTheDocument();
  });

  it('renders trial section header', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText(/Trial 1/i)).toBeInTheDocument();
  });

  it('sorts entries by armband number within trial', () => {
    render(<ShowCatalog {...baseProps} />);
    const rows = screen.getAllByRole('row');
    // First data row (after header) should be armband 101 (Buddy), not 108 (Max)
    expect(rows[1]).toHaveTextContent('101');
    expect(rows[1]).toHaveTextContent('Buddy');
  });

  it('shows class info for each entry', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText('Buried Novice')).toBeInTheDocument();
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
  });

  it('shows handler name', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText('Jane Mitchell')).toBeInTheDocument();
  });

  it('renders empty state when no entries', () => {
    render(<ShowCatalog {...baseProps} entries={[]} />);
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  // [ADDED] Sort option tests
  it('sorts by handler name when sortOrder=handler', () => {
    render(<ShowCatalog {...baseProps} sortOrder="handler" />);
    const rows = screen.getAllByRole('row');
    // Jane Mitchell (J) comes before Carlos Rivera (C)? No — C < J alphabetically.
    // Carlos Rivera should be first.
    expect(rows[1]).toHaveTextContent('Carlos Rivera');
  });

  it('sorts by breed when sortOrder=breed', () => {
    render(<ShowCatalog {...baseProps} sortOrder="breed" />);
    const rows = screen.getAllByRole('row');
    // GSD comes before Golden Retriever alphabetically
    expect(rows[1]).toHaveTextContent('GSD');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/ShowCatalog.test.tsx
```

Expected: `Cannot find module '../ShowCatalog'`

- [ ] **Step 3: [EXPANDED] Implement `ShowCatalog.tsx`**

```tsx
// src/components/reports/ShowCatalog.tsx
import React from 'react';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';
import {
  formatReportDate,
  sortByArmband,
  sortByHandler,
  sortByBreed,
} from '@/lib/reports/reportUtils';

export const ShowCatalog: React.FC<ReportProps> = ({
  showName,
  organization,
  showDates,
  clubName,
  allTrials = [],
  entries,
  sortOrder,
}) => {
  if (entries.length === 0) {
    return (
      <div className="report-page">
        <p className="catalog-empty">No entries found.</p>
      </div>
    );
  }

  // [ADDED] Apply sort before grouping so order is preserved within each trial section
  const sorted =
    sortOrder === 'handler'
      ? sortByHandler(entries)
      : sortOrder === 'breed'
        ? sortByBreed(entries)
        : sortByArmband(entries);

  // Group sorted entries by trialId (insertion order preserved)
  const entriesByTrial = new Map<string, ReportEntry[]>();
  for (const entry of sorted) {
    const key = entry.trialId ?? 'unknown';
    if (!entriesByTrial.has(key)) entriesByTrial.set(key, []);
    entriesByTrial.get(key)!.push(entry);
  }

  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle} Show Catalog</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
        {showDates && <p className="report-subtitle">{showDates}</p>}
        {clubName && <p className="report-subtitle">{clubName}</p>}
      </div>

      {allTrials.map(trial => {
        const trialEntries = entriesByTrial.get(trial.id) ?? [];
        return (
          <div key={trial.id} className="catalog-trial-section">
            <h2 className="catalog-trial-header">
              Trial {trial.trialNumber}
              {trial.date ? ` — ${formatReportDate(trial.date)}` : ''}
            </h2>
            {trialEntries.length === 0 ? (
              <p className="catalog-empty">No entries for this trial.</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Armband</th>
                    <th>Call Name</th>
                    <th>Breed</th>
                    <th>Reg #</th>
                    <th>Class</th>
                    <th>Handler</th>
                  </tr>
                </thead>
                <tbody>
                  {trialEntries.map(entry => (
                    <tr key={entry.id}>
                      <td>{entry.armband}</td>
                      <td>{entry.callName}</td>
                      <td>{entry.breed}</td>
                      <td>{entry.registrationNumber ?? ''}</td>
                      <td>{[entry.classElement, entry.classLevel].filter(Boolean).join(' ')}</td>
                      <td>{entry.handler}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      <div className="report-footer">
        <div className="footer-left">Total Entries: {entries.length}</div>
        <div className="footer-right">Generated by myK9Show</div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/ShowCatalog.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/ShowCatalog.tsx apps/myk9show/src/components/reports/__tests__/ShowCatalog.test.tsx
git commit -m "feat(reports): add Show Catalog report component"
```

---

## Task 3: Result Catalog

**Files:**

- Create: `apps/myk9show/src/components/reports/ResultCatalog.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/ResultCatalog.test.tsx`

Published results organized by class (element + level) with placement, name, breed, reg#, handler, Q/NQ status, and search time. Reference: `docs/mySWT/result_catalog.png`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/reports/__tests__/ResultCatalog.test.tsx
import { render, screen } from '@testing-library/react';
import { ResultCatalog } from '../ResultCatalog';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'placement',
  entries: [
    {
      id: 'e1',
      armband: 108,
      runOrder: 2,
      callName: 'Max',
      breed: 'GSD',
      handler: 'Carlos Rivera',
      registrationNumber: 'DN99999999',
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'NQ',
      searchTimeSeconds: 90,
      totalFaults: 2,
      finalPlacement: 9996,
      trialId: 't1',
      classId: 'c1',
      classElement: 'Buried',
      classLevel: 'Novice',
    },
    {
      id: 'e2',
      armband: 101,
      runOrder: 1,
      callName: 'Buddy',
      breed: 'Golden Retriever',
      handler: 'Jane Mitchell',
      registrationNumber: 'DN12345678',
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: 47.5,
      totalFaults: 0,
      finalPlacement: 1,
      trialId: 't1',
      classId: 'c1',
      classElement: 'Buried',
      classLevel: 'Novice',
    },
  ],
  allTrials: [{ id: 't1', date: '2026-04-12', trialNumber: '1' }],
  allClasses: [{ id: 'c1', trialId: 't1', element: 'Buried', level: 'Novice' }],
};

describe('ResultCatalog', () => {
  it('renders report title', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText(/Work Show Results/i)).toBeInTheDocument();
  });

  it('renders class section heading', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText(/Buried Novice/i)).toBeInTheDocument();
  });

  it('shows Q for qualified entry', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText('Qualified')).toBeInTheDocument();
  });

  it('shows NQ for non-qualifying entry', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText('NQ')).toBeInTheDocument();
  });

  it('lists qualified entries before NQ entries', () => {
    render(<ResultCatalog {...baseProps} />);
    const rows = screen.getAllByRole('row');
    // First data row (after header) should be the Q entry — Buddy (armband 101)
    expect(rows[1]).toHaveTextContent('Buddy');
  });

  it('renders empty state when no entries', () => {
    render(<ResultCatalog {...baseProps} entries={[]} />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  // [ADDED] Sort option tests
  it('sorts by armband when sortOrder=armband', () => {
    render(<ResultCatalog {...baseProps} sortOrder="armband" />);
    const rows = screen.getAllByRole('row');
    // armband 101 (Buddy, Q) should come before 108 (Max, NQ) when sorted by armband
    expect(rows[1]).toHaveTextContent('101');
  });

  it('sorts by handler when sortOrder=handler', () => {
    render(<ResultCatalog {...baseProps} sortOrder="handler" />);
    const rows = screen.getAllByRole('row');
    // Carlos Rivera (C) comes before Jane Mitchell (J)
    expect(rows[1]).toHaveTextContent('Carlos Rivera');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/ResultCatalog.test.tsx
```

Expected: `Cannot find module '../ResultCatalog'`

- [ ] **Step 3: [EXPANDED] Implement `ResultCatalog.tsx`**

```tsx
// src/components/reports/ResultCatalog.tsx
import React from 'react';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';
import {
  formatReportTime,
  sortByPlacement,
  sortByArmband,
  sortByHandler,
  getResultStatusText,
  isQualified,
  countQualified,
} from '@/lib/reports/reportUtils';

export const ResultCatalog: React.FC<ReportProps> = ({
  showName,
  organization,
  showDates,
  allClasses = [],
  entries,
  sortOrder,
}) => {
  if (entries.length === 0) {
    return (
      <div className="report-page">
        <p className="catalog-empty">No results found.</p>
      </div>
    );
  }

  // Group entries by classId; sort applied per-class below
  const entriesByClass = new Map<string, ReportEntry[]>();
  for (const entry of entries) {
    const key = entry.classId ?? 'unknown';
    if (!entriesByClass.has(key)) entriesByClass.set(key, []);
    entriesByClass.get(key)!.push(entry);
  }

  // [ADDED] Sort function per sortOrder
  function sortClassEntries(classEntries: ReportEntry[]): ReportEntry[] {
    if (sortOrder === 'armband') return sortByArmband(classEntries);
    if (sortOrder === 'handler') return sortByHandler(classEntries);
    return sortByPlacement(classEntries); // default: 'placement'
  }

  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle} Work Show Results</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
        {showDates && <p className="report-subtitle">{showDates}</p>}
      </div>

      {allClasses.map(cls => {
        const classEntries = sortClassEntries(entriesByClass.get(cls.id) ?? []);
        const className = `${cls.element} ${cls.level}`.trim();
        const qualifiedCount = countQualified(classEntries);

        return (
          <div key={cls.id} className="catalog-class-section">
            <h2 className="catalog-class-header">{className}</h2>
            {classEntries.length === 0 ? (
              <p className="catalog-empty">No results for this class.</p>
            ) : (
              <>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Place</th>
                      <th>Armband</th>
                      <th>Call Name</th>
                      <th>Breed</th>
                      <th>Reg #</th>
                      <th>Handler</th>
                      <th>Q</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classEntries.map(entry => {
                      const qualified = isQualified(entry);
                      const statusText = getResultStatusText(entry);
                      const placement =
                        entry.finalPlacement && entry.finalPlacement < 9000
                          ? entry.finalPlacement
                          : '';
                      return (
                        <tr key={entry.id}>
                          <td>{placement}</td>
                          <td>{entry.armband}</td>
                          <td>{entry.callName}</td>
                          <td>{entry.breed}</td>
                          <td>{entry.registrationNumber ?? ''}</td>
                          <td>{entry.handler}</td>
                          <td className={qualified ? 'qualified-text' : 'nq-text'}>{statusText}</td>
                          <td>{formatReportTime(entry.searchTimeSeconds)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="catalog-class-summary">
                  Entries: {classEntries.length} · Qualified: {qualifiedCount}
                </p>
              </>
            )}
          </div>
        );
      })}

      <div className="report-footer">
        <div className="footer-right">Generated by myK9Show</div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/ResultCatalog.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/ResultCatalog.tsx apps/myk9show/src/components/reports/__tests__/ResultCatalog.test.tsx
git commit -m "feat(reports): add Result Catalog report component"
```

---

## Task 4: Judge's Schedule

**Files:**

- Create: `apps/myk9show/src/components/reports/JudgesSchedule.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/JudgesSchedule.test.tsx`

Shows all trials with their classes, entry counts per class, and estimated judging time (45 seconds/entry). Reference: `docs/mySWT/judging_schedule.png`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/reports/__tests__/JudgesSchedule.test.tsx
import { render, screen } from '@testing-library/react';
import { JudgesSchedule } from '../JudgesSchedule';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'trial-date',
  entries: [
    {
      id: 'e1',
      armband: 101,
      runOrder: 1,
      callName: 'Buddy',
      breed: 'Lab',
      handler: 'Jane',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      trialId: 't1',
      classId: 'c1',
    },
    {
      id: 'e2',
      armband: 102,
      runOrder: 2,
      callName: 'Rex',
      breed: 'Beagle',
      handler: 'Bob',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      trialId: 't1',
      classId: 'c1',
    },
  ],
  allTrials: [{ id: 't1', date: '2026-04-12', trialNumber: '1' }],
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Buried', level: 'Novice', judgeName: 'Dr. Jane Smith' },
    { id: 'c2', trialId: 't1', element: 'Container', level: 'Novice', judgeName: 'Alice Brown' },
  ],
};

describe('JudgesSchedule', () => {
  it('renders report title', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText(/Judging Schedule/i)).toBeInTheDocument();
  });

  it('renders trial section with date', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText(/Trial 1/i)).toBeInTheDocument();
    expect(screen.getByText(/04\/12\/2026/)).toBeInTheDocument();
  });

  it('shows class with entry count', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText(/Buried Novice/i)).toBeInTheDocument();
    // 2 entries in c1
    const cells = screen.getAllByRole('cell');
    expect(cells.some(c => c.textContent === '2')).toBe(true);
  });

  it('shows estimated time — 2 entries × 45s = 1:30', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('shows judge name per class', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Alice Brown')).toBeInTheDocument();
  });

  it('sorts classes by judge name when sortOrder=judge-name', () => {
    render(<JudgesSchedule {...baseProps} sortOrder="judge-name" />);
    const rows = screen.getAllByRole('row');
    // Alice Brown (A) should appear before Dr. Jane Smith (D)
    // rows[0] = header, rows[1] = first class row
    expect(rows[1]).toHaveTextContent('Alice Brown');
    expect(rows[2]).toHaveTextContent('Dr. Jane Smith');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/JudgesSchedule.test.tsx
```

Expected: `Cannot find module '../JudgesSchedule'`

- [ ] **Step 3: Implement `JudgesSchedule.tsx`**

```tsx
// src/components/reports/JudgesSchedule.tsx
import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

const SECONDS_PER_ENTRY = 45;

function formatEstimatedTime(entryCount: number): string {
  const totalSeconds = entryCount * SECONDS_PER_ENTRY;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const JudgesSchedule: React.FC<ReportProps> = ({
  showName,
  organization,
  allTrials = [],
  allClasses = [],
  entries,
  sortOrder,
}) => {
  const entriesPerClass = new Map<string, number>();
  for (const entry of entries) {
    if (entry.classId) {
      entriesPerClass.set(entry.classId, (entriesPerClass.get(entry.classId) ?? 0) + 1);
    }
  }

  const orgTitle = organization ? `${organization} Scent Work` : 'Scent Work';

  // Each class has its own judge; sort classes within a trial by judge name or default order
  function sortClasses(classes: typeof allClasses): typeof allClasses {
    if (sortOrder === 'judge-name') {
      return [...classes].sort((a, b) => (a.judgeName ?? '').localeCompare(b.judgeName ?? ''));
    }
    return classes; // default: trial-date — classes in their natural DB order
  }

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">{orgTitle} Show Judging Schedule</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
      </div>

      {allTrials.map(trial => {
        const trialClasses = sortClasses(allClasses.filter(c => c.trialId === trial.id));
        return (
          <div key={trial.id} className="catalog-trial-section">
            <h2 className="catalog-trial-header">
              Trial {trial.trialNumber}
              {trial.date ? ` — ${formatReportDate(trial.date)}` : ''}
            </h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Judge</th>
                  <th>Entries</th>
                  <th>Est. Time</th>
                </tr>
              </thead>
              <tbody>
                {trialClasses.map(cls => {
                  const count = entriesPerClass.get(cls.id) ?? 0;
                  return (
                    <tr key={cls.id}>
                      <td>{`${cls.element} ${cls.level}`.trim()}</td>
                      <td>{cls.judgeName ?? ''}</td>
                      <td>{count}</td>
                      <td>{formatEstimatedTime(count)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="report-footer">
        <div className="footer-left">Est. time = {SECONDS_PER_ENTRY} sec/entry</div>
        <div className="footer-right">Generated by myK9Show</div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/JudgesSchedule.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/JudgesSchedule.tsx apps/myk9show/src/components/reports/__tests__/JudgesSchedule.test.tsx
git commit -m "feat(reports): add Judge's Schedule report component"
```

---

## Task 5: Trial Secretary Report

**Files:**

- Create: `apps/myk9show/src/components/reports/TrialSecretaryReport.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/TrialSecretaryReport.test.tsx`

AKC-required certification form for the trial secretary. Contains preprinted text, trial summary (count, fee calculation), yes/no questions about complaints, and a signature line. Reference: `docs/mySWT/akc_trial_secretary_report.png`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/reports/__tests__/TrialSecretaryReport.test.tsx
import { render, screen } from '@testing-library/react';
import { TrialSecretaryReport } from '../TrialSecretaryReport';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  clubName: 'Norwegian Elkhound Association of America',
  organization: 'AKC',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Jane Smith' },
  entries: Array.from({ length: 12 }, (_, i) => ({
    id: `e${i}`,
    armband: 100 + i,
    runOrder: i + 1,
    callName: `Dog ${i}`,
    breed: 'Breed',
    handler: 'Handler',
    registrationNumber: null,
    checkInStatus: null,
    section: null,
    isScored: true,
    resultText: 'Q',
    searchTimeSeconds: null,
    totalFaults: 0,
    finalPlacement: 1,
  })),
};

describe('TrialSecretaryReport', () => {
  it('renders report title', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/Report of Scent Work Trial/i)).toBeInTheDocument();
  });

  it('shows club name', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText('Norwegian Elkhound Association of America')).toBeInTheDocument();
  });

  it('shows trial date', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/04\/12\/2026/)).toBeInTheDocument();
  });

  it('shows entry count', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows judge name', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
  });

  it('includes AKC certification text', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/American Kennel Club/i)).toBeInTheDocument();
  });

  it('renders signature line', () => {
    render(<TrialSecretaryReport {...baseProps} />);
    expect(screen.getByText(/Signature/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/TrialSecretaryReport.test.tsx
```

Expected: `Cannot find module '../TrialSecretaryReport'`

- [ ] **Step 3: Implement `TrialSecretaryReport.tsx`**

```tsx
// src/components/reports/TrialSecretaryReport.tsx
import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

const AKC_ADDRESS =
  'The American Kennel Club, Event Operations, 8051 Arco Corporate Dr, Suite 100, Raleigh, NC 27617-3390';
const AKC_FEE_PER_ENTRY = 3.5;

export const TrialSecretaryReport: React.FC<ReportProps> = ({
  showName,
  clubName,
  trial,
  entries,
}) => {
  const trialDate = trial?.date ? formatReportDate(trial.date) : '___________';
  const judgeName = trial?.judgeName ?? '___________';
  const entryCount = entries.length;
  const totalFee = (entryCount * AKC_FEE_PER_ENTRY).toFixed(2);

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">Report of Scent Work Trial</h1>
        <p className="report-subtitle">AKC Trial Secretary Report</p>
      </div>

      <div className="form-section">
        <p style={{ fontSize: '10px' }}>
          Upon completion of a Scent Work Trial, the Superintendent/Event Secretary shall complete a
          copy of this form for each event (one event per form) and mail the marked and signed
          original and judge copies to AKC Event Operations within 15 days of the event.
        </p>
        <p className="form-address">Send to: {AKC_ADDRESS}</p>
      </div>

      <table className="form-table">
        <tbody>
          <tr>
            <td className="form-label">Name of Club:</td>
            <td className="form-value">{clubName ?? showName ?? '___________'}</td>
          </tr>
          <tr>
            <td className="form-label">Date of Trial:</td>
            <td className="form-value">{trialDate}</td>
          </tr>
          <tr>
            <td className="form-label">Trial Number:</td>
            <td className="form-value">Trial {trial?.trialNumber ?? '___'}</td>
          </tr>
          <tr>
            <td className="form-label">Number of Entries:</td>
            <td className="form-value">{entryCount}</td>
          </tr>
          <tr>
            <td className="form-label">Judge Name:</td>
            <td className="form-value">{judgeName}</td>
          </tr>
          <tr>
            <td className="form-label">
              ${AKC_FEE_PER_ENTRY.toFixed(2)} per entry × {entryCount} entries =
            </td>
            <td className="form-value">${totalFee} Total Service Charge</td>
          </tr>
        </tbody>
      </table>

      <div className="form-section">
        <p className="form-question">
          Did the judge below give notice on the result certification of their inability to judge?
          Or was any complaint filed against the AKC Club, Event Secretary, Show Chair, or Judge?
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☑ No</span>
        </div>
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          Were there any complaints about this event filed with the American Kennel Club?
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☑ No</span>
        </div>
        <div className="form-blank-line" />
      </div>

      <div className="form-signature-section">
        <div className="signature-line">
          <span className="signature-label">Trial Secretary Signature:</span>
          <span className="signature-blank" />
        </div>
        <div className="signature-line">
          <span className="signature-label">Date:</span>
          <span className="signature-blank" />
        </div>
      </div>

      <div className="report-footer">
        <div className="footer-right">Generated by myK9Show — Page 1 of 1</div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/TrialSecretaryReport.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/TrialSecretaryReport.tsx apps/myk9show/src/components/reports/__tests__/TrialSecretaryReport.test.tsx
git commit -m "feat(reports): add Trial Secretary Report component"
```

---

## Task 6: Judge's Certification

**Files:**

- Create: `apps/myk9show/src/components/reports/JudgesCertification.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/JudgesCertification.test.tsx`

Per-trial AKC form showing qualifying entry counts per element, with a total and signature line. One page per judge. Reference: `docs/mySWT/akc_judge_certification.png`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/reports/__tests__/JudgesCertification.test.tsx
import { render, screen } from '@testing-library/react';
import { JudgesCertification } from '../JudgesCertification';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  clubName: 'Norwegian Elkhound Association of America',
  organization: 'AKC',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Kathy R Echols' },
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Container', level: 'Novice', judgeName: 'Kathy R Echols' },
    { id: 'c2', trialId: 't1', element: 'Buried', level: 'Novice', judgeName: 'Kathy R Echols' },
  ],
  entries: [
    {
      id: 'e1',
      armband: 101,
      runOrder: 1,
      callName: 'Buddy',
      breed: 'Lab',
      handler: 'Jane',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: null,
      totalFaults: 0,
      finalPlacement: 1,
      classId: 'c1',
      classElement: 'Container',
    },
    {
      id: 'e2',
      armband: 102,
      runOrder: 2,
      callName: 'Max',
      breed: 'GSD',
      handler: 'Bob',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'NQ',
      searchTimeSeconds: null,
      totalFaults: 1,
      finalPlacement: 9996,
      classId: 'c1',
      classElement: 'Container',
    },
    {
      id: 'e3',
      armband: 103,
      runOrder: 3,
      callName: 'Rex',
      breed: 'Beagle',
      handler: 'Alice',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: null,
      totalFaults: 0,
      finalPlacement: 1,
      classId: 'c2',
      classElement: 'Buried',
    },
  ],
};

describe('JudgesCertification', () => {
  it('renders certification title', () => {
    render(<JudgesCertification {...baseProps} />);
    expect(screen.getByText(/Scent Work Judge.?s Certification/i)).toBeInTheDocument();
  });

  it('shows judge name', () => {
    render(<JudgesCertification {...baseProps} />);
    expect(screen.getByText('Kathy R Echols')).toBeInTheDocument();
  });

  it('shows qualifying count per element', () => {
    render(<JudgesCertification {...baseProps} />);
    const rows = screen.getAllByRole('row');
    expect(
      rows.some(r => r.textContent?.includes('Container') && r.textContent?.includes('1'))
    ).toBe(true);
    expect(rows.some(r => r.textContent?.includes('Buried') && r.textContent?.includes('1'))).toBe(
      true
    );
  });

  it('shows correct total qualifying count', () => {
    render(<JudgesCertification {...baseProps} />);
    // Total = 2 (1 Container Q + 1 Buried Q)
    expect(screen.getByText(/Total/i).closest('tr')).toHaveTextContent('2');
  });

  it('renders signature line', () => {
    render(<JudgesCertification {...baseProps} />);
    expect(screen.getByText(/Judge.?s Signature/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/JudgesCertification.test.tsx
```

Expected: `Cannot find module '../JudgesCertification'`

- [ ] **Step 3: Implement `JudgesCertification.tsx`**

```tsx
// src/components/reports/JudgesCertification.tsx
import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { isQualified } from '@/lib/reports/reportUtils';

export const JudgesCertification: React.FC<ReportProps> = ({
  showName,
  clubName,
  trial,
  allClasses = [],
  entries,
}) => {
  const judgeName = trial?.judgeName ?? 'Unknown Judge';

  const qualifyingByElement = new Map<string, number>();
  for (const entry of entries) {
    if (isQualified(entry) && entry.classElement) {
      qualifyingByElement.set(
        entry.classElement,
        (qualifyingByElement.get(entry.classElement) ?? 0) + 1
      );
    }
  }

  const elements = [...new Set(allClasses.map(c => c.element))];
  const totalQualifying = [...qualifyingByElement.values()].reduce((sum, n) => sum + n, 0);

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">Scent Work Judge's Certification</h1>
        {(clubName ?? showName) && <p className="report-subtitle">{clubName ?? showName}</p>}
        {trial && (
          <p className="report-subtitle">
            {trial.date} · Trial {trial.trialNumber}
          </p>
        )}
      </div>

      <div className="form-section">
        <div className="form-field-row">
          <span className="form-label">Judge's Name:</span>
          <span className="form-value">{judgeName}</span>
        </div>
      </div>

      <div className="form-section">
        <p>I certify that:</p>
        <table className="report-table">
          <thead>
            <tr>
              <th>Element</th>
              <th>Dogs Receiving Qualifying Scores</th>
            </tr>
          </thead>
          <tbody>
            {elements.map(element => (
              <tr key={element}>
                <td>{element}</td>
                <td>{qualifyingByElement.get(element) ?? 0}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td>
                <strong>Total qualifying in this trial under me</strong>
              </td>
              <td>
                <strong>{totalQualifying}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="form-signature-section">
        <div className="signature-line">
          <span className="signature-label">Judge's Signature:</span>
          <span className="signature-blank" />
        </div>
        <div className="signature-line">
          <span className="signature-label">Date:</span>
          <span className="signature-blank" />
        </div>
      </div>

      <div className="report-footer">
        <div className="footer-right">Generated by myK9Show — Page 1 of 1</div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/JudgesCertification.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/JudgesCertification.tsx apps/myk9show/src/components/reports/__tests__/JudgesCertification.test.tsx
git commit -m "feat(reports): add Judge's Certification Report component"
```

---

## Task 7: Trial Chairman Report

**Files:**

- Create: `apps/myk9show/src/components/reports/TrialChairmanReport.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/TrialChairmanReport.test.tsx`

AKC form completed by the trial chair. Contains club/judge info and yes/no questions about demo dog, dog aggression, misconduct, and site problems. Designed to be printed and filled in by hand. Reference: `docs/mySWT/akc_trial_chair.png`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/reports/__tests__/TrialChairmanReport.test.tsx
import { render, screen } from '@testing-library/react';
import { TrialChairmanReport } from '../TrialChairmanReport';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  clubName: 'Norwegian Elkhound Association of America',
  organization: 'AKC',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Jane Smith' },
  entries: [],
};

describe('TrialChairmanReport', () => {
  it('renders report title', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Trial Chair.?s Report/i)).toBeInTheDocument();
  });

  it('shows club name', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText('Norwegian Elkhound Association of America')).toBeInTheDocument();
  });

  it('shows judge name', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
  });

  it('shows trial date', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/04\/12\/2026/)).toBeInTheDocument();
  });

  it('includes demo dog question', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Demo Dog/i)).toBeInTheDocument();
  });

  it('includes dog aggression question', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Dog Aggression/i)).toBeInTheDocument();
  });

  it('includes misconduct question', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Misconduct/i)).toBeInTheDocument();
  });

  it('renders signature line', () => {
    render(<TrialChairmanReport {...baseProps} />);
    expect(screen.getByText(/Trial Chair/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/TrialChairmanReport.test.tsx
```

Expected: `Cannot find module '../TrialChairmanReport'`

- [ ] **Step 3: Implement `TrialChairmanReport.tsx`**

```tsx
// src/components/reports/TrialChairmanReport.tsx
import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

export const TrialChairmanReport: React.FC<ReportProps> = ({ showName, clubName, trial }) => {
  const trialDate = trial?.date ? formatReportDate(trial.date) : '___________';
  const judgeName = trial?.judgeName ?? '___________';

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-logo">myK9Show</div>
        <h1 className="report-title">AKC Scent Work Trial Chair's Report</h1>
        <p style={{ fontSize: '9px', marginTop: '4px' }}>
          This form is to be completed by the Trial Chair upon all trials is complete. Submit to AKC
          Event Operations, 8051 Arco Corporate Dr, Suite 100, Raleigh, NC 27617.
        </p>
      </div>

      <table className="form-table">
        <tbody>
          <tr>
            <td className="form-label">Trial Date(s):</td>
            <td className="form-value">{trialDate}</td>
            <td className="form-label">Trial Number:</td>
            <td className="form-value">Trial {trial?.trialNumber ?? '___'}</td>
          </tr>
          <tr>
            <td className="form-label">Club Name:</td>
            <td className="form-value" colSpan={3}>
              {clubName ?? showName ?? '___________'}
            </td>
          </tr>
          <tr>
            <td className="form-label">Trial Chair:</td>
            <td className="form-value">___________________________</td>
            <td className="form-label">Telephone:</td>
            <td className="form-value">___________________________</td>
          </tr>
          <tr>
            <td className="form-label">Email:</td>
            <td className="form-value" colSpan={3}>
              ___________________________
            </td>
          </tr>
          <tr>
            <td className="form-label">Judge(s):</td>
            <td className="form-value" colSpan={3}>
              {judgeName}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="form-section">
        <p className="form-question">
          <strong>Was the judge(s) knowledgeable?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">If no, explain:</span>
        </div>
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>
            Did the club provide a non-entered, qualified Demo Dog for all classes? If the required
            Demo Dog was not utilized in protest, please explain why and what dog was used.
          </strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
        </div>
        <div className="form-blank-lines">
          <div className="form-blank-line" />
          <div className="form-blank-line" />
        </div>
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Were there any reportable Dog Aggression incidents at this event?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">If yes, describe:</span>
        </div>
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Were there any reportable Misconduct incidents at this event?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
          <span className="form-inline-label">If yes, describe:</span>
        </div>
        <div className="form-blank-line" />
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Were there any other problems at the trial site?</strong>
        </p>
        <div className="form-checkbox-row">
          <span className="form-checkbox">☐ Yes</span>
          <span className="form-checkbox">☐ No</span>
        </div>
        <div className="form-blank-lines">
          <div className="form-blank-line" />
          <div className="form-blank-line" />
        </div>
      </div>

      <div className="form-section">
        <p className="form-question">
          <strong>Comments:</strong>
        </p>
        <div className="form-blank-lines">
          <div className="form-blank-line" />
          <div className="form-blank-line" />
          <div className="form-blank-line" />
        </div>
      </div>

      <div className="form-signature-section">
        <div className="signature-line">
          <span className="signature-label">Trial Chair Signature:</span>
          <span className="signature-blank" />
        </div>
        <div className="signature-line">
          <span className="signature-label">Date:</span>
          <span className="signature-blank" />
        </div>
      </div>

      <div className="report-footer">
        <div className="footer-right">Generated by myK9Show — Page 1 of 1</div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/TrialChairmanReport.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/TrialChairmanReport.tsx apps/myk9show/src/components/reports/__tests__/TrialChairmanReport.test.tsx
git commit -m "feat(reports): add Trial Chairman Report component"
```

---

## Task 8: Wire up registry — enable all 6 Phase 2 reports

**Files:**

- Modify: `apps/myk9show/src/lib/reports/reportRegistry.ts`
- Modify: `apps/myk9show/src/lib/reports/__tests__/reportRegistry.test.ts`

- [ ] **Step 1: Read the current registry test**

```bash
cat apps/myk9show/src/lib/reports/__tests__/reportRegistry.test.ts
```

- [ ] **Step 2: Add imports to `reportRegistry.ts`**

Add after the existing imports:

```typescript
import { ShowCatalog } from '@/components/reports/ShowCatalog';
import { ResultCatalog } from '@/components/reports/ResultCatalog';
import { JudgesSchedule } from '@/components/reports/JudgesSchedule';
import { TrialSecretaryReport } from '@/components/reports/TrialSecretaryReport';
import { JudgesCertification } from '@/components/reports/JudgesCertification';
import { TrialChairmanReport } from '@/components/reports/TrialChairmanReport';
```

- [ ] **Step 3: Replace Phase 2 stubs in `reportRegistry.ts`**

Replace the 6 disabled stub entries with:

```typescript
{
  id: 'show-catalog',
  name: 'Show Catalog',
  category: 'operational',
  scopes: ['show', 'trial'],
  sortOptions: [
    { value: 'armband', label: 'Armband #' },
    { value: 'handler', label: 'Handler Name' },
    { value: 'breed', label: 'Breed' }, // [ADDED] per design spec
  ],
  defaultSort: 'armband',
  component: ShowCatalog,
  enabled: true,
},
{
  id: 'result-catalog',
  name: 'Result Catalog',
  category: 'operational',
  scopes: ['show', 'trial'],
  sortOptions: [
    { value: 'placement', label: 'Placement' },
    { value: 'armband', label: 'Armband #' },
    { value: 'handler', label: 'Handler Name' }, // [ADDED] per design spec
  ],
  defaultSort: 'placement',
  component: ResultCatalog,
  enabled: true,
},
{
  id: 'judges-schedule',
  name: "Judge's Schedule",
  category: 'operational',
  scopes: ['show'],
  sortOptions: [
    { value: 'trial-date', label: 'Trial Date' },
    { value: 'judge-name', label: 'Judge Name' }, // classes within each trial sorted by judge name
  ],
  defaultSort: 'trial-date',
  component: JudgesSchedule,
  enabled: true,
},
{
  id: 'trial-secretary-report',
  name: 'Trial Secretary Report',
  category: 'organization',
  scopes: ['trial'],
  sortOptions: [],
  defaultSort: '',
  component: TrialSecretaryReport,
  enabled: true,
},
{
  id: 'judges-certification',
  name: "Judge's Certification Report",
  category: 'organization',
  scopes: ['trial'],
  sortOptions: [],
  defaultSort: '',
  component: JudgesCertification,
  enabled: true,
},
{
  id: 'trial-chairman-report',
  name: 'Trial Chairman Report',
  category: 'organization',
  scopes: ['trial'],
  sortOptions: [],
  defaultSort: '',
  component: TrialChairmanReport,
  enabled: true,
},
```

- [ ] **Step 4: Update `reportRegistry.test.ts` to reflect Phase 2 being enabled**

Find any test that asserts Phase 2 reports are disabled (e.g., `enabled: false`) and update it to assert they are enabled. Add a test verifying all 6 have non-placeholder components:

```typescript
const PHASE_2_IDS = [
  'show-catalog',
  'result-catalog',
  'judges-schedule',
  'trial-secretary-report',
  'judges-certification',
  'trial-chairman-report',
];

it('all Phase 2 reports are enabled', () => {
  for (const id of PHASE_2_IDS) {
    const report = reportRegistry.find(r => r.id === id);
    expect(report?.enabled, `${id} should be enabled`).toBe(true);
  }
});

it('all Phase 2 reports have real components (not PlaceholderReport)', () => {
  for (const id of PHASE_2_IDS) {
    const report = reportRegistry.find(r => r.id === id);
    expect(report?.component, `${id} should have a component`).toBeDefined();
    // PlaceholderReport returns null; real components return JSX
    const result = report?.component({ showName: 'Test', entries: [], sortOrder: '' });
    expect(result, `${id} component should not return null`).not.toBeNull();
  }
});
```

- [ ] **Step 5: Run registry tests**

```bash
cd apps/myk9show && npx vitest run src/lib/reports/__tests__/reportRegistry.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run full report test suite**

```bash
cd apps/myk9show && npx vitest run src/components/reports/__tests__/ src/lib/reports/__tests__/
```

Expected: all tests pass.

- [ ] **Step 7: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/lib/reports/reportRegistry.ts apps/myk9show/src/lib/reports/__tests__/reportRegistry.test.ts
git commit -m "feat(reports): enable all 6 Phase 2 reports in registry"
```

---

# Phase 2 Extended Scope: Additional Reports

**Why this section exists.** Walking the Access app (`docs/mySWT/`) revealed 11 reports that exist in production but are in neither Phase 1 (already shipped) nor the original Phase 2 plan above. These are required for fall launch because real secretaries expect them from their Access workflow. Tasks 9–19 follow the same patterns as Tasks 2–7 — reference those for test/component boilerplate instead of duplicating it here.

**Shared conventions for Tasks 9–19:**
- Each new report component is a React FC<ReportProps> under `apps/myk9show/src/components/reports/`
- Each has a matching test file under `apps/myk9show/src/components/reports/__tests__/`
- Each test follows the same "render + assert key text/structure" pattern as Task 2 (`ShowCatalog.test.tsx`)
- Each task ends with typecheck + vitest + commit (omitted from individual steps for brevity — run them at the end of every task)
- All new reports get registered in Task 20
- Reference screenshots live under `docs/mySWT/`
- Printed-form PDF references live under `docs/mySWT/SW-*.pdf`

---

## Task 9: Show Entry Counts

**Reference:** `docs/mySWT/show_entry_counts.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/ShowEntryCounts.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/ShowEntryCounts.test.tsx`
- Modify: `apps/myk9show/src/lib/reports/reportStyles.ts` — add `.stats-section`, `.stats-row`, `.stats-total`, `.stats-footer` CSS (derive from `catalog-*` patterns)

**Purpose:** Aggregated entry counts for the whole show, grouped by `element → level → section`, with per-element totals and a grand total at the bottom showing total entries, unique people, and unique dogs.

**Scope:** `['show']` — show-mode rendering

**Data requirements:**
- Input: `allClasses` (for element/level/section metadata) and `entries` (each enriched with `classId` via Task 1 mapEntries)
- Aggregation: group entries by joining on `classId` → class. Count entries per (element, level, section).
- Footer totals: entry total (len of entries), unique people count (distinct `handler`), unique dogs count (distinct `dogId` or dog name if dogId absent).

**Layout per screenshot:**
- Header: "Scent Work Entry Counts" + club/show name
- Sub-header: "Entry Counts by Show" + show date range
- Table per element with columns: Level, Section, Entries
- Row below each element: "Element Total: N"
- Footer row: "Show Entry Total: X   People: Y   Dogs: Z"

- [ ] **Step 1: Write failing test** — render with 6 entries across 2 elements (Container and Interior), assert element totals and grand total appear
- [ ] **Step 2: Implement `ShowEntryCounts.tsx`** — follow `ShowCatalog.tsx` pattern for show-mode rendering, swap the row-per-entry logic for grouped aggregation
- [ ] **Step 3: Add CSS classes to `reportStyles.ts`**
- [ ] **Step 4: Typecheck, test, commit**

---

## Task 10: Trial Entry Counts

**Reference:** `docs/mySWT/trial_entry_counts.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/TrialEntryCounts.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/TrialEntryCounts.test.tsx`

**Purpose:** Same aggregation as Task 9 but scoped to a single trial — used when a secretary wants counts for one day/trial rather than the whole show.

**Scope:** `['trial']` — trial-mode rendering (one render per selected trial)

**Data:** Same as Task 9 but filtered by `trialId`. The trial-mode branch in `ReportPreview.tsx` (Task 1 Step 6) already filters entries to a single trial, so the component just aggregates what it receives.

- [ ] **Step 1: Test** — render with entries from one trial, assert element totals + trial grand total
- [ ] **Step 2: Implement** — copy `ShowEntryCounts` and switch header to trial-scoped (use `props.trial.trialNumber` and `props.trial.date`)
- [ ] **Step 3: Typecheck, test, commit**

---

## Task 11: Breed Entry Counts

**Reference:** `docs/mySWT/breed_entry_counts.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/BreedEntryCounts.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/BreedEntryCounts.test.tsx`

**Purpose:** Show-wide counts grouped by breed — used for club statistics and sanction reporting.

**Scope:** `['show']`

**Data:** Group `entries` by `breed`, count. No class aggregation needed. Sort alphabetically by breed.

**Layout:** Single table, columns: Breed, Entries. Footer: "Total Breeds: N, Total Entries: M".

- [ ] **Step 1: Test** — render with entries across 3 breeds, assert each breed row and totals
- [ ] **Step 2: Implement** — simple group-by-breed aggregation
- [ ] **Step 3: Typecheck, test, commit**

---

## Task 12: Judge Entry Counts (with optional Estimated Time)

**References:** `docs/mySWT/judge_entry_counts.png`, `docs/mySWT/judge_entry_counts_estimated_time.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/JudgeEntryCounts.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/JudgeEntryCounts.test.tsx`

**Purpose:** Counts per judge, grouped by judge → classes they're judging → entry count. The "Estimated Time" variant adds a calculated time column (`entries × time_per_entry`, where `time_per_entry` is a per-level constant drawn from the class configuration).

**Scope:** `['show']` (secretary wants this at show level for scheduling across days)

**Decision:** implement as ONE report with an `includeEstimatedTime?: boolean` prop on `ReportProps`, defaulting to `false`. Add a sort/option in the registry like `{ value: 'with-time', label: 'Include Estimated Time' }` so the user toggles it from the `ReportsPage` dropdown.

**Data:**
- Group `allClasses` by `judgeName`
- For each judge's classes, count entries (via `entries` filtered by `classId`)
- Estimated time = sum over classes of `(entry count × time_per_entry_seconds)`; `time_per_entry_seconds` comes from `classData.timeLimitSeconds` as an upper bound, or from a lookup table of per-level average times (define constants if needed)

- [ ] **Step 1: Extend `ReportProps`** — add `includeEstimatedTime?: boolean` in `types.ts`
- [ ] **Step 2: Write failing test** — render with 2 judges, 3 classes, assert counts and (when flag set) time column
- [ ] **Step 3: Implement** — judge aggregation + optional time calculation
- [ ] **Step 4: Typecheck, test, commit**

---

## Task 13: Financial Report (Accepted + Waitlist)

**References:** `docs/mySWT/financial_report_accepted.png`, `docs/mySWT/financial_report_waitlist.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/FinancialReport.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/FinancialReport.test.tsx`
- Modify: `apps/myk9show/src/lib/reports/types.ts` — extend `ReportEntry` with `entryFee?: number`, `paymentStatus?: 'accepted' | 'waitlisted' | 'withdrawn'`, `paymentMethod?: string`

**Purpose:** Per-exhibitor financial breakdown of entries and fees. One row per entry with fee; exhibitor subtotal after their entries; grand total at bottom. Two variants selected via a dropdown option:
- **Accepted** — entries where `paymentStatus === 'accepted'`
- **Waitlist** — entries where `paymentStatus === 'waitlisted'`

**Scope:** `['show']`

**Data:**
- Requires `entries` enriched with fee/payment fields from the `entries` Supabase table (see `tbl_Entry.txt` for Access field names; map to current Supabase columns during Task 1 extension of `mapEntries`)
- Group by exhibitor (owner) — use `handler` as group key initially; if owner entity diverges from handler, revisit
- Per-exhibitor subtotal: sum of `entryFee` across that exhibitor's entries
- Grand total: sum across all exhibitors

**Layout:** Grouped table with exhibitor name headers. Columns: Date, Trial, Class, Dog, Fee, Payment Method. Subtotal row per exhibitor. Grand total row at the bottom.

- [ ] **Step 1: Extend `ReportEntry`** — add fee/payment fields (nullable)
- [ ] **Step 2: Extend `mapEntries` in `ReportPreview.tsx`** — populate fee/payment from `entries` row
- [ ] **Step 3: Add registry sort options** — `{ value: 'accepted', label: 'Accepted' }`, `{ value: 'waitlist', label: 'Waitlist' }`; `defaultSort: 'accepted'`
- [ ] **Step 4: Write failing test** — render with 2 exhibitors, 4 entries, assert subtotals and grand total; filter test for waitlist variant
- [ ] **Step 5: Implement `FinancialReport.tsx`** — use `sortOrder` prop to switch between accepted/waitlist filters
- [ ] **Step 6: Typecheck, test, commit**

**Database note:** If `entries.entry_fee` or payment columns don't exist in the current Supabase schema, add a migration before this task. Check `supabase/migrations/` and compare to `docs/mySWT/tbl_Entry.txt` fields `Entry_Fee`, `Payment_Status`, `Payment_Method`.

---

## Task 14: Waitlist Report

**Reference:** `docs/mySWT/waitlist.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/WaitlistReport.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/WaitlistReport.test.tsx`

**Purpose:** Simple list of waitlisted entries, grouped by trial → class. One row per waitlisted entry.

**Scope:** `['show']`

**Data:** Filter `entries` where `paymentStatus === 'waitlisted'` (from Task 13 extension), group by trial → class.

**Layout per screenshot:** Header rows showing "Trial N   Element   Level   Section" followed by entry rows. Columns per entry row: Armband, Call Name, Owner, Entry type (Early/Regular), Date Entered.

- [ ] **Step 1: Test** — 2 waitlisted entries across 1 class, assert header + rows
- [ ] **Step 2: Implement** — straightforward filtered list with grouping
- [ ] **Step 3: Typecheck, test, commit**

---

## Task 15: Steward Report

**Reference:** `docs/mySWT/steward_report.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/StewardReport.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/StewardReport.test.tsx`
- Modify: `apps/myk9show/src/types/volunteer.ts` — add `'Table Steward'` to `RING_ROLES`
- Modify: `apps/myk9show/src/lib/reports/types.ts` — extend `allClasses[i]` with `stewards?: { [roleName: string]: string }` (role → volunteer name map)
- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx` — populate `allClasses[i].stewards` from class assignments

**Purpose:** Per-trial table of classes with steward assignments, used by the trial secretary to verify the steward roster before day-of operations.

**Scope:** `['trial']` — trial-mode rendering (one per trial)

**Layout:** Header showing club/show name + trial number + date. Table columns: Element, Level, Section, Table Steward, Timer Steward, Gate Steward, Ring Steward. Rows are the classes of that trial (plus a "Waitlist" row if applicable).

**Data — reuses existing Volunteer Scheduling feature.** This report does NOT need new schema. The `class_assignments` table from migration `supabase/migrations/095_volunteer_scheduling.sql` already stores `(volunteer_id, class_id, role_name)` tuples. Ring roles defined in `apps/myk9show/src/types/volunteer.ts` are the exact vocabulary this report uses.

**Existing infrastructure to reuse:**
- Design spec: `docs/superpowers/specs/2026-03-30-volunteer-scheduling-design.md`
- Data hooks: `apps/myk9show/src/hooks/queries/volunteerQueries.ts`
- Type definitions: `apps/myk9show/src/types/volunteer.ts` (`RING_ROLES`, `ClassAssignment`)
- Scheduling UI: `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage` (where users assign stewards)

**Role mapping (Access → myK9Show):**
| Access column   | myK9Show `RING_ROLES` entry |
| --------------- | --------------------------- |
| Table Steward   | `'Table Steward'` (NEW — add to array) |
| Timer Steward   | `'Timer'` (existing)        |
| Gate Steward    | `'Gate Steward'` (existing) |
| Ring Steward 1  | `'Ring Steward'` (existing) |

- [ ] **Step 1: Add `'Table Steward'` to `RING_ROLES`**

In `apps/myk9show/src/types/volunteer.ts`:

```typescript
export const RING_ROLES = ['Table Steward', 'Gate Steward', 'Timer', 'Ring Steward'] as const;
```

Run existing volunteer tests to catch any hardcoded 3-role assumptions:

```bash
cd apps/myk9show && npx vitest run src/types/__tests__/volunteer.test.ts src/hooks/queries/__tests__/volunteerQueries.test.tsx src/components/volunteers/__tests__/
```

If any test or component hardcodes the 3-role list, update to use `RING_ROLES` (or `RING_ROLES.length`). Do not hardcode counts.

- [ ] **Step 2: Extend `allClasses` in `ReportProps`**

In `apps/myk9show/src/lib/reports/types.ts`, extend the `allClasses[i]` shape added in Task 1:

```typescript
allClasses?: Array<{
  id: string;
  trialId: string;
  element: string;
  level: string;
  section?: string;
  judgeName?: string;
  stewards?: Record<string, string>; // roleName → volunteer display name
}>;
```

- [ ] **Step 3: Populate `stewards` in `ReportPreview.tsx`**

Before rendering a report in trial-mode or show-mode, fetch class assignments for the relevant classes and build a `stewards` map per class. Reuse `volunteerQueries.ts` — pull the assignments-by-show query (or add one if not already present) and do the join in-memory.

Pseudocode:
```typescript
const assignmentsByClassId = groupBy(classAssignments, 'classId');
const allClassesWithStewards = allClasses.map(c => ({
  ...c,
  stewards: Object.fromEntries(
    (assignmentsByClassId[c.id] ?? []).map(a => [a.roleName, a.volunteerName])
  ),
}));
```

Only Task 15 consumes `stewards`, so it's OK if this enrichment happens lazily (only when the selected report id is `'steward-report'`) to avoid extra queries for other reports.

- [ ] **Step 4: Write failing test** — render with 3 classes where each has a different subset of the 4 stewards assigned; assert all 4 columns render with correct names (and blank where unassigned)

- [ ] **Step 5: Implement `StewardReport.tsx`**

```typescript
const ROLE_ORDER = ['Table Steward', 'Timer', 'Gate Steward', 'Ring Steward'] as const;

// For each class in props.allClasses (filtered to this trial in trial-mode):
//   render a row with element, level, section, and one cell per ROLE_ORDER[i]
//   cell value = class.stewards?.[role] ?? '' (blank if unassigned)
```

Column header labels match the Access screenshot exactly: "Table Steward", "Timer Steward", "Gate Steward", "Ring Steward". Note: the display label for `'Timer'` in the volunteer data becomes "Timer Steward" in the report header — handle the label mapping in the component.

- [ ] **Step 6: Typecheck, test, commit**

---

## Task 16: Result Labels

**Reference:** `docs/mySWT/result_labels.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/ResultLabels.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/ResultLabels.test.tsx`

**Purpose:** Printable Avery-label-style sheet with one label per entry. Each label shows: armband, call name, handler, club/show, trial+class, placement, search time, faults. Used to stick labels on ribbons.

**Scope:** `['trial', 'class']` — class-mode rendering (existing behavior, one render per class) so the labels come in class order

**Layout per screenshot:** 2-column × multiple rows grid of labels, each label a small bordered box with the data above. Avery 5160 or 5164 dimensions — follow existing `armband_labels` component in Phase 1 for CSS and page-break rules.

**Data:** `entries` with result fields (`finalPlacement`, `searchTimeSeconds`, `totalFaults`) already populated via existing `mapEntries`.

- [ ] **Step 1: Read existing `ArmbandLabels` component** — reuse its label-grid CSS
- [ ] **Step 2: Write failing test** — 4 entries, assert each label's armband + placement
- [ ] **Step 3: Implement `ResultLabels.tsx`**
- [ ] **Step 4: Typecheck, test, commit**

---

## Task 17: AKC Judge's Report

**References:** `docs/mySWT/akc_judge_report.png`, `docs/mySWT/SW-JudgeReport.pdf`

**Files:**
- Create: `apps/myk9show/src/components/reports/AKCJudgeReport.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/AKCJudgeReport.test.tsx`

**Purpose:** AKC-mandated judge's report form, one per judge per trial. A fillable-form layout with pre-populated show/trial/judge metadata and yes/no question checkboxes for the judge to sign off on (reportable problems, club adequacy, donation/food policy compliance, 60-day advance info, etc.). Renders to PDF via the preview iframe and the judge prints and signs.

**Scope:** `['trial']` — trial-mode rendering, one per trial per judge

**Data:**
- Header: show, trial, AKC event number (from `trials.event_number`), club, judge name + judge AKC number
- Body: the list of AKC yes/no/comment questions from the screenshot + PDF. These are static text; the component just lays them out with blank lines for judge to fill in.
- Trial might have multiple judges across classes — render one form per distinct judge in the trial

**Layout:** Use the `form-*` CSS classes from Task 1 Step 4b for labels, blanks, checkbox rows, signature section.

- [ ] **Step 1: Read full question list from `SW-JudgeReport.pdf`** — use Poppler or ask user for text extraction; list every question verbatim
- [ ] **Step 2: Write failing test** — render with trial data + 1 judge, assert header fields and at least 3 question labels render
- [ ] **Step 3: Implement `AKCJudgeReport.tsx`** — iterate over distinct judges in the trial's classes, render one form per judge
- [ ] **Step 4: Typecheck, test, commit**

**Scope boundary:** This is a printed form. No database writes. The judge fills it in by hand or electronically in Adobe Reader.

---

## Task 18: AKC Trial Secretary Certification

**Reference:** `docs/mySWT/ac_secretary_certification.png`

**Files:**
- Create: `apps/myk9show/src/components/reports/TrialSecretaryCertification.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/TrialSecretaryCertification.test.tsx`

**Purpose:** Short AKC certification page stating totals for the trial: total entries, total runs (starters/participants), total withdrawals, total qualifying scores. Signed by trial secretary.

**Scope:** `['trial']`

**Data:**
- Total entries = count of `entries` for the trial
- Total runs = count where `checkInStatus === 'present'`
- Total withdrawals = count where `entryStatus === 'withdrawn'`
- Total qualifying = count where `resultStatus === 'Q'`

**Layout per screenshot:** Header "Scent Work Trial Secretary's Certification" + club/trial info. A boxed certification statement with 4 numeric fields showing the totals. Signature line at the bottom.

- [ ] **Step 1: Test** — trial with 5 entries (3 present, 1 withdrawn, 2 Q), assert totals
- [ ] **Step 2: Implement** — aggregation + `form-*` CSS layout
- [ ] **Step 3: Typecheck, test, commit**

**Distinguish from existing Task 5 Trial Secretary Report.** Task 5 is the larger AKC Trial Secretary Report (more questions, fee calculation). This Task 18 is the shorter *certification* page that often accompanies it. Both are separate AKC forms.

---

## Task 19: Extended infrastructure reconcile

Before wiring up the registry (Task 20), verify these possible overlaps with existing Phase 1 / Phase 2 reports:

- [ ] **Step 1: Compare `docs/mySWT/preliminary_results.png` against the existing `ResultsSheet` (Phase 1)**
  - If the same, skip — no new component needed
  - If different, add a new task following the `ResultsSheet` pattern
- [ ] **Step 2: Compare `docs/mySWT/show_catalog_addresses.png` against Task 2's `ShowCatalog`**
  - Likely a sort/option variant of Show Catalog that includes owner addresses
  - Add an `include-addresses` sort option to the Show Catalog registry entry rather than a new report
  - Add a conditional `<td>` block in `ShowCatalog.tsx` that renders owner address when this option is selected
  - **Data:** requires owner address fields from Supabase. If not yet populated in replication, this step reduces to "design note: blocked on owner address replication, defer to Phase 3"
- [ ] **Step 3: Document reconciliation findings** in this plan file under Task 19

---

## Task 20: Wire up extended registry — enable all new reports

**Files:**
- Modify: `apps/myk9show/src/lib/reports/reportRegistry.ts`
- Modify: `apps/myk9show/src/lib/reports/__tests__/reportRegistry.test.ts`

- [ ] **Step 1: Add imports**

```typescript
import { ShowEntryCounts } from '@/components/reports/ShowEntryCounts';
import { TrialEntryCounts } from '@/components/reports/TrialEntryCounts';
import { BreedEntryCounts } from '@/components/reports/BreedEntryCounts';
import { JudgeEntryCounts } from '@/components/reports/JudgeEntryCounts';
import { FinancialReport } from '@/components/reports/FinancialReport';
import { WaitlistReport } from '@/components/reports/WaitlistReport';
import { StewardReport } from '@/components/reports/StewardReport';
import { ResultLabels } from '@/components/reports/ResultLabels';
import { AKCJudgeReport } from '@/components/reports/AKCJudgeReport';
import { TrialSecretaryCertification } from '@/components/reports/TrialSecretaryCertification';
```

- [ ] **Step 2: Append to `reportRegistry` array**

```typescript
// Phase 2 Extended Scope
{
  id: 'show-entry-counts',
  name: 'Show Entry Counts',
  category: 'statistics',
  scopes: ['show'],
  sortOptions: [],
  defaultSort: '',
  component: ShowEntryCounts,
  enabled: true,
},
{
  id: 'trial-entry-counts',
  name: 'Trial Entry Counts',
  category: 'statistics',
  scopes: ['trial'],
  sortOptions: [],
  defaultSort: '',
  component: TrialEntryCounts,
  enabled: true,
},
{
  id: 'breed-entry-counts',
  name: 'Breed Entry Counts',
  category: 'statistics',
  scopes: ['show'],
  sortOptions: [],
  defaultSort: '',
  component: BreedEntryCounts,
  enabled: true,
},
{
  id: 'judge-entry-counts',
  name: 'Judge Entry Counts',
  category: 'statistics',
  scopes: ['show'],
  sortOptions: [
    { value: 'standard', label: 'Standard' },
    { value: 'with-time', label: 'Include Estimated Time' },
  ],
  defaultSort: 'standard',
  component: JudgeEntryCounts,
  enabled: true,
},
{
  id: 'financial-report',
  name: 'Financial Report',
  category: 'financial',
  scopes: ['show'],
  sortOptions: [
    { value: 'accepted', label: 'Accepted' },
    { value: 'waitlist', label: 'Waitlist' },
  ],
  defaultSort: 'accepted',
  component: FinancialReport,
  enabled: true,
},
{
  id: 'waitlist-report',
  name: 'Waitlist Report',
  category: 'operational',
  scopes: ['show'],
  sortOptions: [],
  defaultSort: '',
  component: WaitlistReport,
  enabled: true,
},
{
  id: 'steward-report',
  name: "Steward's Report",
  category: 'operational',
  scopes: ['trial'],
  sortOptions: [],
  defaultSort: '',
  component: StewardReport,
  enabled: true,
},
{
  id: 'result-labels',
  name: 'Result Labels',
  category: 'operational',
  scopes: ['trial', 'class'],
  sortOptions: [
    { value: 'placement', label: 'Placement' },
    { value: 'armband', label: 'Armband #' },
  ],
  defaultSort: 'placement',
  component: ResultLabels,
  enabled: true,
},
{
  id: 'akc-judge-report',
  name: "AKC Judge's Report",
  category: 'organization',
  scopes: ['trial'],
  sortOptions: [],
  defaultSort: '',
  component: AKCJudgeReport,
  enabled: true,
},
{
  id: 'trial-secretary-certification',
  name: 'Trial Secretary Certification',
  category: 'organization',
  scopes: ['trial'],
  sortOptions: [],
  defaultSort: '',
  component: TrialSecretaryCertification,
  enabled: true,
},
```

- [ ] **Step 3: Add `'statistics'` and `'financial'` to the `ReportCategory` type union** in `types.ts`

- [ ] **Step 4: Update `reportRegistry.test.ts`** — add the 10 new IDs to a `PHASE_2_EXTENDED_IDS` list, assert all enabled and have non-placeholder components

- [ ] **Step 5: Run full test suite**

```bash
cd apps/myk9show && pnpm test
```

- [ ] **Step 6: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/lib/reports/reportRegistry.ts apps/myk9show/src/lib/reports/__tests__/reportRegistry.test.ts apps/myk9show/src/lib/reports/types.ts
git commit -m "feat(reports): enable Phase 2 extended scope (10 additional reports)"
```

---

## Self-Review

**Spec coverage:**

| Requirement                                                                    | Task          |
| ------------------------------------------------------------------------------ | ------------- |
| Show Catalog — entries organized by trial, sorted by armband/handler/breed     | Tasks 1, 2, 8 |
| Result Catalog — results by class, placement/armband/handler sort, Q/NQ status | Tasks 1, 3, 8 |
| Judge's Schedule — classes with per-class judge, entry counts, estimated time  | Task 4        |
| Trial Secretary Report — AKC form, counts, fee calc, signature                 | Task 5        |
| Judge's Certification — qualifying counts per element, signature               | Task 6        |
| Trial Chairman Report — AKC form, yes/no questions, signature                  | Task 7        |
| Registry enabled with sort options and real components                         | Task 8        |
| Show-scoped rendering mode (filters by trial when specific trial selected)     | Task 1        |
| Trial-scoped rendering mode (one call per trial, not per class)                | Task 1        |
| `hasEntries` correct for trial-mode reports (no `buildPages` call)             | Task 1        |
| `getReportRenderingMode` tested                                                | Task 1        |
| `sortByHandler` and `sortByBreed` utilities                                    | Task 1        |
| New CSS classes for form and catalog layouts                                   | Task 1        |
| Show Entry Counts — element/level/section aggregation with show totals         | Task 9        |
| Trial Entry Counts — per-trial aggregation                                     | Task 10       |
| Breed Entry Counts — per-breed aggregation                                     | Task 11       |
| Judge Entry Counts (+ Estimated Time variant)                                  | Task 12       |
| Financial Report — Accepted and Waitlist variants with exhibitor subtotals     | Task 13       |
| Waitlist Report — filtered entry list grouped by trial/class                   | Task 14       |
| Steward Report — per-trial class table with 4 steward roles                    | Task 15       |
| Result Labels — Avery-label-style sheet per class with result data             | Task 16       |
| AKC Judge's Report — printable form with questions + signature                 | Task 17       |
| Trial Secretary Certification — totals certification form                      | Task 18       |
| Preliminary Results + Show Catalog with Addresses reconciliation               | Task 19       |
| Registry enabled for all extended reports with correct sort options            | Task 20       |

**Placeholder scan:** No TBD, TODO, or vague steps. All steps include exact commands and code.

**Type consistency:** `allTrials` and `allClasses` added to `ReportProps` in Task 1 match usage in Tasks 2–4 and 6. `classId` and `classElement` on `ReportEntry` added in Task 1 match usage in `ResultCatalog` (Task 3) and `JudgesCertification` (Task 6). `sortByHandler` and `sortByBreed` defined in Task 1 Step 3 and used in Tasks 2 and 3.

**Known limitation:** Owner address data (street, city, state, zip) is not included in the Show Catalog — it requires a separate Supabase query for owner profiles not currently in the replication layer. The catalog renders correctly without addresses; address enrichment can be added in Phase 3.
