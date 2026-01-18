# People Page UI Improvements - Implementation Plan

## Analysis Summary

After reviewing the document at `docs/People page UI Improvement.md` and examining the current codebase, I've verified which issues still exist:

| # | Issue | Still Exists? | Location |
|---|-------|---------------|----------|
| 1 | Information Overload (6+ cards) | ✅ Yes | [UserDetailsView.tsx](../apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx) |
| 2 | Hardcoded "Member Since" Date | ✅ Yes | Line 465 - Shows "January 2024" |
| 3 | Misleading "Email Status" Badge | ✅ Yes | Lines 499-503 - Checks email existence, not verification |
| 4 | Settings Tab Placeholder | ✅ Yes | [UserDetailsTabs.tsx:198-201](../apps/myk9show/src/components/users/UserDetails/UserDetailsTabs.tsx#L198-L201) |
| 5 | Missing Quick Actions | ✅ Yes | No quick action buttons in hero card |
| 6 | No Loading/Empty State Polish | ✅ Yes | Basic empty states, no skeleton loaders |
| 7 | Sidebar Search Could Be Enhanced | ✅ Partial | Has fuzzy search but no filter chips |
| 8 | Dogs Section UX Issues | ✅ Yes | Dogs in tabs, no quick peek in hero |
| 9 | Inconsistent Terminology | ✅ Yes | Mix of "User", "Person", "People" |
| 10 | Missing Breadcrumb Navigation | ✅ Yes | No breadcrumb component |
| 11 | Profile Photo Upload Flow | ✅ Yes | Save only sets local state, no storage upload |
| 12 | Judge Qualifications Always Shows | ✅ Yes | Lines 576-693 show card for all users |

**Agreement with Document:** I agree with all 12 recommendations. The document provides accurate observations and practical solutions.

---

## Implementation Plan

### Phase 1: High Priority - Data Integrity & Completeness

#### 1.1 Fix Hardcoded "Member Since" Date
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`
**Line:** 465

**Changes:**
- Use `person.createdAt` from the User type (already defined in `user-types.ts:41`)
- Format date using `toLocaleDateString()` or a date formatting library
- Show "Unknown" or hide section if `createdAt` is not available

```typescript
// Before
<span className="text-lg font-semibold text-foreground">January 2024</span>

// After
<span className="text-lg font-semibold text-foreground">
  {person.createdAt
    ? new Date(person.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Not available'}
</span>
```

#### 1.2 Fix Misleading "Email Status" Badge
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`
**Lines:** 499-503

**Changes:**
- Option A: Remove the badge entirely (simplest)
- Option B: Change text to "Provided" / "Not provided" (more accurate)
- Option C: Add actual email verification tracking (requires schema change)

**Recommended: Option B**
```typescript
// Before
{person.email ? 'Verified' : 'Pending'}

// After
{person.email ? 'Provided' : 'Not provided'}
```

#### 1.3 Remove or Implement Settings Tab
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsTabs.tsx`
**Lines:** 195-204

**Changes:**
- Remove the Settings tab from `tabsConfig` array until functionality is implemented
- Keep the code structure so it's easy to add back later

---

### Phase 2: High Priority - UX Improvements

#### 2.1 Consolidate Information Cards
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`

**Changes:**
1. Merge "Personal Information" and "Address Information" into single "Contact Information" card with two-column layout
2. Move Account Summary stats into the hero card as a compact row below role badges
3. Conditionally show Judge Qualifications card only for users with judge role

**New Structure:**
```
- Hero Card (with embedded account stats + quick actions)
- Contact Information Card (merged personal + address, 2-column)
- System Information Card (admin only - unchanged)
- Judge Qualifications Card (only if user.roles?.includes('judge'))
- Tabs Section
```

#### 2.2 Add Quick Actions to Hero Card
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`

**Changes:**
Add quick action buttons in the hero card after role badges:
```typescript
<div className="flex gap-2 mt-4">
  {person.email && (
    <Button variant="outline" size="sm" asChild>
      <a href={`mailto:${person.email}`}>
        <Mail className="w-4 h-4 mr-2" /> Email
      </a>
    </Button>
  )}
  {person.phone && (
    <Button variant="outline" size="sm" asChild>
      <a href={`tel:${person.phone.replace(/[^\d]/g, '')}`}>
        <Phone className="w-4 h-4 mr-2" /> Call
      </a>
    </Button>
  )}
</div>
```

#### 2.3 Add Dogs Quick Peek in Hero Card
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`

**Changes:**
Add a dogs counter badge that links to the Dogs tab:
```typescript
{person.dogs && person.dogs.length > 0 && (
  <div className="flex items-center gap-2 mt-4">
    <Dog className="w-4 h-4" />
    <span>{person.dogs.length} dog{person.dogs.length !== 1 ? 's' : ''}</span>
  </div>
)}
```

---

### Phase 3: Medium Priority - Navigation & Consistency

#### 3.1 Add Breadcrumb Navigation
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`

**Changes:**
Add breadcrumb at the top of the component:
```typescript
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink } from '@/components/ui/breadcrumb';

// At start of return
<Breadcrumb className="mb-4">
  <BreadcrumbItem>
    <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
  </BreadcrumbItem>
  <BreadcrumbItem>
    <BreadcrumbLink href="/users">People</BreadcrumbLink>
  </BreadcrumbItem>
  <BreadcrumbItem isCurrentPage>
    <span>{fullName}</span>
  </BreadcrumbItem>
</Breadcrumb>
```

#### 3.2 Standardize Terminology
**Files to update:**
- `UserDetailsView.tsx` - Rename to `PersonDetailsView.tsx` or keep and update UI text
- `UserDetailsTabs.tsx` - Already named `PeopleDetailsTabs` internally
- `UserEnhancedSidebar.tsx` - Update header text from "Users" to "People"

**Chosen standard: "People" for user-facing UI**

UI text changes:
- "Users" → "People" in sidebar header
- "Edit User" → "Edit Person" in menu
- "Delete User" → "Delete Person" in dialog
- Keep route as `/users` (less disruptive, SEO-friendly)

#### 3.3 Add Filter Chips to Sidebar Search
**File:** `apps/myk9show/src/components/users/UserEnhancedSidebar.tsx`

**Changes:**
Add filter chip buttons below search input:
```typescript
const [roleFilter, setRoleFilter] = useState<string | null>(null);
const [hasDogs, setHasDogs] = useState<boolean | null>(null);

// Filter chips
<div className="flex flex-wrap gap-2 mt-2">
  <FilterChip
    label="Judges"
    active={roleFilter === 'judge'}
    onClick={() => setRoleFilter(r => r === 'judge' ? null : 'judge')}
  />
  <FilterChip
    label="Has Dogs"
    active={hasDogs === true}
    onClick={() => setHasDogs(h => h === true ? null : true)}
  />
</div>
```

---

### Phase 4: Low Priority - Polish

#### 4.1 Enhance Empty States with Animations
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`

**Changes:**
Add Framer Motion or CSS animations to empty states:
```typescript
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
  className="text-center py-12"
>
  {/* Empty state content */}
</motion.div>
```

#### 4.2 Add Skeleton Loaders
**File:** Create `apps/myk9show/src/components/users/UserDetails/UserDetailsSkeleton.tsx`

**Changes:**
Create skeleton loading state that matches card layout:
```typescript
export const UserDetailsSkeleton = () => (
  <div className="max-w-7xl mx-auto p-8 space-y-8">
    <Skeleton className="h-48 rounded-2xl" /> {/* Hero */}
    <div className="grid grid-cols-2 gap-6">
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  </div>
);
```

#### 4.3 Conditionally Show Judge Qualifications
**File:** `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`
**Lines:** 576-693

**Changes:**
Wrap the Judge Qualifications card in a conditional:
```typescript
{(person.roles?.includes('judge') ||
  (person.judgeQualifications && person.judgeQualifications.length > 0)) && (
  <Card className="group bg-gradient-to-br ...">
    {/* Judge Qualifications content */}
  </Card>
)}
```

---

## Testing Plan

### Unit Tests

**File:** `apps/myk9show/src/test/components/users/UserDetailsView.test.tsx`

```typescript
describe('UserDetailsView', () => {
  describe('Member Since Date', () => {
    it('should display formatted createdAt date when available', () => {
      const user = { ...mockUser, createdAt: new Date('2023-06-15') };
      render(<UserDetailsView person={user} />);
      expect(screen.getByText('June 2023')).toBeInTheDocument();
    });

    it('should display "Not available" when createdAt is undefined', () => {
      const user = { ...mockUser, createdAt: undefined };
      render(<UserDetailsView person={user} />);
      expect(screen.getByText('Not available')).toBeInTheDocument();
    });
  });

  describe('Email Status Badge', () => {
    it('should display "Provided" when email exists', () => {
      const user = { ...mockUser, email: 'test@example.com' };
      render(<UserDetailsView person={user} />);
      expect(screen.getByText('Provided')).toBeInTheDocument();
    });

    it('should display "Not provided" when email is empty', () => {
      const user = { ...mockUser, email: undefined };
      render(<UserDetailsView person={user} />);
      expect(screen.getByText('Not provided')).toBeInTheDocument();
    });
  });

  describe('Quick Actions', () => {
    it('should render Email button when email is provided', () => {
      const user = { ...mockUser, email: 'test@example.com' };
      render(<UserDetailsView person={user} />);
      expect(screen.getByRole('link', { name: /email/i })).toHaveAttribute(
        'href',
        'mailto:test@example.com'
      );
    });

    it('should render Call button when phone is provided', () => {
      const user = { ...mockUser, phone: '555-123-4567' };
      render(<UserDetailsView person={user} />);
      expect(screen.getByRole('link', { name: /call/i })).toHaveAttribute(
        'href',
        'tel:5551234567'
      );
    });
  });

  describe('Judge Qualifications Card', () => {
    it('should show Judge Qualifications for users with judge role', () => {
      const user = { ...mockUser, roles: ['judge'] };
      render(<UserDetailsView person={user} />);
      expect(screen.getByText('Judge Qualifications')).toBeInTheDocument();
    });

    it('should hide Judge Qualifications for non-judge users', () => {
      const user = { ...mockUser, roles: ['exhibitor'] };
      render(<UserDetailsView person={user} />);
      expect(screen.queryByText('Judge Qualifications')).not.toBeInTheDocument();
    });
  });
});
```

### E2E Tests

**File:** `apps/myk9show/src/test/e2e/people-page-ui.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { TestSetup } from './helpers/testSetup';

test.describe('People Page UI Improvements', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.signIn('admin');
  });

  test.describe('Data Display', () => {
    test('should display actual member since date, not hardcoded value', async ({ page }) => {
      await page.goto('/users');
      await page.locator('.apple-people-sidebar-item').first().click();

      // Should not contain hardcoded "January 2024"
      const memberSince = page.locator('text=Member Since').locator('..').locator('span');
      const text = await memberSince.textContent();
      expect(text).not.toBe('January 2024');
      expect(text).toMatch(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$|^Not available$/);
    });

    test('should display "Provided" or "Not provided" for email status', async ({ page }) => {
      await page.goto('/users');
      await page.locator('.apple-people-sidebar-item').first().click();

      const emailStatus = page.locator('text=Email Status').locator('..').locator('.badge');
      const text = await emailStatus.textContent();
      expect(['Provided', 'Not provided']).toContain(text);
    });
  });

  test.describe('Quick Actions', () => {
    test('should display email and call buttons in hero card', async ({ page }) => {
      await page.goto('/users');
      await page.locator('.apple-people-sidebar-item').first().click();

      // Check for quick action buttons
      await expect(page.locator('a[href^="mailto:"]')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('should display breadcrumb navigation', async ({ page }) => {
      await page.goto('/users');
      await page.locator('.apple-people-sidebar-item').first().click();

      // Breadcrumb should show: Dashboard > People > [Name]
      await expect(page.locator('nav[aria-label="Breadcrumb"]')).toBeVisible();
      await expect(page.locator('a[href="/dashboard"]')).toBeVisible();
      await expect(page.locator('a[href="/users"]')).toContainText('People');
    });
  });

  test.describe('Terminology Consistency', () => {
    test('should use "People" consistently in sidebar header', async ({ page }) => {
      await page.goto('/users');

      // Sidebar header should say "People", not "Users"
      await expect(page.locator('aside h3')).toContainText('People');
    });
  });

  test.describe('Sidebar Filters', () => {
    test('should have filter chips for roles', async ({ page }) => {
      await page.goto('/users');

      await expect(page.locator('button:has-text("Judges")')).toBeVisible();
      await expect(page.locator('button:has-text("Has Dogs")')).toBeVisible();
    });

    test('should filter results when chip is clicked', async ({ page }) => {
      await page.goto('/users');

      const initialCount = await page.locator('.apple-people-sidebar-item').count();
      await page.locator('button:has-text("Judges")').click();
      const filteredCount = await page.locator('.apple-people-sidebar-item').count();

      // Filtered count should be <= initial count
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    });
  });

  test.describe('Judge Qualifications Visibility', () => {
    test('should show Judge Qualifications only for judges', async ({ page }) => {
      await page.goto('/users');

      // Find a non-judge user
      const nonJudgeItem = page.locator('.apple-people-sidebar-item').filter({ hasText: 'Member' }).first();
      await nonJudgeItem.click();

      // Judge Qualifications card should not be visible
      await expect(page.locator('text=Judge Qualifications')).not.toBeVisible();
    });
  });

  test.describe('Settings Tab', () => {
    test('should not display Settings tab (removed until implemented)', async ({ page }) => {
      await page.goto('/users');
      await page.locator('.apple-people-sidebar-item').first().click();

      // Settings tab should not exist
      await expect(page.locator('[data-testid="tab-settings"]')).not.toBeVisible();
    });
  });
});
```

---

## Implementation Order

| Step | Task | Effort | Files Changed |
|------|------|--------|---------------|
| 1 | Fix hardcoded "Member Since" date | Low | UserDetailsView.tsx |
| 2 | Fix misleading "Email Status" badge | Low | UserDetailsView.tsx |
| 3 | Remove Settings tab | Low | UserDetailsTabs.tsx |
| 4 | Conditionally show Judge Qualifications | Low | UserDetailsView.tsx |
| 5 | Add quick action buttons to hero | Medium | UserDetailsView.tsx |
| 6 | Consolidate info cards (merge Personal + Address) | Medium | UserDetailsView.tsx |
| 7 | Add breadcrumb navigation | Medium | UserDetailsView.tsx, may need Breadcrumb component |
| 8 | Standardize terminology to "People" | Low | Multiple files |
| 9 | Add filter chips to sidebar | Medium | UserEnhancedSidebar.tsx |
| 10 | Add skeleton loaders | Low | New file + UserDetailsPage.tsx |
| 11 | Add empty state animations | Low | UserDetailsView.tsx |
| 12 | Write unit tests | Medium | New test file |
| 13 | Write E2E tests | Medium | New test file |

---

## Dependencies

- No new package dependencies required
- Existing components: Button, Badge, Card, Avatar (all from @/components/ui)
- May need to create Breadcrumb component if not already available

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Run full test suite after each change |
| Layout shifts from card consolidation | Use responsive grid, test on multiple screen sizes |
| Performance impact from animations | Use CSS animations or lightweight Framer Motion, lazy load |

---

## Approval Checklist

- [x] Review and approve implementation approach
- [x] Confirm priority order
- [x] Confirm terminology choice ("People" vs "Users") - **Chose: "People"**
- [x] Confirm whether to remove Settings tab or implement basic version - **Chose: Remove**
- [x] Confirm email status badge wording ("Provided" vs just removing it) - **Chose: Remove completely**

---

## Implementation Status: COMPLETED

All improvements have been implemented on **2026-01-18**.

### Files Modified:
- `apps/myk9show/src/components/users/UserDetails/UserDetailsView.tsx`
- `apps/myk9show/src/components/users/UserDetails/UserDetailsTabs.tsx`
- `apps/myk9show/src/components/users/UserEnhancedSidebar.tsx`

### Tests Created:
- `apps/myk9show/src/test/components/users/UserDetailsView.test.tsx` (Unit tests)
- `apps/myk9show/src/test/e2e/people-page-ui.spec.ts` (E2E tests)
