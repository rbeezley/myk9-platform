# Wave 1 Exhibitor Entry And Payment Trust Implementation Plan

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the exhibitor enter/pay golden path by preventing unusable entry routes, exposing class-fit detail before registration, and giving unpaid entries an obvious path back to the existing cart payment flow.

**Architecture:** Keep all fixes on existing surfaces. Show Details remains the pre-registration decision page, the Classes tab remains the detailed class inventory, and My Shows links unpaid states to the existing `/cart` recovery route. No new pages, dialogs, payment flows, or eligibility tools are introduced.

**Tech Stack:** React, TypeScript, React Router, Vitest, React Testing Library, myK9Show shadcn/base UI components.

---

## Context

**Source audit:** `docs/audits/2026-06-ux-journeys/SUMMARY.md`

**Wave 1 findings:**

- `UX-P1-01`: Accepting shows without class inventory can lead exhibitors into an unusable entry path.
- `UX-P2-01`: My Shows exposes Payment Due / Current Fees without a visible pay or retry action.
- `UX-P2-04`: Show Details does not make class/dog-fit detail visible before registration.

**Intent check:** `docs/INTENT.md` defines the exhibitor target feeling as "This respects my time." These changes should remove dead ends and reduce hunting without adding more surface area.

**Duplication question:** Does this duplicate an existing page? No. The class summary links to the existing Classes tab, and payment recovery links to the existing `/cart` route. If implementation pressure pushes toward a new page, stop and narrow the change.

## Files

- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
- Modify: `apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx`
- Create: `apps/myk9show/src/components/shows/tabs/showClassSummary.ts`
- Test: `apps/myk9show/src/components/shows/tabs/showClassSummary.test.ts`
- Test: `apps/myk9show/src/test/components/ShowOverviewTab.test.tsx`
- Modify: `apps/myk9show/src/components/exhibitor/CompactStatsRow.tsx`
- Test: `apps/myk9show/src/test/components/CompactStatsRow.test.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx`
- Test: `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx`
- Verify existing tests: `apps/myk9show/src/test/utils/entryStatusUtils.test.ts`
- Verify existing tests: `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`
- Update: `docs/audits/2026-06-ux-journeys/SUMMARY.md`

## Task 1: Confirm The No-Class Entry Gate

**Purpose:** Preserve the existing class inventory gate for new entries and prove it stays open for users who already have an entry to manage.

- [ ] **Step 1: Read the current gate and tests**

Run:

```bash
rg -n "hasEntryClassInventory|Classes Not Ready|setup_incomplete|hides the enter action" apps/myk9show/src/utils/entryStatusUtils.ts apps/myk9show/src/test/utils/entryStatusUtils.test.ts apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx apps/myk9show/src/pages/ShowDetailsPage.tsx
```

Expected: Matches show `hasEntryClassInventory` flowing from Show Details into `getEntryStatus`, plus tests covering no-class setup.

- [ ] **Step 2: Add or tighten the value-sensitive status tests**

In `apps/myk9show/src/test/utils/entryStatusUtils.test.ts`, ensure these test cases exist. If equivalent tests already exist, keep the existing names and only adjust missing assertions.

```typescript
it('blocks new entries when an accepting show has no class inventory', () => {
  const status = getEntryStatus(
    { ...baseShow, status: ShowStatus.OPEN, accepting_entries: true },
    false,
    { hasEntryClassInventory: false }
  );

  expect(status.status).toBe('setup_incomplete');
  expect(status.canEnter).toBe(false);
  expect(status.label).toBe('Classes Not Ready');
});

it('keeps existing entry access when class inventory is unavailable', () => {
  const status = getEntryStatus(
    { ...baseShow, status: ShowStatus.OPEN, accepting_entries: true },
    true,
    { hasEntryClassInventory: false }
  );

  expect(status.status).toBe('entered');
  expect(status.canEnter).toBe(false);
  expect(status.actionLabel).toBe('View Entry');
});
```

- [ ] **Step 3: Run the focused status tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/utils/entryStatusUtils.test.ts
```

Expected: PASS. If a new assertion fails, inspect the implementation before editing.

- [ ] **Step 4: Verify the Show Details gate test**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx -t "hides the enter action when loaded trials have no classes"
```

Expected: PASS with no Enter This Show action for the no-class fixture.

## Task 2: Add A Reusable Class Summary Helper

**Purpose:** Build a tiny typed helper so the Overview can summarize existing class inventory without duplicating the Classes tab.

- [ ] **Step 1: Create the failing helper test**

Create `apps/myk9show/src/components/shows/tabs/showClassSummary.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { summarizeShowClasses } from './showClassSummary';

describe('summarizeShowClasses', () => {
  it('counts classes and extracts compact trial, element, and level labels', () => {
    const summary = summarizeShowClasses([
      {
        id: 'class-1',
        name: 'Novice Standard A',
        level: 'Novice',
        element: 'Standard',
        trialName: 'Saturday Trial',
      },
      {
        id: 'class-2',
        name: 'Open Jumpers',
        level: 'Open',
        element: 'Jumpers',
        trialName: 'Saturday Trial',
      },
      {
        id: 'class-3',
        name: 'Novice FAST',
        level: 'Novice',
        element: 'FAST',
        trialName: 'Sunday Trial',
      },
    ]);

    expect(summary.totalClasses).toBe(3);
    expect(summary.trialLabels).toEqual(['Saturday Trial', 'Sunday Trial']);
    expect(summary.elementLabels).toEqual(['FAST', 'Jumpers', 'Standard']);
    expect(summary.levelLabels).toEqual(['Novice', 'Open']);
  });

  it('falls back to class names when element and level fields are absent', () => {
    const summary = summarizeShowClasses([
      {
        id: 'class-1',
        name: 'Masters Standard',
        trialName: 'Main Trial',
      },
    ]);

    expect(summary.totalClasses).toBe(1);
    expect(summary.elementLabels).toEqual(['Masters Standard']);
    expect(summary.levelLabels).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the helper test red**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/shows/tabs/showClassSummary.test.ts
```

Expected: FAIL because `showClassSummary.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/myk9show/src/components/shows/tabs/showClassSummary.ts`:

```typescript
export interface ShowClassSummaryClass {
  id?: string | number | null;
  name?: string | null;
  level?: string | null;
  element?: string | null;
  trialName?: string | null;
}

export interface ShowClassSummary {
  totalClasses: number;
  trialLabels: string[];
  elementLabels: string[];
  levelLabels: string[];
}

const compactLabels = (values: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b));

export const summarizeShowClasses = (classes: ShowClassSummaryClass[]): ShowClassSummary => {
  const elementLabels = compactLabels(
    classes.map(showClass => showClass.element ?? showClass.name)
  );

  return {
    totalClasses: classes.length,
    trialLabels: compactLabels(classes.map(showClass => showClass.trialName)),
    elementLabels,
    levelLabels: compactLabels(classes.map(showClass => showClass.level)),
  };
};
```

- [ ] **Step 4: Run the helper test green**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/shows/tabs/showClassSummary.test.ts
```

Expected: PASS.

## Task 3: Surface Class-Fit Detail On Show Overview

**Purpose:** Let exhibitors understand class fit before pressing Enter This Show, while sending detailed review to the existing Classes tab.

- [ ] **Step 1: Add the failing Overview test**

In `apps/myk9show/src/test/components/ShowOverviewTab.test.tsx`, add:

```typescript
it('summarizes offered classes and links to the Classes tab', async () => {
  const user = userEvent.setup();
  const onViewClasses = vi.fn();

  render(
    <ShowOverviewTab
      show={mockShow}
      classes={[
        {
          id: 'class-1',
          name: 'Novice Standard A',
          level: 'Novice',
          element: 'Standard',
          trialName: 'Saturday Trial',
        },
        {
          id: 'class-2',
          name: 'Open Jumpers',
          level: 'Open',
          element: 'Jumpers',
          trialName: 'Saturday Trial',
        },
      ]}
      onViewClasses={onViewClasses}
    />,
  );

  expect(screen.getByRole('heading', { name: /Classes offered/i })).toBeInTheDocument();
  expect(screen.getByText('2 classes')).toBeInTheDocument();
  expect(screen.getByText('Jumpers')).toBeInTheDocument();
  expect(screen.getByText('Standard')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /View all classes/i }));

  expect(onViewClasses).toHaveBeenCalledTimes(1);
});
```

If the file uses a different render import, keep the local pattern and only add the assertions above.

- [ ] **Step 2: Run the Overview test red**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/components/ShowOverviewTab.test.tsx -t "summarizes offered classes"
```

Expected: FAIL because `ShowOverviewTab` does not accept or render `classes`.

- [ ] **Step 3: Implement the Overview summary**

Modify `apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import { summarizeShowClasses, type ShowClassSummaryClass } from './showClassSummary';

interface ShowOverviewTabProps {
  show: Show;
  canManageShow?: boolean;
  judges?: Judge[];
  classes?: ShowClassSummaryClass[];
  onViewClasses?: () => void;
}
```

Inside the component body:

```typescript
const classSummary = summarizeShowClasses(classes ?? []);
const hasClasses = classSummary.totalClasses > 0;
const visibleClassLabels = [...classSummary.elementLabels, ...classSummary.levelLabels].slice(0, 6);
```

Render this block before the existing schedule summary in the main content column:

```tsx
{
  hasClasses ? (
    <section
      className="rounded-lg border bg-card p-4 shadow-sm"
      aria-labelledby="classes-offered-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div>
            <h2 id="classes-offered-heading" className="text-lg font-semibold text-foreground">
              Classes offered
            </h2>
            <p className="text-sm text-muted-foreground">
              {classSummary.totalClasses} {classSummary.totalClasses === 1 ? 'class' : 'classes'}
              {classSummary.trialLabels.length > 0
                ? ` across ${classSummary.trialLabels.length} ${classSummary.trialLabels.length === 1 ? 'trial' : 'trials'}`
                : ''}
            </p>
          </div>
          {visibleClassLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visibleClassLabels.map(label => (
                <span
                  key={label}
                  className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {onViewClasses ? (
          <Button type="button" variant="outline" onClick={onViewClasses}>
            View all classes
          </Button>
        ) : null}
      </div>
    </section>
  ) : null;
}
```

- [ ] **Step 4: Wire Show Details to the existing Classes tab**

Modify `apps/myk9show/src/pages/ShowDetailsPage.tsx` where `ShowOverviewTab` is rendered:

```tsx
<ShowOverviewTab
  show={actualCurrentShow}
  canManageShow={canManageShow}
  judges={effectiveJudges}
  classes={showClasses}
  onViewClasses={() => setTab('classes')}
/>
```

- [ ] **Step 5: Run the Overview tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/components/ShowOverviewTab.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run the Show Details class gate tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx -t "classes|enter action"
```

Expected: PASS.

## Task 4: Link Current Fees To Cart When Money Is Due

**Purpose:** Make the Current Fees stat an obvious payment recovery affordance without creating a second payment workflow.

- [ ] **Step 1: Add the failing CompactStatsRow tests**

In `apps/myk9show/src/test/components/CompactStatsRow.test.tsx`, add or adjust tests so these expectations exist:

```typescript
it('opens the cart from Current Fees when an amount is due', async () => {
  const user = userEvent.setup();
  const onNavigate = vi.fn();

  render(
    <CompactStatsRow
      entryStats={{
        ...baseEntryStats,
        currentFees: 125,
        currentAmountDue: 125,
      }}
      dogStats={baseDogStats}
      achievementStats={baseAchievementStats}
      onNavigate={onNavigate}
    />,
  );

  await user.click(screen.getByRole('button', { name: /Current Fees.*Amount due/i }));

  expect(onNavigate).toHaveBeenCalledWith('/cart');
});

it('keeps Current Fees on My Shows when no payment is due', async () => {
  const user = userEvent.setup();
  const onNavigate = vi.fn();

  render(
    <CompactStatsRow
      entryStats={{
        ...baseEntryStats,
        currentFees: 125,
        currentAmountDue: 0,
      }}
      dogStats={baseDogStats}
      achievementStats={baseAchievementStats}
      onNavigate={onNavigate}
    />,
  );

  await user.click(screen.getByRole('button', { name: /Current Fees.*Paid in full/i }));

  expect(onNavigate).toHaveBeenCalledWith('/exhibitor/entries');
});
```

- [ ] **Step 2: Run the CompactStatsRow tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/components/CompactStatsRow.test.tsx -t "Current Fees"
```

Expected: The amount-due test FAILS because Current Fees still navigates to `/exhibitor/entries`.

- [ ] **Step 3: Implement the conditional route**

Modify `apps/myk9show/src/components/exhibitor/CompactStatsRow.tsx` where the Current Fees stat is defined:

```typescript
const currentFeesHref = entryStats.currentAmountDue > 0 ? '/cart' : '/exhibitor/entries';
```

Use that value in the Current Fees config:

```typescript
{
  label: 'Current Fees',
  value: `$${entryStats.currentFees.toFixed(0)}`,
  detail:
    entryStats.currentAmountDue > 0
      ? `Amount due $${entryStats.currentAmountDue.toFixed(0)}`
      : 'Paid in full',
  icon: CreditCard,
  href: currentFeesHref,
}
```

- [ ] **Step 4: Run the CompactStatsRow tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/components/CompactStatsRow.test.tsx
```

Expected: PASS.

## Task 5: Add Finish Payment To Unpaid Entry Cards

**Purpose:** Give each unpaid entry an obvious pay/retry action in My Shows.

- [ ] **Step 1: Add the failing MyEntryCard tests**

In `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx`, add:

```typescript
it('shows a Finish Payment action for pending paid-fee entries', () => {
  render(
    <MyEntryCard
      entry={{
        ...baseEntry,
        paymentStatus: PaymentStatus.PENDING,
        totalFee: 85,
      }}
      onCheckInClick={vi.fn()}
      onEditClick={vi.fn()}
      onReceiptClick={vi.fn()}
    />,
  );

  expect(screen.getByRole('link', { name: /Finish Payment/i })).toHaveAttribute('href', '/cart');
});

it('does not show Finish Payment for paid entries', () => {
  render(
    <MyEntryCard
      entry={{
        ...baseEntry,
        paymentStatus: PaymentStatus.PAID,
        totalFee: 85,
      }}
      onCheckInClick={vi.fn()}
      onEditClick={vi.fn()}
      onReceiptClick={vi.fn()}
    />,
  );

  expect(screen.queryByRole('link', { name: /Finish Payment/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the MyEntryCard tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx -t "Finish Payment"
```

Expected: FAIL because no Finish Payment action exists.

- [ ] **Step 3: Implement the unpaid action**

Modify `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx`:

```typescript
const canFinishPayment = entry.paymentStatus === PaymentStatus.PENDING && entry.totalFee > 0;
```

In the card actions, render the action before Edit Entry:

```tsx
{
  canFinishPayment ? (
    <Button asChild size="sm">
      <Link to="/cart">Finish Payment</Link>
    </Button>
  ) : null;
}
```

- [ ] **Step 4: Run the MyEntryCard tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx
```

Expected: PASS.

## Task 6: Record Wave 1 Remediation Status

**Purpose:** Keep the audit summary honest: Wave 1 is remediated in code only after tests and browser evidence pass.

- [ ] **Step 1: Update the Human Gate row**

In `docs/audits/2026-06-ux-journeys/SUMMARY.md`, change:

```markdown
- [ ] Wave 1 is approved as the first remediation wave.
```

to:

```markdown
- [x] Wave 1 is approved as the first remediation wave.
```

- [ ] **Step 2: Add a remediation note without claiming Green**

Under `## Remediation Waves`, add:

```markdown
**Wave 1 implementation note:** In progress on branch `codex/wave1-exhibitor-entry-payment-trust`. Do not rescore Exhibitor to Yellow or Green until focused tests and the browser re-walk pass.
```

- [ ] **Step 3: Check markdown whitespace**

Run:

```bash
git diff --check docs/audits/2026-06-ux-journeys/SUMMARY.md docs/plan-wave1-exhibitor-entry-payment-trust.md
```

Expected: no output.

## Task 7: Focused Verification

**Purpose:** Prove the code-level behavior before browser re-walking the UX journey.

- [ ] **Step 1: Run focused unit and component tests**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/test/utils/entryStatusUtils.test.ts \
  src/test/pages/ShowDetailsPage.test.tsx \
  src/components/shows/tabs/showClassSummary.test.ts \
  src/test/components/ShowOverviewTab.test.tsx \
  src/test/components/CompactStatsRow.test.tsx \
  src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx
```

Expected: PASS. If the runner hangs for more than 60 seconds without useful output, stop it and report the hang.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If it hangs for more than 60 seconds without useful output, stop it and report the hang.

- [ ] **Step 3: Start the app for browser verification**

Run:

```bash
pnpm dev:show
```

Expected: local myK9Show starts on `http://localhost:5173` unless that port is occupied.

- [ ] **Step 4: Browser re-walk**

Use the browser automation tool against the local app and capture these checks:

```text
1. Open a show detail page with classes.
2. Confirm Overview shows "Classes offered" and "View all classes".
3. Click "View all classes" and confirm the existing Classes tab opens.
4. Open or simulate the no-class accepting show fixture and confirm Enter This Show is hidden or replaced by Classes Not Ready.
5. Open My Shows with an unpaid entry and confirm the entry card shows Finish Payment.
6. Click Finish Payment and confirm it routes to /cart.
7. Confirm Current Fees with amount due also routes to /cart.
```

Expected: all seven checks pass. Save screenshots or notes in the final remediation summary.

## Task 8: Commit

**Purpose:** Keep the implementation easy to review.

- [ ] **Step 1: Review the diff**

Run:

```bash
git diff --stat
git diff -- docs/plan-wave1-exhibitor-entry-payment-trust.md apps/myk9show/src/components/shows/tabs/showClassSummary.ts apps/myk9show/src/components/shows/tabs/showClassSummary.test.ts apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx apps/myk9show/src/test/components/ShowOverviewTab.test.tsx apps/myk9show/src/components/exhibitor/CompactStatsRow.tsx apps/myk9show/src/test/components/CompactStatsRow.test.tsx apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx docs/audits/2026-06-ux-journeys/SUMMARY.md
```

Expected: only Wave 1 files changed.

- [ ] **Step 2: Stage only Wave 1 files**

Run:

```bash
git add \
  docs/plan-wave1-exhibitor-entry-payment-trust.md \
  docs/audits/2026-06-ux-journeys/SUMMARY.md \
  apps/myk9show/src/components/shows/tabs/showClassSummary.ts \
  apps/myk9show/src/components/shows/tabs/showClassSummary.test.ts \
  apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx \
  apps/myk9show/src/test/components/ShowOverviewTab.test.tsx \
  apps/myk9show/src/components/exhibitor/CompactStatsRow.tsx \
  apps/myk9show/src/test/components/CompactStatsRow.test.tsx \
  apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx \
  apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx
```

Expected: staged files are exactly the Wave 1 plan, docs note, implementation, and tests.

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "fix: tighten exhibitor entry payment path"
```

Expected: commit succeeds from the worktree branch.

## Task 9: Follow-Up Payment Recovery Reliability

**Purpose:** Close the review-discovered gap where My Shows links to `/cart`, but `/cart` can render empty after the cart expiry window even though the unpaid entry path still needs recovery.

**Duplication question:** Does this duplicate an existing page? No. The recovery stays in the existing cart and checkout flow. Do not add a new payment page, sheet, or retry dialog.

- [x] **Step 1: Add a regression for active carts whose `expires_at` is stale**

Create or update cart-store coverage so `loadActiveCart(exhibitorId)` finds the latest `active` cart even when `expires_at` is in the past, extends the expiry, and hydrates its items instead of returning `null`.

- [x] **Step 2: Recover unpaid expired carts at checkout**

Update the `stripe-checkout` entry-payment path so an owner-verified cart with `status='expired'` can be reopened by the service role before creating a fresh Stripe session. Keep submitted and abandoned carts terminal.

- [x] **Step 3: Run focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/store/cartStore.test.ts
```

Expected: PASS.

- [x] **Step 4: Run broader validation**

Run:

```bash
pnpm --filter @myk9/show typecheck
git diff --check
```

Expected: PASS with no whitespace errors.

- [x] **Step 5: Browser re-walk the money-path recovery**

Use the local app to re-check My Shows → Finish Payment and Current Fees → `/cart`. The cart should show the recovered entries instead of the empty-cart state.

Note: the live re-walk writes to the linked Supabase project because recovery extends the cart and may rebuild missing cart items. Get explicit shared-DB approval before running this against staging data.

2026-06-14 evidence: after explicit shared-DB approval, the browser re-walk found that bare `/cart` still rendered empty when `entry_cart_items` had been lost. The fix now deep-links unpaid My Shows actions to `/cart?showId=<showId>&entryIds=<entryIds>` and rebuilds only those exact owner-verified pending entries. Current Fees and Finish Payment both recovered entry `800e7aa1-f57c-40cf-9b03-c238efb360b8` for show `3b91e282-6e45-4a89-9446-f6ebeb0bf62c`; the cart rendered `Dog 1`, `1 Entry`, and total `$32.10`. Recovery inserted the expected staging `entry_cart_items` row for cart `86722292-d636-413b-a357-c88990b8f408`.
