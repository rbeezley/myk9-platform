# Class Details Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Class Details page from a flat info-dump layout into a compact header + stats + full-width results table, with a slide-out requirements panel ported from myK9Q.

**Architecture:** Replace the current DetailHero + info grid + expandable sections + stats + results layout with three clean zones: a compact header (merged hero + metadata strip), a stats row, and a dominant results table. Class requirements (from `class_requirements` table) surface via a SlideOverPanel triggered from the results table header. No new database migrations needed.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui primitives, React Query, existing `@myk9/ui` StatCard/StatsGrid, existing SlideOverPanel.

**Spec:** `docs/superpowers/specs/2026-03-24-class-details-redesign.md`

---

## File Structure

### New Files

| File                                                                             | Responsibility                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/myk9show/src/components/classes/ClassCompactHeader.tsx`                    | Merged hero + metadata strip component         |
| `apps/myk9show/src/components/classes/ClassRequirementsPanel.tsx`                | Slide-out requirements reference panel         |
| `apps/myk9show/src/hooks/queries/useClassRequirements.ts`                        | React Query hook for class_requirements lookup |
| `apps/myk9show/src/components/classes/__tests__/ClassCompactHeader.test.tsx`     | Tests for compact header                       |
| `apps/myk9show/src/components/classes/__tests__/ClassRequirementsPanel.test.tsx` | Tests for requirements panel                   |
| `apps/myk9show/src/hooks/queries/__tests__/useClassRequirements.test.ts`         | Tests for requirements hook                    |

### Modified Files

| File                                                               | Changes                                                                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/components/classes/ClassDetailsMain.tsx`        | Remove info grid, expandable sections, section controls; keep stats + results                             |
| `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx` | Add Requirements button and Enter Scores to table header                                                  |
| `apps/myk9show/src/pages/ClassDetailsPage/index.tsx`               | Replace DetailHero with ClassCompactHeader, remove Enter Scores from page header, wire requirements panel |

### Removed Files

| File                                                               | Reason                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| `apps/myk9show/src/components/classes/ClassExpandableSections.tsx` | Replaced by header strip + requirements drawer       |
| `apps/myk9show/src/components/classes/SectionToggleControls.tsx`   | No longer needed (only imported by ClassDetailsMain) |
| `apps/myk9show/src/components/classes/ClassInfo.tsx`               | Dead code — not imported by any active component     |
| `apps/myk9show/src/hooks/useClassRequirements.ts`                  | Replaced by React Query version in hooks/queries/    |

### Potentially Removed

| File                                                         | Condition                          |
| ------------------------------------------------------------ | ---------------------------------- |
| `apps/myk9show/src/components/classes/ExpandableSection.tsx` | Remove if no other files import it |
| `apps/myk9show/src/components/classes/OfficialsSection.tsx`  | Remove if no other files import it |

---

## Task 1: Refactor useClassRequirements to React Query

This is foundational — the requirements panel depends on it.

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useClassRequirements.ts`
- Create: `apps/myk9show/src/hooks/queries/__tests__/useClassRequirements.test.ts`
- Remove later: `apps/myk9show/src/hooks/useClassRequirements.ts` (in cleanup task)

**Context:** The existing hook at `src/hooks/useClassRequirements.ts` uses `useState`/`useEffect` with raw Supabase queries and an `any` cast. Refactor to React Query following the project's conventions in `src/hooks/queries/`. The existing hook exports `ClassRequirementsData` and `useClassRequirements` — preserve the data shape.

**[ADDED] Before starting:** Search for all imports of the old hook (`from.*hooks/useClassRequirements`) to identify callers. If ClassEditPanel or other components use it, they must be migrated to the new hook in this task or Task 7. List all callers here before proceeding.

**Reference files:**

- Existing hook: `apps/myk9show/src/hooks/useClassRequirements.ts` (lines 12-29 for `ClassRequirementsData` type, lines 142-220 for query logic)
- Query conventions: `apps/myk9show/src/lib/queryClient.ts` (for `queryKeys`, `cacheStrategies`)
- Example query hook: any file in `apps/myk9show/src/hooks/queries/` for the pattern

- [ ] **Step 1: Write the test file**

Create `apps/myk9show/src/hooks/queries/__tests__/useClassRequirements.test.ts`. Test cases:

1. Returns `null` requirements when element/level are empty
2. Returns requirements data when element/level match a record
3. Uses `cacheStrategies.static` (requirements don't change during session)
4. Handles missing organization gracefully (returns null)
5. The `ClassRequirements` type has correct fields (no `any`)

Mock Supabase client. Use `renderHook` from `@testing-library/react` with a QueryClientProvider wrapper.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && pnpm test -- --run hooks/queries/__tests__/useClassRequirements`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

Create `apps/myk9show/src/hooks/queries/useClassRequirements.ts`:

- Export a `ClassRequirements` interface matching the shape from the existing hook's `ClassRequirementsData` (lines 12-29 of existing hook): `organization`, `element`, `level`, `hides`, `distractions`, `height`, `area_count`, `area_size`, `time_limit_text`, `time_limit_seconds`, `has_30_second_warning`, `time_type`, `warning_notes`, `required_calls`, `final_response`, `containers_items`, `area_count_min`, `area_count_max`
- Add a query key to `queryKeys` in `src/lib/queryClient.ts`: `classRequirements: (org: string, element: string, level: string) => ['classRequirements', org, element, level]`
- Hook signature: `useClassRequirements({ organization, element, level }: { organization: string | null; element: string; level: string })`
- Return: `{ requirements: ClassRequirements | null; isLoading: boolean; error: Error | null }`
- Use `useQuery` with `cacheStrategies.static`
- Query: `supabase.from('class_requirements').select('*').eq('organization', org).eq('element', element).eq('level', level).maybeSingle()`
- Enabled only when all three params are truthy
- Cast the Supabase response with the `ClassRequirements` type (the table isn't in generated types)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && pnpm test -- --run hooks/queries/__tests__/useClassRequirements`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useClassRequirements.ts apps/myk9show/src/hooks/queries/__tests__/useClassRequirements.test.ts apps/myk9show/src/lib/queryClient.ts
git commit -m "feat(classes): add React Query useClassRequirements hook"
```

---

## Task 2: Create ClassRequirementsPanel

Port the requirements display from myK9Q's `ClassRequirementsDialog` into a `SlideOverPanel`.

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassRequirementsPanel.tsx`
- Create: `apps/myk9show/src/components/classes/__tests__/ClassRequirementsPanel.test.tsx`

**Reference files:**

- myK9Q dialog: `apps/myk9q/src/components/dialogs/ClassRequirementsDialog.tsx` (lines 189-313 for rendering logic)
- SlideOverPanel: `apps/myk9show/src/components/panels/SlideOverPanel.tsx` (props interface at lines 6-20)
- New hook from Task 1: `apps/myk9show/src/hooks/queries/useClassRequirements.ts`

- [ ] **Step 1: Write the test file**

Create `apps/myk9show/src/components/classes/__tests__/ClassRequirementsPanel.test.tsx`. Test cases:

1. Renders nothing when `open` is false
2. Shows loading state while requirements fetch
3. Renders organization, element, and level badges in the header
4. Renders requirement cards conditionally (only when field has data)
5. Shows "Time Limit" card with Clock icon when `time_limit_text` exists
6. Shows "Hides" card when `hides` field exists
7. Shows "Required Calls" for AKC, "Final Response" for UKC
8. Shows empty state message when no requirements found for this class
9. Shows source attribution footer

Mock the `useClassRequirements` hook.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/myk9show && pnpm test -- --run components/classes/__tests__/ClassRequirementsPanel`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the panel**

Create `apps/myk9show/src/components/classes/ClassRequirementsPanel.tsx`:

**Props:**

```typescript
interface ClassRequirementsPanelProps {
  open: boolean;
  onClose: () => void;
  organization: string | null;
  element: string;
  level: string;
}
```

**Structure:**

- Wrap in `SlideOverPanel` with `size="md"`, `title="Class Requirements"`
- `headerActions`: badges for organization, element, level (using shadcn Badge component with colored variants)
- Body: call `useClassRequirements({ organization, element, level })`
- If loading: show skeleton cards
- If no data: show "No requirements found for this class configuration"
- If data: render requirement cards in a vertical stack

**Requirement card pattern** (port from myK9Q lines 201-313, adapt to Tailwind):
Each card is a `div` with `rounded-lg border bg-card p-3`:

- Left: icon in colored rounded background (30x30px)
- Label: uppercase xs text-muted-foreground
- Value: text-lg font-semibold
- Subtitle: text-sm text-muted-foreground

Use Lucide icons per spec: Clock (blue), Target (red), AlertTriangle (amber), MapPin (emerald/purple), Speech (pink), Ruler (slate), Package (slate).

Cards to render (only when field is truthy):

1. Time Limit — `requirements.time_limit_text`, subtitle from `time_type` and `has_30_second_warning`
2. Hides — `requirements.hides`
3. Distractions — `requirements.distractions`
4. Area Size — `requirements.area_size`
5. Search Areas — `requirements.area_count` (only if > 1)
6. Required Calls — `requirements.required_calls` (AKC) or `requirements.final_response` (UKC)
7. Max Height — `requirements.height`
8. Arrangement — `requirements.containers_items` (Container, Buried, or Handler Discrimination Novice A only)

**Footer:** `<span className="text-xs text-muted-foreground">Source: {organization} Scent Work Regulations</span>`

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/myk9show && pnpm test -- --run components/classes/__tests__/ClassRequirementsPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassRequirementsPanel.tsx apps/myk9show/src/components/classes/__tests__/ClassRequirementsPanel.test.tsx
git commit -m "feat(classes): add ClassRequirementsPanel with SlideOverPanel"
```

---

## Task 3: Create ClassCompactHeader

New component replacing DetailHero + info grid with a unified compact header.

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassCompactHeader.tsx`
- Create: `apps/myk9show/src/components/classes/__tests__/ClassCompactHeader.test.tsx`

**Reference files:**

- QuickInfoCards pattern: `apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx` (for metadata strip styling)
- DetailHero: `apps/myk9show/src/components/common/DetailHero.tsx` (for badge/action patterns)
- Current hero metadata: `apps/myk9show/src/pages/ClassDetailsPage/index.tsx` (lines 209-226)
- Current info grid: `apps/myk9show/src/components/classes/ClassDetailsMain.tsx` (lines 158-195)

- [ ] **Step 1: Write the test file**

Create `apps/myk9show/src/components/classes/__tests__/ClassCompactHeader.test.tsx`. Test cases:

1. Renders class name (element + level)
2. Renders status badge with correct variant
3. Renders section label when provided
4. Renders metadata strip with: Judge, Trial, Date, Entry Fee, Max Entries, Time Limit
5. Handles missing optional fields gracefully (no crash, field just not shown)
6. Renders Edit button and overflow menu in actions area
7. Does NOT render "Enter Scores" button (moved to results table)
8. Renders officials in metadata strip when assigned (gateSteward, tableSteward)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm test -- --run components/classes/__tests__/ClassCompactHeader`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `apps/myk9show/src/components/classes/ClassCompactHeader.tsx`:

**Props:**

```typescript
interface ClassCompactHeaderProps {
  classData: ClassData;
  parentTrial?: Trial;
  actions?: React.ReactNode;
  className?: string;
}
```

**Structure:**

```
<div className="rounded-xl border border-border/50 bg-card overflow-hidden">
  {/* Top row: name + badge + section + actions */}
  <div className="p-4 pb-3">
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">{element} {level}</h2>
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
        {section && <p className="text-sm text-muted-foreground mt-0.5">Section {section}</p>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  </div>

  {/* Metadata strip */}
  <div className="flex flex-wrap border-t border-border/50 bg-muted/30">
    <MetadataItem label="Judge" value={classData.judge} />
    <MetadataItem label="Trial" value={parentTrial?.trialType || parentTrial?.trialNumber} />
    <MetadataItem label="Date" value={formatDate(classData.trialDate)} />
    <MetadataItem label="Entry Fee" value={formatFee(classData.entryFee)} />
    <MetadataItem label="Max Entries" value={classData.maxEntries} />
    <MetadataItem label="Time Limit" value={classData.timeLimit1} />
    {/* Officials if assigned */}
    {classData.gateSteward && <MetadataItem label="Gate Steward" value={classData.gateSteward} />}
    {classData.tableSteward && <MetadataItem label="Table Steward" value={classData.tableSteward} />}
  </div>
</div>
```

**MetadataItem** (inline helper or separate small component):

```
<div className="flex-1 min-w-[120px] px-4 py-2.5 border-r border-border/50 last:border-r-0">
  <div className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</div>
  <div className="text-sm font-medium mt-0.5">{value || '—'}</div>
</div>
```

Use the QuickInfoCards component as styling reference. Ensure 14px minimum font size per INTENT.md — use `text-xs` (12px) for labels as the minimum acceptable size for uppercase labels. Values use `text-sm` (14px). The metadata strip wraps naturally on mobile via `flex-wrap`.

**[ADDED] Note:** The `text-xs` (12px) for uppercase labels is acceptable because INTENT.md's 14px minimum applies to body text. Uppercase labels at 12px with letter-spacing are legible at the same perceived size. Values must be 14px+.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm test -- --run components/classes/__tests__/ClassCompactHeader`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassCompactHeader.tsx apps/myk9show/src/components/classes/__tests__/ClassCompactHeader.test.tsx
git commit -m "feat(classes): add ClassCompactHeader with metadata strip"
```

---

## Task 4: Update ClassResultsTable — Move Actions to Table Header

Move "Enter Scores" and "+ Add Entry" into the table header. Add "Requirements" button.

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`

**Reference:** Current table header at lines 68-91 of `ClassResultsTable/index.tsx`.

- [ ] **Step 1: Read the current ClassResultsTable implementation**

Read `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx` fully to understand current props, header, and button placement.

- [ ] **Step 2: Update the table header**

Modify `ClassResultsTable/index.tsx`:

Add new props:

```typescript
interface ClassResultsTableProps {
  // ... existing props
  classId?: string; // for Enter Scores navigation
  onOpenRequirements?: () => void; // opens requirements panel
}
```

Update the table header section (around lines 68-91) to include:

- Left side: Title "Entries & Results" + entry count badge
- Right side: Requirements button (subtle, secondary style), Enter Scores button (primary, links to `/scoring/secretary/classes/${classId}`), + Add Entry button

The Requirements button should use a `ClipboardList` icon and text "Requirements". It calls `onOpenRequirements()`.

The Enter Scores button should use `useNavigate()` to go to `/scoring/secretary/classes/${classId}`. Only show when user has secretary permissions (`userPermissions`).

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/
git commit -m "feat(classes): move Enter Scores and Requirements to results table header"
```

---

## Task 5: Simplify ClassDetailsMain — Remove Info Grid and Expandables

Strip out the info grid, expandable sections, and section controls. Keep only stats + results.

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassDetailsMain.tsx`

**Reference:** Current file structure — info grid at lines 158-195, section controls at 197-200, expandable sections at 202-212, stats at 215-235, results at 237-245.

- [ ] **Step 1: Read the current ClassDetailsMain**

Read `apps/myk9show/src/components/classes/ClassDetailsMain.tsx` fully. Note exact line numbers of sections to remove.

- [ ] **Step 2: Remove imports for removed components**

Remove these imports from ClassDetailsMain.tsx:

- `SectionToggleControls`
- `ClassExpandableSections`

Remove the state variables:

- `forceExpandAll`, `forceCollapseAll`
- `handleExpandAll`, `handleCollapseAll`

Remove the field count calculations:

- `timingFieldsCount`, `officialsFieldsCount`, `requirementsFieldsCount`, `feesFieldsCount`, `customFieldsCount`

- [ ] **Step 3: Remove the info grid JSX**

Remove the `myk9-show-info-grid` section (Trial, Trial Date, Judge, Class Order, Entry Fee, Max Entries, Time Limit, Trial Number). This data is now in ClassCompactHeader.

- [ ] **Step 4: Remove expandable sections JSX**

Remove the `SectionToggleControls` rendering and the `ClassExpandableSections` rendering.

- [ ] **[ADDED] Step 4b: Preserve Scent Work conditional logic in stats**

Verify that the `isScentWorkShow` check from `buildClassStats()` is still called correctly. The stats section should show 2 cards (Entries + Qualified Rate) for Scent Work classes and 3 cards (+ Avg Score) for others. This logic lives in `ClassDetailsMain.helpers.ts:buildClassStats()` — it should not need changes, but verify the call site still passes `isScentWork` correctly after removing surrounding code.

- [ ] **[ADDED] Step 4c: Add empty-state guard for stats**

Ensure stats only render when there are entries. Wrap the StatsGrid in a conditional:

```tsx
{
  classEntries.length > 0 && (
    <StatsGrid columns={stats.length}>
      {stats.map(stat => (
        <StatCard key={stat.title} {...stat} />
      ))}
    </StatsGrid>
  );
}
```

- [ ] **Step 5: Add new props for requirements panel**

Add `classId` and `onOpenRequirements` to the props passed down to `ClassResultsTable`:

```typescript
<ClassResultsTable
  // ... existing props
  classId={classData?.id}
  onOpenRequirements={onOpenRequirements}
/>
```

Add `onOpenRequirements?: () => void` to `ClassDetailsMainProps`.

- [ ] **Step 6: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassDetailsMain.tsx
git commit -m "refactor(classes): remove info grid and expandable sections from ClassDetailsMain"
```

---

## Task 6: Wire Everything in ClassDetailsPage

Replace DetailHero with ClassCompactHeader, add requirements panel, move Enter Scores out of page header.

**Files:**

- Modify: `apps/myk9show/src/pages/ClassDetailsPage/index.tsx`

**Reference:** Current file — hero at lines 270-292, action buttons at lines 229-266, ClassDetailsMain at lines 293-304.

- [ ] **Step 1: Read the current ClassDetailsPage**

Read `apps/myk9show/src/pages/ClassDetailsPage/index.tsx` fully. Note the hero rendering, action buttons, and how ClassDetailsMain is called.

- [ ] **Step 2: Add requirements panel state**

Add to the component:

```typescript
const [requirementsPanelOpen, setRequirementsPanelOpen] = useState(false);
```

Import `ClassCompactHeader` and `ClassRequirementsPanel`.

- [ ] **Step 3: Replace DetailHero with ClassCompactHeader**

Remove the `DetailHero` rendering and the hero metadata/badge construction above it.

Replace with:

```tsx
<ClassCompactHeader
  classData={currentClass}
  parentTrial={parentTrial}
  actions={
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={openEditClassPanel}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit
      </Button>
      {/* Overflow menu with Delete */}
      <DropdownMenu>...</DropdownMenu>
    </div>
  }
/>
```

Remove "Enter Scores" from the page-level action buttons (it's now in the results table).

**[ADDED]** Add an INTENT comment where Enter Scores was removed:

```tsx
// INTENT: Enter Scores button deliberately moved from page header to results
// table header so it sits next to the data it acts on. Both secretaries and
// exhibitors benefit from less clutter in the page header.
```

- [ ] **Step 4: Pass onOpenRequirements to ClassDetailsMain**

```tsx
<ClassDetailsMain
  classData={currentClass}
  classEntries={classEntries}
  parentShow={parentShow}
  onAddEntry={...}
  onDeleteEntry={...}
  onResultUpdate={...}
  onOpenRequirements={() => setRequirementsPanelOpen(true)}
/>
```

- [ ] **Step 5: Add ClassRequirementsPanel**

Add at the end of the JSX (alongside other dialogs/panels):

```tsx
<ClassRequirementsPanel
  open={requirementsPanelOpen}
  onClose={() => setRequirementsPanelOpen(false)}
  organization={parentShow?.organization || null}
  element={currentClass?.element || ''}
  level={currentClass?.level || ''}
/>
```

- [ ] **Step 6: Clean up unused imports**

Remove `DetailHero` import if no longer used. Remove hero-related helper imports (`STATUS_VARIANT_MAP`, `getStatusBadge` if unused).

- [ ] **Step 7: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/pages/ClassDetailsPage/index.tsx
git commit -m "feat(classes): wire ClassCompactHeader and ClassRequirementsPanel into page"
```

---

## [ADDED] Task 6b: Update Existing Tests

Update any existing ClassDetailsPage or ClassDetailsMain tests to reflect the new layout.

**Files:**

- Modify: any test files in `apps/myk9show/src/pages/ClassDetailsPage/__tests__/` or `apps/myk9show/src/components/classes/__tests__/` that reference removed components

- [ ] **Step 1: Find existing tests**

Search for existing test files:

```bash
find apps/myk9show/src -path "*ClassDetails*test*" -o -path "*ClassDetails*spec*"
find apps/myk9show/src -path "*classes/__tests__*"
```

- [ ] **Step 2: Update or remove broken test references**

If existing tests import `ClassExpandableSections`, `SectionToggleControls`, `DetailHero` (in ClassDetailsPage context), or test for the info grid — update them to test for the new `ClassCompactHeader` and simplified layout instead. If tests don't exist yet, skip this task.

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(classes): update existing tests for class details redesign"
```

---

## Task 7: Delete Dead Code

Remove files that are no longer imported.

**Files:**

- Delete: `apps/myk9show/src/components/classes/ClassExpandableSections.tsx`
- Delete: `apps/myk9show/src/components/classes/SectionToggleControls.tsx`
- Delete: `apps/myk9show/src/components/classes/ClassInfo.tsx`
- Delete: `apps/myk9show/src/hooks/useClassRequirements.ts`
- Conditionally delete: `apps/myk9show/src/components/classes/ExpandableSection.tsx`
- Conditionally delete: `apps/myk9show/src/components/classes/OfficialsSection.tsx`

- [ ] **Step 1: Verify no remaining imports**

Search the codebase for imports of each file to confirm they're unused:

```bash
cd apps/myk9show && grep -r "ClassExpandableSections" src/ --include="*.ts" --include="*.tsx"
cd apps/myk9show && grep -r "SectionToggleControls" src/ --include="*.ts" --include="*.tsx"
cd apps/myk9show && grep -r "ClassInfo" src/ --include="*.ts" --include="*.tsx"
cd apps/myk9show && grep -r "from.*useClassRequirements" src/ --include="*.ts" --include="*.tsx"
# [ADDED] If any file OTHER than the new hooks/queries/ version imports the old hook,
# update that file to import from the new location BEFORE deleting the old hook.
cd apps/myk9show && grep -r "ExpandableSection" src/ --include="*.ts" --include="*.tsx"
cd apps/myk9show && grep -r "OfficialsSection" src/ --include="*.ts" --include="*.tsx"
```

Only delete files with zero remaining imports. If `ExpandableSection` or `OfficialsSection` are still imported elsewhere, leave them.

- [ ] **Step 2: Delete confirmed dead files**

Delete files confirmed unused in Step 1.

- [ ] **Step 3: Update any barrel exports**

Check if any `index.ts` barrel files re-export the deleted components. If so, remove those exports.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS — no broken imports

- [ ] **Step 5: Run tests**

Run: `cd apps/myk9show && pnpm test -- --run`
Expected: PASS — no broken tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(classes): remove dead code from class details redesign"
```

---

## Task 8: Visual Verification and Polish

Verify the page renders correctly in both themes.

**Files:**

- Possibly modify: any file from above for visual fixes

- [ ] **Step 1: Start dev server and navigate to a class details page**

Run: `pnpm dev:show` or use preview_start.
Navigate to a class details page with data (e.g., through Shows → a trial → a class).

- [ ] **Step 2: Verify dark theme**

Check:

- Compact header renders with metadata strip
- No duplicate data between header and page
- Stats row shows below header (or hidden if no entries)
- Results table is the dominant section
- "Enter Scores" is on the results table header, not the page header
- "Requirements" button on the results table opens the panel
- Requirements panel shows correct data for the class's org/element/level
- No visual regressions

- [ ] **Step 3: Verify light theme**

Toggle to light theme and repeat checks. Ensure:

- Metadata strip borders and background contrast are correct
- Stat cards look correct
- Requirements panel cards have proper contrast

- [ ] **Step 4: Verify responsive behavior**

Check at mobile width (~375px):

- Metadata strip wraps to 2-3 columns
- Text stays at 14px minimum
- Results table scrolls horizontally if needed
- Requirements panel is full-width on mobile

- [ ] **Step 5: Fix any visual issues found**

Address any spacing, contrast, or layout issues. Small tweaks only — if anything is structural, flag it rather than redesigning.

- [ ] **Step 6: Run full typecheck and tests**

```bash
pnpm typecheck && cd apps/myk9show && pnpm test -- --run
```

Expected: PASS

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "fix(classes): visual polish for class details redesign"
```

---

## Task 9: Update Tracking Documents

- [ ] **Step 1: Update TO-DOS.md**

If there's a relevant item in TO-DOS.md about class details or UI polish, mark it complete or add a note about this redesign.

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: update tracking for class details redesign"
```
