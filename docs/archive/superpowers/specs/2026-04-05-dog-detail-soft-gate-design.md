# Dog Detail Soft Gate — Design Spec

**Date:** 2026-04-05
**Status:** Approved

---

## Problem

62% of tabs (5 of 8) on the Dog Detail page are fully locked behind a hard `PremiumGate` wall. Free-tier exhibitors see a page that feels like a paywall — crown icon, upgrade prompt, no preview of what they'd get. This hurts engagement and weakens the upgrade motivation.

## Goal

Replace the hard gate with a soft gate: render real tab content behind a blur overlay. Free users see the shape and density of their own data and understand exactly what they'd unlock.

---

## Affected Tabs

These 5 tabs currently use `PremiumGate` and will switch to `BlurGate`:

| Tab              | Feature description                              |
| ---------------- | ------------------------------------------------ |
| Title Progress   | Progress bars toward AKC/UKC/ASCA titles         |
| Statistics       | Performance trends, qualification rates, charts  |
| Health Records   | Vaccinations, vet visits, medications, allergies |
| Training Journal | Training session log                             |
| Pedigree         | Three-generation ancestry tree                   |

The 3 free tabs (Registrations, Competitions, Activity) are unchanged.

---

## Solution

### New Component: `BlurGate`

**File:** `apps/myk9show/src/components/common/BlurGate.tsx`

A wrapper component that always renders its children (allowing data to fetch normally), but when `locked={true}` applies a blur + overlay on top.

**Props:**

```typescript
interface BlurGateProps {
  locked: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}
```

**Behavior when `locked={true}`:**

- Wraps children in a `position: relative` container
- Children render with `filter: blur(4px)` and `pointer-events: none`
- Absolute-positioned overlay covers the full area:
  - Semi-transparent dark background (~65% opacity, matching app dark theme)
  - Crown icon with gold gradient (matching existing `PremiumGate` visual language)
  - `title` in white bold
  - `description` in muted secondary text
  - "Upgrade to Premium →" button — uses `useNavigate('/pricing-page')` (same route as existing `PremiumGate`)

**Behavior when `locked={false}`:**

- Returns children directly with no DOM wrapper — no extra element in the tree

### Changes to `DogDetailsTabs`

**File:** `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx`

Replace the ternary pattern for each of the 5 premium tabs:

```tsx
// Before
{
  isPremium ? (
    <Suspense fallback={<TabContentSkeleton />}>
      <TitleProgressSection dogId={dog.id} />
    </Suspense>
  ) : (
    <PremiumGate title="Title Progress" description="..." trackingContext="title-progress" />
  );
}

// After
<BlurGate locked={!isPremium} title="Title Progress" description="...">
  <Suspense fallback={<TabContentSkeleton />}>
    <TitleProgressSection dogId={dog.id} />
  </Suspense>
</BlurGate>;
```

Applied identically to all 5 gated tabs. The `PremiumGate` component is not deleted — it remains for use elsewhere in the codebase.

---

## Data Fetching

Tab section components fetch their own data internally via Suspense + React Query. They will now fire for free users as well as premium users.

**Why this is acceptable:**

- It's the exhibitor looking at their own dog's data — no privacy concern
- React Query caches responses, so navigating between tabs is fast
- Query payloads are small (titles, stats, health records per dog)

**Empty state handling:** If a tab has no data yet (e.g. no health records entered), the tab's own empty state renders behind the blur. The overlay still displays correctly. No special handling needed.

---

## Visual Design

The overlay matches the existing `PremiumGate` visual language:

- Crown icon with `linear-gradient(135deg, #f59e0b, #d97706)` background
- "Premium Feature" heading
- Short description from the `description` prop
- "Upgrade to Premium" CTA button — navigates to `/pricing-page` via `useNavigate`

Blur intensity: `filter: blur(4px)` on the content container. Overlay background: `rgba(9, 11, 17, 0.65)`.

---

## Testing

**`BlurGate.test.tsx`:**

- Renders children when `locked={false}`
- Applies blur and overlay when `locked={true}`
- Overlay contains title, description, and upgrade button
- Upgrade button navigates to pricing page

**`DogDetailsTabs.test.tsx` updates:**

- Each of the 5 premium tabs shows `BlurGate` overlay for free users
- Each of the 5 premium tabs shows full content for premium users
- Tab content sections still render (data fetch fires) for free users

---

## Out of Scope

- Changes to free tabs (Registrations, Competitions, Activity)
- Changes to `PremiumGate` component
- Changes to subscription/pricing pages
- Analytics tracking on the blur overlay (can be added later)
