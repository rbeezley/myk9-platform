# Plan 004: Reset the checkout button after a waitlist-only checkout

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result. Honor "STOP conditions". Update this plan's row
> in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 929240192..HEAD -- apps/myk9show/src/pages/CartPage.tsx`
> If changed, compare the "Current state" excerpt to the live code; on mismatch, STOP.

## Status

- **Priority**: P3 (quick polish win)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UI state)
- **Planned at**: commit `929240192`, 2026-07-02

## Why this matters

In `handleCheckout` the "Checking out…" spinner is turned off on every exit path
**except** the waitlist-only success branch. When a cart contains only
waitlisted entries (`splitResult.confirmed.length === 0`), the code navigates to
the success page **without** calling `setIsCheckingOut(false)`
(`CartPage.tsx:207-214`). The checkout button is left visually stuck in its
loading state on the frame(s) before navigation, and if navigation is delayed or
the page doesn't unmount immediately, the exhibitor sees a frozen "Checking out…"
button after their request actually succeeded — inviting a confused re-click.

Every *other* branch resets it: blocked items (line 171), null split result
(178), removal failure (190), and the catch (221). Only this one success path
was missed. Small, but it's the exhibitor's first checkout — polish matters.

## Current state

```ts
// CartPage.tsx:207-214  — success branch, missing the reset
if (splitResult.confirmed.length === 0) {
  navigate(
    splitCheckoutId
      ? `/checkout/success?waitlist=1&split=${encodeURIComponent(splitCheckoutId)}`
      : '/checkout/success?waitlist=1'
  );
  return;
}

// For contrast, the Stripe-redirect branch below (line 217) intentionally does
// NOT reset — it hands off to Stripe and the page is leaving anyway.
await createEntryCheckoutSession(cart.id, splitCheckoutId ? { splitCheckoutId } : undefined);
```

- State declared at `CartPage.tsx:66`
  (`const [isCheckingOut, setIsCheckingOut] = useState(false);`) and passed to
  the button at line 385 (`isCheckingOut={isCheckingOut}`).
- **Existing tests**: `apps/myk9show/src/pages/__tests__/CartPage.splitCheckout.test.tsx`
  already exercises the split/waitlist checkout path — add the assertion there.

## Commands you will need

| Purpose   | Command                                                                                          | Expected |
|-----------|--------------------------------------------------------------------------------------------------|----------|
| Typecheck | `pnpm typecheck`                                                                                  | exit 0   |
| One test  | `cd apps/myk9show && npx vitest run src/pages/__tests__/CartPage.splitCheckout.test.tsx`          | all pass |
| Lint      | `pnpm lint`                                                                                       | exit 0   |

## Scope

**In scope**:
- `apps/myk9show/src/pages/CartPage.tsx` (one line in the waitlist-only branch)
- `apps/myk9show/src/pages/__tests__/CartPage.splitCheckout.test.tsx` (add a case)

**Out of scope**:
- The Stripe-redirect branch (line 217) — leave it; not resetting is correct there.
- The cart-hydration effect and any other handler.

## Git workflow

- Branch: `advisor/004-cart-checkout-loading-reset`
- `fix(cart): clear checkout spinner on waitlist-only success`
- Do NOT push/PR unless instructed.

## Steps

### Step 1 (assertion-first): failing test

In `CartPage.splitCheckout.test.tsx`, add a case for the all-waitlisted result:
after the checkout completes with `confirmed.length === 0`, assert the button is
no longer in its checking-out state before navigation. Depending on how the test
renders the button, assert either that the button is not disabled / not showing
"Checking out…" (query by role/text as the sibling tests do), or spy on the
`CartCheckoutBar`'s `isCheckingOut` prop being `false` at navigation time.

Model the arrange/act on the existing waitlist test already in this file.

**Verify** it FAILS against current code:
`cd apps/myk9show && npx vitest run src/pages/__tests__/CartPage.splitCheckout.test.tsx`
→ new case fails. Good.

### Step 2: reset before navigating

In the waitlist-only branch, add the reset immediately before `navigate(...)`:
```ts
if (splitResult.confirmed.length === 0) {
  setIsCheckingOut(false);
  navigate(/* …unchanged… */);
  return;
}
```

**Verify** the new test passes and the file's existing tests stay green.

### Step 3: gates

`pnpm typecheck` → 0. `pnpm lint` → 0.

## Test plan

- One new case in `CartPage.splitCheckout.test.tsx` proving the spinner is
  cleared on the all-waitlisted success path.
- Then `cd apps/myk9show && pnpm test` green.

## Done criteria (ALL)

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `CartPage.splitCheckout.test.tsx` passes, including the new case
- [ ] The waitlist-only branch calls `setIsCheckingOut(false)` before `navigate`
      (`grep -n "setIsCheckingOut(false)" apps/myk9show/src/pages/CartPage.tsx`
      shows an occurrence inside the `confirmed.length === 0` block)
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `plans/README.md` row for 004 updated

## STOP conditions

- The button's loading state turns out to be driven by something other than
  `isCheckingOut` (e.g. a mutation's `isPending`) — STOP; the reset target may
  differ from what this plan assumes.

## Maintenance notes

- If `handleCheckout` is ever refactored, the safest shape is a single
  `finally { setIsCheckingOut(false); }` around the whole try — except that the
  Stripe-redirect branch deliberately leaves the spinner on during handoff, so a
  blanket finally would need a guard. Note that tension for the next editor.
