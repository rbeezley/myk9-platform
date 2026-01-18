# Trials Page UI Improvements - Implementation Plan

## Executive Summary

Based on review of the UI improvement recommendations and verification against the current codebase, **6 issues remain unaddressed** and require implementation. This plan prioritizes by impact and includes test specifications.

---

## Issues Still Requiring Implementation

| Priority | Issue | Status | Impact | Effort |
|----------|-------|--------|--------|--------|
| **High** | Statistics Cards - Misleading Data | ❌ Exists | User confusion | Medium |
| **High** | Trial Info Card - Remove Order field | ⚠️ Partial | Clarity | Low |
| **Medium** | Trial Navigation (Prev/Next) | ❌ Missing | Efficiency | Low |
| **Medium** | Empty State Enhancement | ⚠️ Minimal | Engagement | Low |
| **Medium** | Classes Table - Search placeholder | ⚠️ Too long | Mobile UX | Low |
| **Medium** | Action Discovery - Edit button | ⚠️ Hidden | Discoverability | Low |
| **Low** | Status Badge Animation | ❌ Missing | Visual feedback | Low |

**Already Addressed:** Collapsed Sidebar tooltips ✓, Add Classes button placement ✓

---

## Phase 1: High Priority (Statistics & Info Card)

### 1.1 Fix Statistics Cards (TrialDetailsMain.tsx)

**Current Problem:**
```typescript
// Shows misleading "percent change" like "+0%", "+75%"
trend: statistics.judges.percentChange >= 0 ? `+${statistics.judges.percentChange}%`
```

**Solution:** Replace trend values with contextually useful information:

| Card | Current | Proposed |
|------|---------|----------|
| Judges | `+0%` | `"2 assigned, 1 pending"` or assignment count |
| Classes | `+75%` | `"3 of 12 completed"` progress text |
| Entries | `+50%` | `"45 checked in"` check-in count |
| Qualified | `+25%` | Only show when `completedClasses > 0` |

**Files to Modify:**
- `apps/myk9show/src/components/trials/TrialDetailsMain.tsx` (lines 73-110)
- `apps/myk9show/src/components/trials/TrialStatistics.tsx` (if separate)

**Implementation:**
```typescript
// Replace trend with contextual subtitle
const statisticsCards = [
  {
    title: 'Judges',
    value: statistics.judges.total.toString(),
    subtitle: `${statistics.judges.assigned} assigned`, // NEW
    icon: Users,
  },
  {
    title: 'Classes',
    value: statistics.classes.total.toString(),
    subtitle: `${statistics.classes.completed} of ${statistics.classes.total} completed`, // NEW
    icon: Grid3X3,
  },
  {
    title: 'Entries',
    value: statistics.entries.total.toString(),
    subtitle: `${statistics.entries.checkedIn} checked in`, // NEW
    icon: ClipboardList,
  },
  // Only show Qualified Rate when there's data
  ...(statistics.classes.completed > 0 ? [{
    title: 'Qualified Rate',
    value: `${statistics.qualifiedRate}%`,
    subtitle: `${statistics.qualified} of ${statistics.entries.scored} scored`, // NEW
    icon: Award,
  }] : []),
];
```

### 1.2 Clean Up Trial Info Card (TrialDetailsMain.tsx)

**Current Problem:** Shows "Order" field (internal use only) and potentially redundant "Event Number"

**Solution:**
- Remove "Order" field entirely
- Keep both Trial Number and Event Number (they serve different purposes in dog show context)
- Consider adding "Total Classes" or "Registration Status" if available

**Files to Modify:**
- `apps/myk9show/src/components/trials/TrialDetailsMain.tsx` (lines 152-188)

---

## Phase 2: Medium Priority (Navigation & UX)

### 2.1 Add Trial Navigation (Prev/Next)

**Current Problem:** No quick navigation between trials - users must use sidebar

**Solution:** Add navigation arrows in trial header

**Files to Modify:**
- `apps/myk9show/src/components/trials/TrialDetailsMain.tsx`
- `apps/myk9show/src/pages/TrialDetailsPage.tsx` (pass prev/next trial IDs)

**Implementation:**
```typescript
// In TrialDetailsMain.tsx header section
<div className="flex items-center gap-2">
  <Button
    variant="ghost"
    size="sm"
    onClick={onPrevTrial}
    disabled={!prevTrialId}
    title="Previous Trial"
  >
    <ChevronLeft className="h-4 w-4" />
  </Button>
  <span className="text-sm text-muted-foreground">
    {currentIndex + 1} of {totalTrials}
  </span>
  <Button
    variant="ghost"
    size="sm"
    onClick={onNextTrial}
    disabled={!nextTrialId}
    title="Next Trial"
  >
    <ChevronRight className="h-4 w-4" />
  </Button>
</div>
```

### 2.2 Enhance Empty State (TrialClassesTable.tsx)

**Current Problem:** Basic text-only empty state

**Solution:** Add illustration and secondary action

**Files to Modify:**
- `apps/myk9show/src/components/trials/TrialClassesTable.tsx` (lines 116-132)

**Implementation:**
```typescript
<div className="text-center py-12">
  {/* Add icon */}
  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
    <Layers className="h-6 w-6 text-muted-foreground" />
  </div>
  <div className="text-muted-foreground mb-6">
    <div className="mb-2 text-lg font-medium">No classes yet</div>
    <div className="text-sm">Add classes to start managing entries and scores</div>
  </div>
  <div className="flex items-center justify-center gap-3">
    <Button onClick={onAddClassesFromTemplate} className="apple-action-button-primary">
      <Plus className="h-4 w-4" />
      Add Classes
    </Button>
    {/* Secondary action */}
    {onImportClasses && (
      <Button variant="outline" onClick={onImportClasses}>
        <FileUp className="h-4 w-4" />
        Import from Trial
      </Button>
    )}
  </div>
</div>
```

### 2.3 Shorten Search Placeholder (TrialClassesTable.tsx)

**Current:** `"Search classes by element, level, section, judge, or status..."`
**Proposed:** `"Search classes..."`

**Files to Modify:**
- `apps/myk9show/src/components/trials/TrialClassesTable.tsx` (line 190)

### 2.4 Surface Edit Button (TrialDetailsMain.tsx)

**Current Problem:** Edit action hidden in dropdown menu

**Solution:** Move Edit to visible icon button, keep Delete in dropdown

**Files to Modify:**
- `apps/myk9show/src/components/trials/TrialDetailsMain.tsx` (lines 129-149)

**Implementation:**
```typescript
<div className="flex items-center gap-2">
  {/* Visible Edit button */}
  <Button variant="ghost" size="sm" onClick={onEdit} title="Edit Trial">
    <Edit className="h-4 w-4" />
  </Button>
  {/* Dropdown for destructive/less common actions */}
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={onDuplicate}>
        <Copy className="mr-2 h-4 w-4" />
        Duplicate Trial
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onDelete} className="text-destructive">
        <Trash2 className="mr-2 h-4 w-4" />
        Delete Trial
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

---

## Phase 3: Low Priority (Visual Polish)

### 3.1 Add Status Badge Animation (apple-show-details.css)

**Current Problem:** "In Progress" status badge is not visually prominent

**Solution:** Add subtle pulse animation

**Files to Modify:**
- `apps/myk9show/src/styles/apple-show-details.css` (lines 88-92)

**Implementation:**
```css
.apple-show-status-in-progress {
  background: rgba(255, 149, 0, 0.1);
  color: #FF9500;
  border: 1px solid rgba(255, 149, 0, 0.2);
  animation: status-pulse 2s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 149, 0, 0.2);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(255, 149, 0, 0);
  }
}
```

---

## Test Plan

### Unit Tests (Vitest)

**File:** `apps/myk9show/src/components/trials/__tests__/TrialDetailsMain.test.tsx`

```typescript
describe('TrialDetailsMain', () => {
  describe('Statistics Cards', () => {
    it('displays contextual subtitle instead of percent change', () => {
      render(<TrialDetailsMain trial={mockTrial} statistics={mockStats} />);

      // Should show "2 assigned" not "+0%"
      expect(screen.getByText(/2 assigned/)).toBeInTheDocument();
      expect(screen.queryByText(/\+0%/)).not.toBeInTheDocument();
    });

    it('shows progress text for classes card', () => {
      render(<TrialDetailsMain trial={mockTrial} statistics={mockStats} />);

      expect(screen.getByText(/3 of 12 completed/)).toBeInTheDocument();
    });

    it('hides Qualified Rate card when no completed classes', () => {
      const statsNoCompleted = { ...mockStats, classes: { ...mockStats.classes, completed: 0 } };
      render(<TrialDetailsMain trial={mockTrial} statistics={statsNoCompleted} />);

      expect(screen.queryByText('Qualified Rate')).not.toBeInTheDocument();
    });

    it('shows Qualified Rate card when classes are completed', () => {
      render(<TrialDetailsMain trial={mockTrial} statistics={mockStats} />);

      expect(screen.getByText('Qualified Rate')).toBeInTheDocument();
    });
  });

  describe('Trial Info Card', () => {
    it('does not display Order field', () => {
      render(<TrialDetailsMain trial={mockTrial} />);

      expect(screen.queryByText('Order')).not.toBeInTheDocument();
    });

    it('displays Trial Number and Event Number', () => {
      render(<TrialDetailsMain trial={mockTrial} />);

      expect(screen.getByText('Trial Number')).toBeInTheDocument();
      expect(screen.getByText('Event Number')).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('displays Edit button visibly (not in dropdown)', () => {
      render(<TrialDetailsMain trial={mockTrial} onEdit={mockOnEdit} />);

      const editButton = screen.getByRole('button', { name: /edit trial/i });
      expect(editButton).toBeVisible();
    });

    it('keeps Delete in dropdown menu', () => {
      render(<TrialDetailsMain trial={mockTrial} onDelete={mockOnDelete} />);

      // Delete should not be immediately visible
      expect(screen.queryByText('Delete Trial')).not.toBeInTheDocument();

      // Open dropdown
      fireEvent.click(screen.getByRole('button', { name: /more/i }));

      // Now Delete should be visible
      expect(screen.getByText('Delete Trial')).toBeInTheDocument();
    });
  });

  describe('Trial Navigation', () => {
    it('renders prev/next navigation buttons', () => {
      render(
        <TrialDetailsMain
          trial={mockTrial}
          prevTrialId="prev-123"
          nextTrialId="next-456"
          onPrevTrial={mockOnPrev}
          onNextTrial={mockOnNext}
        />
      );

      expect(screen.getByRole('button', { name: /previous trial/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /next trial/i })).toBeEnabled();
    });

    it('disables prev button when no previous trial', () => {
      render(
        <TrialDetailsMain
          trial={mockTrial}
          prevTrialId={null}
          nextTrialId="next-456"
        />
      );

      expect(screen.getByRole('button', { name: /previous trial/i })).toBeDisabled();
    });
  });
});
```

**File:** `apps/myk9show/src/components/trials/__tests__/TrialClassesTable.test.tsx`

```typescript
describe('TrialClassesTable', () => {
  describe('Empty State', () => {
    it('displays icon in empty state', () => {
      render(<TrialClassesTable classes={[]} />);

      // Should have an icon element
      expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
    });

    it('displays helpful message text', () => {
      render(<TrialClassesTable classes={[]} />);

      expect(screen.getByText(/No classes yet/)).toBeInTheDocument();
      expect(screen.getByText(/Add classes to start managing/)).toBeInTheDocument();
    });

    it('shows Import button when handler provided', () => {
      render(<TrialClassesTable classes={[]} onImportClasses={mockImport} />);

      expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    it('has concise search placeholder', () => {
      render(<TrialClassesTable classes={mockClasses} />);

      const searchInput = screen.getByPlaceholderText('Search classes...');
      expect(searchInput).toBeInTheDocument();
    });
  });
});
```

### E2E Tests (Playwright)

**File:** `apps/myk9show/e2e/trials-ui.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Trials Page UI Improvements', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to trials page with test data
    await page.goto('/shows/test-show/trials/test-trial');
  });

  test('statistics cards show contextual information', async ({ page }) => {
    // Should not show percent change values
    await expect(page.locator('text=+0%')).not.toBeVisible();
    await expect(page.locator('text=+75%')).not.toBeVisible();

    // Should show contextual subtitles
    await expect(page.locator('text=/\\d+ assigned/')).toBeVisible();
    await expect(page.locator('text=/\\d+ of \\d+ completed/')).toBeVisible();
  });

  test('trial info card does not show Order field', async ({ page }) => {
    await expect(page.locator('text=Order').first()).not.toBeVisible();
  });

  test('Edit button is visible without opening dropdown', async ({ page }) => {
    const editButton = page.getByRole('button', { name: /edit trial/i });
    await expect(editButton).toBeVisible();
  });

  test('trial navigation arrows work', async ({ page }) => {
    const prevButton = page.getByRole('button', { name: /previous trial/i });
    const nextButton = page.getByRole('button', { name: /next trial/i });

    await expect(prevButton).toBeVisible();
    await expect(nextButton).toBeVisible();

    // Click next and verify URL changes
    await nextButton.click();
    await expect(page).toHaveURL(/\/trials\/[^/]+$/);
  });

  test('empty state shows icon and actions', async ({ page }) => {
    await page.goto('/shows/test-show/trials/empty-trial');

    await expect(page.locator('[data-testid="empty-state-icon"]')).toBeVisible();
    await expect(page.getByText('No classes yet')).toBeVisible();
    await expect(page.getByRole('button', { name: /add classes/i })).toBeVisible();
  });

  test('search has short placeholder on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const searchInput = page.getByPlaceholder('Search classes...');
    await expect(searchInput).toBeVisible();
  });

  test('In Progress status badge has animation', async ({ page }) => {
    // Navigate to an in-progress trial
    await page.goto('/shows/test-show/trials/in-progress-trial');

    const statusBadge = page.locator('.apple-show-status-in-progress');

    // Check that animation is applied
    const animation = await statusBadge.evaluate(
      el => window.getComputedStyle(el).animation
    );
    expect(animation).toContain('status-pulse');
  });
});
```

---

## Implementation Checklist

### Phase 1: High Priority
- [ ] Update statistics cards to show contextual subtitles
- [ ] Remove "Order" field from trial info card
- [ ] Add unit tests for statistics cards
- [ ] Add unit tests for trial info card

### Phase 2: Medium Priority
- [ ] Implement prev/next trial navigation
- [ ] Enhance empty state with icon and secondary action
- [ ] Shorten search placeholder
- [ ] Move Edit button outside dropdown
- [ ] Add unit tests for navigation
- [ ] Add unit tests for empty state
- [ ] Add unit tests for action buttons

### Phase 3: Low Priority
- [ ] Add pulse animation to In Progress status badge
- [ ] Add E2E tests for all improvements

### Validation
- [ ] Run `pnpm typecheck` - no errors
- [ ] Run `pnpm lint` - no warnings
- [ ] Run `cd apps/myk9show && pnpm test` - all pass
- [ ] Run `cd apps/myk9show && pnpm test:e2e` - all pass
- [ ] Manual testing on mobile viewport

---

## Estimated Files to Modify

| File | Changes |
|------|---------|
| `TrialDetailsMain.tsx` | Statistics, info card, navigation, edit button |
| `TrialClassesTable.tsx` | Empty state, search placeholder |
| `TrialDetailsPage.tsx` | Pass prev/next trial props |
| `apple-show-details.css` | Status badge animation |
| `TrialDetailsMain.test.tsx` | New unit tests |
| `TrialClassesTable.test.tsx` | New unit tests |
| `trials-ui.spec.ts` | New E2E tests |
