# Ring Number Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ring labels optional and sport-aware so Scent Work omits missing ring data and no production path renders `Ring 0`, `Ring null`, or `Ring Unknown`.

**Architecture:** Add one shared ring-label formatter, then route show-day and check-in renderers through it. Keep persisted ring scheduling out of this slice; current data contracts represent unknown ring data as `null`.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, pnpm.

---

## File Structure

- Create: `apps/myk9show/src/utils/ringLabel.ts` — shared formatter for optional ring display values.
- Create: `apps/myk9show/src/utils/ringLabel.test.ts` — formatter unit tests.
- Modify: `apps/myk9show/src/types/exhibitor-types.ts` — allow missing ring values in exhibitor check-in data.
- Modify: `apps/myk9show/src/hooks/queries/useClassCheckInData.ts` — map unavailable check-in ring values to `null`.
- Modify: `apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts` — assert missing ring data is `null`.
- Modify: `apps/myk9show/src/components/exhibitor/NextUpCard.tsx` — render ring text through the formatter.
- Modify: `apps/myk9show/src/test/components/NextUpCard.test.tsx` — prove missing and zero ring values render no ring text.
- Modify: `apps/myk9show/src/components/exhibitor/ClassCheckIn.tsx` — omit the ring row when unknown.
- Modify: `apps/myk9show/src/test/pages/ClassCheckInPage.test.tsx` — prove the check-in page omits unknown rings.
- Modify: `apps/myk9show/src/components/exhibitor/MultiDogSchedule.tsx` — omit ring metadata per entry when unknown.
- Modify: `apps/myk9show/src/test/hooks/useShowDayData.test.ts` — keep show-day class output at `ringNumber: null`.
- Modify: `OPEN-TODOS.md` — mark the selected todo complete after tests pass.

## Task 1: Shared Ring Label Formatter

**Files:**
- Create: `apps/myk9show/src/utils/ringLabel.ts`
- Create: `apps/myk9show/src/utils/ringLabel.test.ts`

- [ ] **Step 1: Write the failing formatter tests**

Create `apps/myk9show/src/utils/ringLabel.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { formatRingLabel } from './ringLabel';

describe('formatRingLabel', () => {
  it.each([null, undefined, 0, '', '   ', '0', 'Ring 0', 'ring null', 'Ring Unknown'])(
    'returns null for missing ring value %s',
    value => {
      expect(formatRingLabel(value)).toBeNull();
    }
  );

  it('formats positive numeric ring values', () => {
    expect(formatRingLabel(2)).toBe('Ring 2');
  });

  it('formats numeric strings', () => {
    expect(formatRingLabel('2')).toBe('Ring 2');
  });

  it('keeps already formatted ring labels', () => {
    expect(formatRingLabel(' Ring 2 ')).toBe('Ring 2');
  });

  it('keeps named ring areas that are already user-facing', () => {
    expect(formatRingLabel('South Building')).toBe('South Building');
  });
});
```

- [ ] **Step 2: Run the formatter tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/utils/ringLabel.test.ts
```

Expected: FAIL because `./ringLabel` does not exist.

- [ ] **Step 3: Implement the formatter**

Create `apps/myk9show/src/utils/ringLabel.ts`:

```typescript
export type RingDisplayValue = number | string | null | undefined;

const MISSING_RING_LABELS = new Set(['0', 'null', 'unknown', 'ring 0', 'ring null', 'ring unknown']);

export function formatRingLabel(value: RingDisplayValue): string | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? `Ring ${value}` : null;
  }

  const label = value.trim().replace(/\s+/g, ' ');
  if (!label) return null;

  const normalized = label.toLowerCase();
  if (MISSING_RING_LABELS.has(normalized)) return null;

  if (/^\d+$/.test(label)) {
    const ringNumber = Number(label);
    return ringNumber > 0 ? `Ring ${ringNumber}` : null;
  }

  return label;
}
```

- [ ] **Step 4: Run the formatter tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/utils/ringLabel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/ringLabel.ts apps/myk9show/src/utils/ringLabel.test.ts
git commit -m "feat(show): add optional ring label formatter"
```

## Task 2: Check-In Data Contract Uses Null For Unknown Rings

**Files:**
- Modify: `apps/myk9show/src/types/exhibitor-types.ts`
- Modify: `apps/myk9show/src/hooks/queries/useClassCheckInData.ts`
- Modify: `apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts`

- [ ] **Step 1: Update tests to expect `null`**

In `apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts`, change ring assertions:

```typescript
expect(result.class.ringNumber).toBeNull();
expect(result.entry.ringNumber).toBeNull();
expect(result.ringStatus.ringNumber).toBeNull();
```

In the nullable-fields test, keep this assertion:

```typescript
expect(result.class.ringNumber).toBeNull();
```

- [ ] **Step 2: Run the check-in query tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useClassCheckInData.test.ts
```

Expected: FAIL because `mapRowToClassInfo` still returns `0`.

- [ ] **Step 3: Allow nullable ring values in exhibitor types**

In `apps/myk9show/src/types/exhibitor-types.ts`, change the three ring fields:

```typescript
export interface ShowClass {
  // existing fields stay unchanged
  ringNumber: number | null;
  ring?: string | number | null;
  entries?: unknown[];
}
```

```typescript
export interface ExhibitorEntry {
  // existing fields stay unchanged
  ringNumber: number | null;
  judgeName: string;
  scheduledTime?: Date;
}
```

- [ ] **Step 4: Map unavailable check-in rings to `null`**

In `apps/myk9show/src/hooks/queries/useClassCheckInData.ts`, replace each `ringNumber: 0` in `mapRowToClassInfo` with:

```typescript
ringNumber: null,
```

- [ ] **Step 5: Run the check-in query tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useClassCheckInData.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/types/exhibitor-types.ts apps/myk9show/src/hooks/queries/useClassCheckInData.ts apps/myk9show/src/hooks/queries/__tests__/useClassCheckInData.test.ts
git commit -m "fix(show): use null for unavailable check-in rings"
```

## Task 3: Next-Up Card Omits Missing Rings

**Files:**
- Modify: `apps/myk9show/src/components/exhibitor/NextUpCard.tsx`
- Modify: `apps/myk9show/src/test/components/NextUpCard.test.tsx`

- [ ] **Step 1: Add renderer tests for missing ring labels**

Add these tests to `apps/myk9show/src/test/components/NextUpCard.test.tsx` near the existing ring test:

```typescript
it('hides ring text when ringNumber is null', () => {
  render(
    <NextUpCard
      classData={makeClass({
        scoredEntries: 0,
        currentDogInRing: null,
        totalEntries: 8,
        ringNumber: null,
      })}
    />
  );
  expect(screen.getByText(/8 entries/)).toBeInTheDocument();
  expect(screen.queryByText(/Ring/)).not.toBeInTheDocument();
});

it('hides ring text when legacy data provides ringNumber 0', () => {
  render(
    <NextUpCard
      classData={makeClass({
        scoredEntries: 0,
        currentDogInRing: null,
        totalEntries: 8,
        ringNumber: 0,
      })}
    />
  );
  expect(screen.queryByText(/Ring 0/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run NextUpCard tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/components/NextUpCard.test.tsx
```

Expected: FAIL because `Ring 0` can still render.

- [ ] **Step 3: Use the shared formatter in NextUpCard**

In `apps/myk9show/src/components/exhibitor/NextUpCard.tsx`, add the import:

```typescript
import { formatRingLabel } from '@/utils/ringLabel';
```

Inside the component, after `const classLabel = ...`, add:

```typescript
const ringLabel = formatRingLabel(classData.ringNumber);
```

Replace the direct ring rendering with:

```tsx
{ringLabel && <span className="ml-2">&bull; {ringLabel}</span>}
```

- [ ] **Step 4: Run NextUpCard tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/components/NextUpCard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/NextUpCard.tsx apps/myk9show/src/test/components/NextUpCard.test.tsx
git commit -m "fix(show): hide missing rings on next-up card"
```

## Task 4: Check-In Page Omits Missing Rings

**Files:**
- Modify: `apps/myk9show/src/components/exhibitor/ClassCheckIn.tsx`
- Modify: `apps/myk9show/src/test/pages/ClassCheckInPage.test.tsx`

- [ ] **Step 1: Add page-level missing-ring assertion**

In `apps/myk9show/src/test/pages/ClassCheckInPage.test.tsx`, set the default fixture's class ring value to `null` and add:

```typescript
expect(screen.queryByText(/Ring 0/)).not.toBeInTheDocument();
expect(screen.queryByText(/Ring null/)).not.toBeInTheDocument();
```

Add a separate positive assertion with `ringNumber: 2`:

```typescript
expect(screen.getByText('Ring 2')).toBeInTheDocument();
```

- [ ] **Step 2: Run the page test red**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/pages/ClassCheckInPage.test.tsx
```

Expected: FAIL while `ClassCheckIn` renders direct ring text.

- [ ] **Step 3: Use the formatter in ClassCheckIn**

In `apps/myk9show/src/components/exhibitor/ClassCheckIn.tsx`, add:

```typescript
import { formatRingLabel } from '@/utils/ringLabel';
```

Inside the component body, derive:

```typescript
const ringLabel = formatRingLabel(showClass.ringNumber);
```

Replace:

```tsx
<p className="text-gray-600">Ring {showClass.ringNumber}</p>
```

with:

```tsx
{ringLabel && <p className="text-gray-600">{ringLabel}</p>}
```

- [ ] **Step 4: Run the page test green**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/pages/ClassCheckInPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/ClassCheckIn.tsx apps/myk9show/src/test/pages/ClassCheckInPage.test.tsx
git commit -m "fix(show): hide missing rings on class check-in"
```

## Task 5: Multi-Dog Schedule Omits Missing Rings

**Files:**
- Modify: `apps/myk9show/src/components/exhibitor/MultiDogSchedule.tsx`

- [ ] **Step 1: Add local helper usage**

In `apps/myk9show/src/components/exhibitor/MultiDogSchedule.tsx`, import:

```typescript
import { formatRingLabel } from '@/utils/ringLabel';
```

Near other local formatting helpers, add:

```typescript
function entryRingLabel(entry: { ringNumber: number | null }): string | null {
  return formatRingLabel(entry.ringNumber);
}
```

- [ ] **Step 2: Replace direct schedule ring rendering**

In the timeline entry metadata, replace:

```tsx
<span className="flex items-center gap-1">
  <MapPin className="w-3 h-3" />
  Ring {entry.ringNumber}
</span>
```

with:

```tsx
{entryRingLabel(entry) && (
  <span className="flex items-center gap-1">
    <MapPin className="w-3 h-3" />
    {entryRingLabel(entry)}
  </span>
)}
```

In the by-dog detail text, replace:

```tsx
{formatTime(new Date(entry.scheduledTime!))} • Ring {entry.ringNumber}
```

with:

```tsx
{[formatTime(new Date(entry.scheduledTime!)), entryRingLabel(entry)].filter(Boolean).join(' • ')}
```

- [ ] **Step 3: Run TypeScript for this app**

Run:

```bash
pnpm --filter @myk9/myk9show typecheck
```

Expected: PASS. If the package name differs, run `cd apps/myk9show && pnpm typecheck`.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/MultiDogSchedule.tsx
git commit -m "fix(show): hide missing rings in dog schedule"
```

## Task 6: Audit Remaining Production Ring Interpolations

**Files:**
- Inspect: `apps/myk9show/src`
- Modify only files that can receive nullish or zero ring data in production.

- [ ] **Step 1: Run the production interpolation audit**

Run:

```bash
rg -n 'Ring \\{|Ring \\$|Ring \\+' apps/myk9show/src packages --glob '!**/__tests__/**' --glob '!**/*.test.*'
```

Expected: results include demo/static text and production renderers. Classify each result as static fixture copy, already guarded, or needs formatter.

- [ ] **Step 2: Patch only runtime paths that accept data**

For each production renderer that interpolates a data value, use this pattern:

```typescript
const ringLabel = formatRingLabel(source.ringNumber);
```

```tsx
{ringLabel && <span>{ringLabel}</span>}
```

For notification code, keep existing truthy checks when `ringNumber?: number` already prevents `0`, `null`, and `undefined` from rendering.

- [ ] **Step 3: Run focused tests plus typecheck**

Run:

```bash
cd apps/myk9show && npx vitest run src/utils/ringLabel.test.ts src/hooks/queries/__tests__/useClassCheckInData.test.ts src/test/hooks/useShowDayData.test.ts src/test/components/NextUpCard.test.tsx src/test/pages/ClassCheckInPage.test.tsx
pnpm typecheck
```

Expected: PASS. If the test runner hangs for more than 60 seconds, stop it and report the hang with the last visible test name.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src packages
git commit -m "fix(show): audit ring label fallbacks"
```

## Task 7: Close The Todo

**Files:**
- Modify: `OPEN-TODOS.md`

- [ ] **Step 1: Mark the selected todo complete**

In `OPEN-TODOS.md`, change:

```markdown
- [ ] **Decide the ring-number contract and audit Ring UI fallbacks**
```

to:

```markdown
- [x] **Decide the ring-number contract and audit Ring UI fallbacks**
```

Append a short completion note to the same line:

```markdown
Contract documented in `docs/superpowers/specs/2026-05-24-ring-number-contract-design.md`; implementation normalizes missing ring values to `null`, omits unknown ring labels, and keeps persisted ring scheduling deferred to a sport-aware model.
```

- [ ] **Step 2: Run final verification**

Run:

```bash
cd apps/myk9show && npx vitest run src/utils/ringLabel.test.ts src/hooks/queries/__tests__/useClassCheckInData.test.ts src/test/hooks/useShowDayData.test.ts src/test/components/NextUpCard.test.tsx src/test/pages/ClassCheckInPage.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add OPEN-TODOS.md
git commit -m "chore: close ring number contract todo"
```
