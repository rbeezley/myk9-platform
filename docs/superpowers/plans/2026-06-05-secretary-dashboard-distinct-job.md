# Secretary Dashboard Distinct Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact secretary dashboard quick links and make show-bucket counts read as badges while preserving collapsible sections.

**Architecture:** Keep the dashboard as a cross-show triage home. Add a small presentational `DashboardQuickLinks` component for existing destinations, and update `MyShowsSection` styling without changing its data or collapse behavior.

**Tech Stack:** React, TypeScript, React Router, shadcn/ui, lucide-react, Vitest, Testing Library.

---

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This is a small myK9Show dashboard UX change that affects a real navigation surface, so focused component tests plus app typecheck/lint are sufficient.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/DashboardQuickLinks.tsx` | Render static icon-led links to existing Add Show, Add Dog, and Add Person surfaces |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx` | Place quick links under the header and remove the duplicate header New Show button |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/MyShowsSection.tsx` | Render existing show counts as badge-like pills while keeping collapsible sections |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx` | Lock in quick links and no duplicate create-show action |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/MyShowsSection.test.tsx` | Lock in badge count and collapsible behavior |

## Task 1: Add Dashboard Quick Links

**Files:**
- Create: `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/DashboardQuickLinks.tsx`
- Modify: `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx`
- Test: `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx`

- [ ] **Step 1: Write the failing dashboard quick-links test**

Add this test to `SecretaryDashboardPage.test.tsx`:

```typescript
it('renders compact quick links to existing creation surfaces without duplicating the show action', () => {
  renderPage();

  expect(screen.getByRole('link', { name: /Add Show/i })).toHaveAttribute(
    'href',
    '/secretary/create-show/wizard'
  );
  expect(screen.getByRole('link', { name: /Add Dog/i })).toHaveAttribute('href', '/dogs');
  expect(screen.getByRole('link', { name: /Add Person/i })).toHaveAttribute('href', '/people');
  expect(screen.getByRole('navigation', { name: /Dashboard quick links/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /New Show/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/myk9show`:

```bash
pnpm exec vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx --reporter=verbose
```

Expected: FAIL because the quick links do not exist and the `New Show` button still renders.

- [ ] **Step 3: Create `DashboardQuickLinks.tsx`**

Create `DashboardQuickLinks.tsx`:

```typescript
import { Link } from 'react-router-dom';
import { Dog, Plus, UserPlus } from 'lucide-react';

const QUICK_LINKS = [
  {
    label: 'Add Show',
    description: 'Start the wizard',
    href: '/secretary/create-show/wizard',
    Icon: Plus,
  },
  {
    label: 'Add Dog',
    description: 'Open dogs',
    href: '/dogs',
    Icon: Dog,
  },
  {
    label: 'Add Person',
    description: 'Open people',
    href: '/people',
    Icon: UserPlus,
  },
] as const;

export function DashboardQuickLinks() {
  return (
    <nav className="px-5 pb-3" aria-label="Dashboard quick links">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {QUICK_LINKS.map(({ label, description, href, Icon }) => (
          <Link
            key={href}
            to={href}
            className="flex min-h-16 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-tight text-foreground">{label}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Render quick links and remove duplicate header action**

In `index.tsx`, remove:

```typescript
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
```

Remove:

```typescript
const navigate = useNavigate();
```

Add:

```typescript
import { DashboardQuickLinks } from './DashboardQuickLinks';
```

Replace the header container class:

```typescript
<div className="px-5 pb-2 pt-6">
```

Remove the header `<Button>` block for `New Show`.

Render quick links immediately after the header:

```typescript
<DashboardQuickLinks />
```

- [ ] **Step 5: Run the dashboard test to verify it passes**

Run:

```bash
pnpm exec vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx --reporter=verbose
```

Expected: PASS. The quick links stack on narrow screens and become three columns at the `sm` breakpoint, so labels do not squeeze inside tiny columns on mobile.

## Task 2: Convert Show Counts to Badge-Style Pills

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/MyShowsSection.tsx`
- Test: `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/MyShowsSection.test.tsx`

- [ ] **Step 1: Write the failing count-badge test**

Update the existing count test in `MyShowsSection.test.tsx`:

```typescript
it('renders the show count as a badge inside the toggle button', () => {
  renderSection({ shows: [makeShow('a'), makeShow('b')] });

  const button = screen.getByRole('button', { name: /Upcoming shows/i });
  const badge = screen.getByTestId('my-shows-section-count-badge');

  expect(button).toContainElement(badge);
  expect(badge).toHaveTextContent('2 shows');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/MyShowsSection.test.tsx --reporter=verbose
```

Expected: FAIL because the count does not have `data-testid="my-shows-section-count-badge"`.

- [ ] **Step 3: Update `MyShowsSection.tsx` count markup**

Replace the current trailing count span with:

```typescript
<span className="shrink-0 flex items-center gap-2">
  <span
    data-testid="my-shows-section-count-badge"
    className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
  >
    {shows.length} {shows.length === 1 ? 'show' : 'shows'}
  </span>
  <span className="text-muted-foreground">
    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
  </span>
</span>
```

- [ ] **Step 4: Run the section test to verify it passes**

Run:

```bash
pnpm exec vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/MyShowsSection.test.tsx --reporter=verbose
```

Expected: PASS.

## Task 3: Verification and Tracking

**Files:**
- Modify: `OPEN-TODOS.md` only if an open tracked todo maps to this dashboard refinement

- [ ] **Step 1: Run focused secretary dashboard tests**

Run from `apps/myk9show`:

```bash
pnpm exec vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/MyShowsSection.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/AttentionNeededStrip.test.tsx --reporter=verbose
```

Expected: PASS.

- [ ] **Step 2: Run app verification**

Run from the repo root:

```bash
pnpm --filter @myk9/show typecheck
pnpm --filter @myk9/show lint
```

Expected: both commands exit 0.

- [ ] **Step 3: Check whitespace**

Run from the repo root:

```bash
git diff --check
```

Expected: no output and exit 0.

- [ ] **Step 4: Review changed files**

Run from the repo root:

```bash
git status --short
git diff -- apps/myk9show/src/pages/secretary/SecretaryDashboardPage docs/superpowers/specs/2026-06-05-secretary-dashboard-distinct-job-design.md docs/superpowers/plans/2026-06-05-secretary-dashboard-distinct-job.md OPEN-TODOS.md
```

Expected: only this dashboard PR's files are changed.
