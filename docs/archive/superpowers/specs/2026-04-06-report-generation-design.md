# Report Generation & Printing System — Design Spec

**Date:** 2026-04-06
**Status:** Draft
**Route:** `/secretary/reports`
**Sidebar:** New entry under "Manage" section

## Overview

A dedicated secretary page for generating and printing reports at configurable scopes and sort orders. The page has a controls bar for selecting report type, scope, and sort, with a live preview below that renders the report as it will appear when printed. The browser's native print dialog handles both printing and PDF export ("Save as PDF").

**Phasing:**

- **Phase 1:** Report engine infrastructure + port 3 existing myK9Q reports (check-in sheet, scoresheet, results sheet)
- **Phase 2:** Build 6 new reports from Access application (show catalog, result catalog, judge's schedule, trial secretary report, judge's certification report, trial chairman report). Screenshots of Access reports will inform these layouts.

## Decisions

| Decision          | Choice                                               | Rationale                                                                                                                                   |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Location          | Dedicated `/secretary/reports` page                  | 9 report types is too many to scatter across contextual locations. Single page for all reporting.                                           |
| Layout            | Top controls bar + below preview                     | Maximizes preview width for letter-sized reports on 15-inch laptop screens.                                                                 |
| Report picker     | Dropdown with optgroups (Operational / Organization) | Scales from 3 (Phase 1) to 9 (Phase 2) without taking excessive space.                                                                      |
| Scope selection   | Dynamic per report type, cascading                   | Each report declares valid scopes. Trial dropdown filters class options. "All Trials" disables class dropdown.                              |
| Sort options      | Dynamic per report type                              | Each report declares its valid sort orders. Only relevant options appear.                                                                   |
| Batch mode        | "All Trials" / "All Classes" option                  | Generates one document with page breaks between each trial/class report. Secretary doesn't have to generate 4 trial reports individually.   |
| Preview rendering | React components in an iframe                        | Clean isolation between app styles and print styles. Preview is WYSIWYG — what you see is exactly what prints.                              |
| PDF export        | Browser's native "Save as PDF" in print dialog       | No server-side PDF library needed. Free with the print dialog.                                                                              |
| Show selection    | Dropdown in page header (above controls bar)         | Show is context-setting, not a report option. Matches DayOfOperationsPage and WaitlistManagementPage pattern. Defaults to show store value. |
| Branding          | "myK9Show" in report headers                         | Consistent with platform branding.                                                                                                          |
| Contextual print  | Not adding to myK9Show                               | All reporting goes through the dedicated page. myK9Q's existing print shortcuts are a separate cleanup concern.                             |

## Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Reports                        [Spring Scent Trial 2026 ▾] │
│  Spring Scent Work Trial 2026                                │
├─────────────────────────────────────────────────────────────┤
│  [Report Type ▾]  [Trial ▾]  [Class ▾]  [Sort ▾]   [Print] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────── gray background ───────────────────────┐  │
│  │  ┌─────────── white paper preview ─────────────────┐  │  │
│  │  │                                                  │  │  │
│  │  │           myK9Show                               │  │  │
│  │  │        Check-in Sheet                            │  │  │
│  │  │                                                  │  │  │
│  │  │  Show: Spring Scent Trial   Judge: Dr. Smith     │  │  │
│  │  │  Trial: Saturday T1         Date: 04/12/2026     │  │  │
│  │  │  Class: Buried Novice       Entries: 12          │  │  │
│  │  │                                                  │  │  │
│  │  │  Gate | Armband | Call Name | Breed | Handler    │  │  │
│  │  │  [ ]  |  101    | Buddy     | Gold. | Mitchell   │  │  │
│  │  │  [ ]  |  108    | Max       | GSD   | Rivera     │  │  │
│  │  │  ...                                             │  │  │
│  │  │                                                  │  │  │
│  │  │  Generated by myK9Show          Page 1 of 1      │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Controls Bar

A horizontal bar with 4 dropdowns and a Print button, using shadcn `Select` components.

**Report Type** — dropdown with optgroups:

```
── Operational ──
Check-in Sheet
Score Sheet
Results Sheet
Show Catalog          (Phase 2)
Result Catalog        (Phase 2)
Judge's Schedule      (Phase 2)
── Organization ──
Trial Secretary Report      (Phase 2)
Judge's Certification Report (Phase 2)
Trial Chairman Report        (Phase 2)
```

**Trial** — populated from the selected show's trials. Options:

- "All Trials" (generates batch with page breaks)
- Individual trials: "Sat T1", "Sat T2", "Sun T1", etc.
- Disabled/hidden if the report type doesn't support trial scope.

**Class** — cascading from selected trial. Options:

- "All Classes" (generates batch with page breaks)
- Individual classes: "Buried Novice", "Interior Advanced", etc.
- Defaults to "All Classes" and disables when "All Trials" is selected.
- Disabled/hidden if the report type doesn't support class scope.

**Sort** — dynamic per report type. Only shows sort options valid for the selected report.

**Print** — triggers `iframe.contentWindow.print()`. Label is "Print" (no icon).

### Show Selector

In the page header, top-right. A shadcn `Select` dropdown listing the secretary's shows. Defaults to `useShowStore().selectedShowId` if set. When changed:

- Updates the show store
- Resets trial/class dropdowns
- Reloads preview data

### Preview Area

- Gray background (`bg-muted` or similar) to simulate paper on a desk
- White container centered within, styled as a page with shadow
- Contains an `<iframe>` that renders the report component with its own stylesheet
- Scrollable if the report exceeds the visible area
- When scope is "All Trials" or "All Classes", the preview shows all pages (scrollable), with visual page breaks between reports

### Empty / Loading States

- **No show selected:** "Select a show to generate reports"
- **No data for scope:** "No entries found for this selection"
- **Loading:** Skeleton in preview area while data fetches
- **Report type not yet available (Phase 2):** Disabled in dropdown with "(Coming Soon)" suffix

## Report Registry

A centralized array of report definitions that drives the entire UI. Adding a new report type means adding one entry to the array and building its component — the controls bar, scope cascading, batch mode, and print infrastructure require no changes. The `category` field can expand beyond `'operational' | 'organization'` to support new optgroups in the dropdown (e.g., `'premium'` for subscription-gated reports, or additional categories as the report library grows).

```typescript
interface ReportSortOption {
  value: string;
  label: string;
}

interface ReportDefinition {
  id: string;
  name: string;
  category: 'operational' | 'organization';
  scopes: ('show' | 'trial' | 'class')[];
  sortOptions: ReportSortOption[];
  defaultSort: string;
  component: React.ComponentType<ReportProps>;
  enabled: boolean; // false for Phase 2 stubs
}
```

### Phase 1 Registry

| ID               | Name           | Category    | Scopes       | Sort Options         | Default Sort |
| ---------------- | -------------- | ----------- | ------------ | -------------------- | ------------ |
| `check-in-sheet` | Check-in Sheet | operational | trial, class | Run Order, Armband # | Run Order    |
| `scoresheet`     | Score Sheet    | operational | trial, class | Run Order, Armband # | Run Order    |
| `results-sheet`  | Results Sheet  | operational | trial, class | Placement, Armband # | Placement    |

### Phase 2 Registry (stubs, `enabled: false`)

| ID                       | Name                         | Category     | Scopes      | Sort Options                       | Default Sort |
| ------------------------ | ---------------------------- | ------------ | ----------- | ---------------------------------- | ------------ |
| `show-catalog`           | Show Catalog                 | operational  | show, trial | Armband #, Handler Name, Breed     | Armband #    |
| `result-catalog`         | Result Catalog               | operational  | show, trial | Placement, Armband #, Handler Name | Placement    |
| `judges-schedule`        | Judge's Schedule             | operational  | show        | Trial Date, Judge Name             | Trial Date   |
| `trial-secretary-report` | Trial Secretary Report       | organization | trial       | (none — fixed layout)              | —            |
| `judges-certification`   | Judge's Certification Report | organization | trial       | (none — fixed layout)              | —            |
| `trial-chairman-report`  | Trial Chairman Report        | organization | trial       | (none — fixed layout)              | —            |

## Scope Cascading Logic

```
Report type selected
  → Read report.scopes to determine which dropdowns to show
  → If 'show' only: hide Trial and Class dropdowns
  → If 'trial' in scopes: show Trial dropdown
      → "All Trials" selected:
          If 'class' in scopes: Class defaults to "All Classes", disabled
          Else: Class hidden
      → Specific trial selected:
          If 'class' in scopes: Class dropdown shows classes in that trial + "All Classes"
          Else: Class hidden
  → If 'class' in scopes but 'trial' not in scopes: (unlikely, but handled)
      Show Class dropdown with all classes in show
```

When "All Trials" or "All Classes" is selected, the engine iterates over each child item, renders a report for each, and concatenates them in the iframe with `page-break-before: always` between each report.

## Report Component Contract

Every report component receives the same props shape:

```typescript
interface ReportProps {
  show: DbShow;
  trial?: DbTrial; // absent for show-scoped reports
  classData?: DbClass; // absent for show/trial-scoped reports
  entries: DbEntry[];
  sortOrder: string;
  // Joined data
  judgeName?: string;
  trialDate?: string;
  trialNumber?: string;
}
```

For class-scoped reports, all fields are populated. For trial-scoped reports, `classData` is absent. For show-scoped reports, both `trial` and `classData` are absent. In batch mode (multiple trials or classes), the engine calls the component once per trial/class with the appropriate subset of data.

## Iframe Preview Rendering

### How It Works

1. `ReportPreview` component creates an `<iframe>` ref
2. On data change, it renders the report component(s) to HTML via `ReactDOMServer.renderToStaticMarkup()`
3. Wraps the HTML in a complete document with a dedicated print stylesheet
4. Writes to the iframe: `iframe.contentDocument.write(html)`
5. For batch mode, concatenates multiple rendered reports with `<div style="page-break-before: always">` between them

### Print Stylesheet

A dedicated CSS file (`reportStyles.css`) whose contents are inlined into the iframe document via a `<style>` tag (file URLs don't work in dynamically written iframes). Contains:

- `@page { size: letter; margin: 0.5in; }` — standard letter paper with half-inch margins
- Table styles with borders, alternating row backgrounds
- Report header/footer formatting
- Color preservation for print: `-webkit-print-color-adjust: exact; print-color-adjust: exact;`
- No app chrome — the iframe only contains the report

### Print Trigger

The Print button calls `iframeRef.current.contentWindow.print()`. This opens the browser's native print dialog scoped to the iframe content only. The secretary can print or choose "Save as PDF".

## Data Fetching

A `useReportData` hook that takes the current selections and returns the data needed for the report.

```typescript
function useReportData(options: {
  showId: string;
  trialId: string | 'all';
  classId: string | 'all';
  reportType: string;
}): {
  data: ReportDataSet | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};
```

**ReportDataSet** contains the show, trials, classes, entries, and joined metadata (judge names, etc.) needed by any report component. The hook uses existing React Query hooks internally:

- `useShowQuery(showId)` for show data
- `useShowTrials(showId)` for trial list
- `useClassesByTrialQuery(trialId)` for class list
- `useEntriesByClassQuery(classId)` or `useEntriesByShowQuery(showId)` for entries

For batch mode ("All Trials" or "All Classes"), the hook fetches all children and groups the data accordingly.

## New Files

| File                                                    | Purpose                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/pages/secretary/ReportsPage/index.tsx`             | Page component — header with show selector, controls bar, preview         |
| `src/pages/secretary/ReportsPage/ReportControlsBar.tsx` | 4 dropdowns + Print button, reads from registry                           |
| `src/pages/secretary/ReportsPage/ReportPreview.tsx`     | Iframe-based WYSIWYG preview, handles batch rendering                     |
| `src/lib/reports/reportRegistry.ts`                     | Array of ReportDefinition objects                                         |
| `src/lib/reports/types.ts`                              | ReportDefinition, ReportProps, ReportSortOption types                     |
| `src/lib/reports/reportStyles.css`                      | Dedicated print stylesheet for iframe                                     |
| `src/lib/reports/reportRenderer.ts`                     | Utility: renders report component(s) to HTML, handles batch concatenation |
| `src/components/reports/CheckInSheet.tsx`               | Check-in sheet report component (ported from myK9Q)                       |
| `src/components/reports/ScoresheetReport.tsx`           | Scoresheet report component (ported from myK9Q)                           |
| `src/components/reports/ResultsSheet.tsx`               | Results sheet report component (ported from myK9Q)                        |
| `src/hooks/queries/useReportData.ts`                    | Data fetching hook for reports                                            |

## Modified Files

| File                                                    | Change                                   |
| ------------------------------------------------------- | ---------------------------------------- |
| `src/routes/secretaryRoutes.tsx`                        | Add `/secretary/reports` route           |
| `src/components/layout/sidebar/unifiedSidebarConfig.ts` | Add "Reports" entry under Manage section |
| `src/lib/queryClient.ts`                                | Add `reports` query key factory          |

## Porting from myK9Q

The 3 report components are ported from myK9Q but adapted for myK9Show:

1. **CheckInSheet** — source: `apps/myk9q/src/components/reports/CheckInSheet.tsx`. Port the JSX structure. Replace myK9Q's `Entry` type with `DbEntry` field mappings. Replace inline CSS class names with classes from `reportStyles.css`.

2. **ScoresheetReport** — source: `apps/myk9q/src/components/reports/ScoresheetReport.tsx`. Same porting approach. The scoresheet has class requirements (hides, distractions) that may need a query to `class_requirements` if not available on the `DbClass` type.

3. **ResultsSheet** — source: `apps/myk9q/src/components/reports/ResultsSheet.tsx`. Same porting approach. Filters to scored entries only. Sorts by placement (qualified first, then NQ/Absent/Excused).

**Utility functions** from `apps/myk9q/src/components/reports/reportUtils.ts` (formatting, sorting, result status helpers) should be extracted into `src/lib/reports/reportUtils.ts` in myK9Show.

## Testing

### Unit Tests

| Test File                                                              | Covers                                                                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/lib/reports/__tests__/reportRegistry.test.ts`                     | Registry integrity: all entries have valid scopes, sort options, enabled flags                 |
| `src/lib/reports/__tests__/reportRenderer.test.ts`                     | HTML generation, batch concatenation with page breaks                                          |
| `src/lib/reports/__tests__/reportUtils.test.ts`                        | Formatting (dates, times, time limits), sorting (run order, armband, placement), result status |
| `src/components/reports/__tests__/CheckInSheet.test.tsx`               | Renders correct columns, respects sort order, handles empty entries                            |
| `src/components/reports/__tests__/ScoresheetReport.test.tsx`           | Renders scoring fields, time boxes, section badges                                             |
| `src/components/reports/__tests__/ResultsSheet.test.tsx`               | Filters to scored entries, placement sort, qualification status                                |
| `src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx` | Dropdown population from registry, cascading scope logic, disabled states                      |
| `src/pages/secretary/ReportsPage/__tests__/ReportsPage.test.tsx`       | Full page render, show selector, control changes update preview                                |
| `src/hooks/queries/__tests__/useReportData.test.ts`                    | Data fetching for single/batch scopes, loading/error states                                    |

### Integration Tests

- Select report type, verify scope dropdowns update
- Select "All Trials", verify class dropdown disables
- Change trial, verify class dropdown filters
- Print button triggers iframe print (mock `contentWindow.print`)

## Future Enhancements (Phase 2, Out of Scope for Phase 1)

- 6 additional report types from Access application (see Phase 2 registry stubs above)
- Screenshots of Access reports will define layouts for Phase 2
- Direct PDF download button (if "Save as PDF" via print dialog proves cumbersome)
- Report favorites / recently used
- Batch print queue (generate multiple report types in sequence)
