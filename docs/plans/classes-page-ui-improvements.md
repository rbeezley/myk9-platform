# Classes Page UI Improvements - Implementation Plan

## Overview

This plan addresses UI/UX improvements for the Classes page based on the analysis in `docs/Classes page UI Improvement.md`. All issues have been verified as still present in the codebase.

## Phase 1: Critical Fixes (Immediate)

### 1.1 Remove Debug Button from Production

**File:** `apps/myk9show/src/pages/ClassDetailsPage.tsx`

**Current state (lines 404-418):**
```tsx
{/* Temporary debug button */}
<div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 9999 }}>
  <button onClick={forceReinitializeEntries} style={{ background: 'red', ... }}>
    🧹 Clear Entries
  </button>
</div>
```

**Action:** Remove the entire debug button block or wrap it in a development-only condition.

**Implementation:**
- Option A: Delete lines 404-419 entirely (recommended)
- Option B: Wrap with `{import.meta.env.DEV && (...)}` if needed for debugging

**Tests:**
- E2E test: Verify no debug button visible in production build
- Visual regression: Screenshot comparison of ClassDetailsPage

---

### 1.2 Implement Stub Functions in ClassManagementPage

**File:** `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`

**Current state (lines 40-46):**
```tsx
const updateClassStatus = (classId: string, status: string) => {
  logger.debug('updateClassStatus called with:', 'secretary', { data: classId, status });
};

const deleteClass = (classId: string) => {
  logger.debug('deleteClass called with:', 'secretary', { data: classId });
};
```

**Implementation:**
1. Import `useClassCreationStore` actions for `updateClassStatus` and `deleteClass`
2. Replace stub functions with actual store operations
3. Add toast notifications for success/error feedback

**Tests:**
- Unit test: `updateClassStatus` correctly updates class status in store
- Unit test: `deleteClass` removes class from store
- E2E test: Status change via dropdown persists after page reload
- E2E test: Delete class confirmation and removal

---

## Phase 2: Standardize Status Terminology

### 2.1 Define Canonical Status Values

**Create:** `packages/core/src/constants/class-status.ts`

```typescript
export const CLASS_STATUS = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
} as const;

export type ClassStatus = typeof CLASS_STATUS[keyof typeof CLASS_STATUS];

export const STATUS_DISPLAY = {
  [CLASS_STATUS.SCHEDULED]: { label: 'Upcoming', color: 'blue' },
  [CLASS_STATUS.IN_PROGRESS]: { label: 'In Progress', color: 'amber' },
  [CLASS_STATUS.COMPLETED]: { label: 'Complete', color: 'green' },
  [CLASS_STATUS.CANCELLED]: { label: 'Cancelled', color: 'gray' },
} as const;
```

### 2.2 Update Components to Use Canonical Status

**Files to update:**
1. `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx` - line 71
2. `apps/myk9show/src/components/trials/TrialDetail/TrialClassesTable.tsx` - lines 107-113
3. `apps/myk9show/src/components/classes/ClassDetailsMain.tsx` - lines 201-228
4. `apps/myk9show/src/components/trials/TrialDetail/TrialClassesCards.tsx` - lines 16-29
5. `apps/myk9show/src/pages/ClassDetailsPage.tsx` - line 270

**Tests:**
- Unit test: Status badge displays correct label for each status value
- Unit test: Status colors match specification
- E2E test: Status cycling follows correct order (Scheduled → In Progress → Completed)

---

## Phase 3: Visual Progress Indicators

### 3.1 Add Progress Bar to TrialClassesTable Entry Column

**File:** `apps/myk9show/src/components/trials/TrialDetail/TrialClassesTable.tsx`

**Implementation:**
Add progress visualization below entry count showing completed vs total entries.

```tsx
<TableCell>
  <div className="space-y-1">
    <span>{classItem.entries}</span>
    <div className="w-16 h-1 bg-muted rounded-full">
      <div
        className="h-full bg-primary rounded-full transition-all"
        style={{ width: `${(classItem.completedEntries / classItem.entries) * 100}%` }}
      />
    </div>
  </div>
</TableCell>
```

### 3.2 Fix TrialClassesCards completedCount

**File:** `apps/myk9show/src/components/trials/TrialDetail/TrialClassesCards.tsx`

**Current state (line 103):**
```tsx
completedCount={0} // Not available in TrialClass type
```

**Implementation:**
1. Update `TrialClass` type to include `completedEntries` field
2. Calculate completed count from actual entry data
3. Pass real value to ClassCard component

**Tests:**
- Unit test: Progress bar width calculation is correct
- Unit test: Progress bar handles 0 entries gracefully
- E2E test: Progress bar updates after scoring an entry
- Visual test: Progress bar renders correctly at 0%, 50%, 100%

---

## Phase 4: Information Architecture Improvements

### 4.1 Simplify Expandable Sections

**File:** `apps/myk9show/src/components/classes/ClassDetailsMain.tsx`

**Current:** 5 expandable sections (Timing, Officials, Requirements, Fees, Custom)

**Proposed:** Consolidate to 3 sections:
1. **Class Setup** - Merge Timing + Requirements
2. **Officials** - Keep as is
3. **Fees & Custom** - Merge Fees + Custom (only show if data exists)

**Implementation:**
1. Create new `ClassSetupSection` combining timing and requirements
2. Update section count indicators
3. Hide empty sections entirely (already partially implemented)

**Tests:**
- Unit test: Section headers render correctly
- Unit test: Empty sections are hidden
- E2E test: Expand/collapse all functionality works
- Accessibility test: Sections are keyboard navigable

---

## Phase 5: Empty State Improvements

### 5.1 Enhanced Empty States with Illustrations

**Files:**
- `apps/myk9show/src/components/trials/TrialDetail/TrialClassesTable.tsx`
- `apps/myk9show/src/components/trials/TrialDetail/TrialClassesCards.tsx`
- `apps/myk9show/src/pages/ClassDetailsPage.tsx`

**Implementation:**
1. Add SVG illustrations or Lucide icon compositions for empty states
2. Add role-based contextual actions
3. Add quick-start guidance text

**Tests:**
- Visual test: Empty state renders correctly
- E2E test: Empty state action buttons navigate correctly
- Accessibility test: Empty state messages are screen-reader friendly

---

## Phase 6: Mobile Responsiveness

### 6.1 Fix 5-Column Grid on Mobile

**File:** `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`

**Current state (line 178):**
```tsx
<div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
```

**Implementation:**
- Change to `grid-cols-2 sm:grid-cols-3 md:grid-cols-5`
- Add proper stacking on mobile

### 6.2 Add Horizontal Scroll Indicator for Tables

**Implementation:**
- Add scroll shadow/gradient indicators
- Consider card-only view on small screens via media query

**Tests:**
- Visual test: Stats grid stacks correctly on mobile
- E2E test: Table is horizontally scrollable on mobile
- Responsive test: Check breakpoints at 320px, 375px, 768px, 1024px

---

## Test Plan Summary

### Unit Tests (Vitest)

| Test File | Tests |
|-----------|-------|
| `ClassManagementPage.test.tsx` | Status update, delete class, bulk operations |
| `TrialClassesTable.test.tsx` | Progress bar calculation, status badge colors |
| `ClassDetailsMain.test.tsx` | Section consolidation, stats calculation |
| `class-status.test.ts` | Status constants, display mapping |

### E2E Tests (Playwright)

| Test File | Tests |
|-----------|-------|
| `classes-page.spec.ts` | No debug button, status cycling, CRUD operations |
| `class-management.spec.ts` | Secretary workflow, bulk actions |
| `classes-mobile.spec.ts` | Responsive layout, touch interactions |

### Visual Regression Tests

| Component | Viewports |
|-----------|-----------|
| ClassDetailsPage | Desktop, Tablet, Mobile |
| ClassManagementPage | Desktop, Tablet, Mobile |
| TrialClassesTable | Desktop |
| TrialClassesCards | Desktop, Mobile |

---

## Implementation Order

1. **Week 1:** Phase 1 (Critical fixes) + Phase 2 (Status standardization)
2. **Week 2:** Phase 3 (Progress indicators) + Phase 4 (Information architecture)
3. **Week 3:** Phase 5 (Empty states) + Phase 6 (Mobile responsiveness)

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `packages/core/src/constants/class-status.ts` | NEW - Status constants |
| `apps/myk9show/src/pages/ClassDetailsPage.tsx` | Remove debug button |
| `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx` | Implement stubs, fix grid |
| `apps/myk9show/src/components/trials/TrialDetail/TrialClassesTable.tsx` | Progress bars, status standardization |
| `apps/myk9show/src/components/trials/TrialDetail/TrialClassesCards.tsx` | Fix completedCount, status mapping |
| `apps/myk9show/src/components/classes/ClassDetailsMain.tsx` | Consolidate sections, status standardization |
| `apps/myk9show/src/components/trials/types/trial.types.ts` | Add completedEntries to TrialClass |

---

## Success Criteria

- [ ] No debug button visible in production
- [ ] All status terminology uses canonical values
- [ ] Status changes persist correctly
- [ ] Delete class functions correctly
- [ ] Progress indicators show real completion data
- [ ] Mobile layout is usable at 375px width
- [ ] All E2E tests pass
- [ ] No accessibility regressions
