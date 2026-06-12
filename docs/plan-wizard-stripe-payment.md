# Plan: Wire Registration Wizard Online Payment to Stripe

**Ticket:** OPEN-TODOS.md:472 — LAUNCH BLOCKER

## Problem

The wizard's "Credit/Debit Card (Online Payment)" path never reaches Stripe. It calls
`confirmRegistration(regId, 'MOCK-PAYMENT-REF')`, creates entries synchronously, and
shows "Online payment coming soon." The parallel cart path (`createEntryCheckoutSession`
→ `/cart` → Stripe checkout) works end-to-end but the wizard never hands off to it.

## Architecture decisions

| Question | Decision | Reason |
|---|---|---|
| When is `show_registrations` created for `credit_card`? | **Not in the wizard handoff** — the canonical cart/Stripe path writes paid entries and Stripe order records after checkout | Avoids orphan registration rows when the user abandons Stripe |
| Does the wizard navigate away for credit_card? | **Yes — navigate to `/cart`** | Keeps the cart/checkout flow as the single entry-creation path; no ConfirmationStep in the wizard |
| Armbands pre-payment? | **No** — not claimed until show day | `CheckoutSuccessPage` already says "armband assigned at check-in"; this is correct |
| Duplicate-cart race for re-entries? | **`loadCart` first, clear items if found, then repopulate** | Handles back-button and browser-refresh without creating orphan carts |
| `exhibitorId` for the cart | `ownerResolution.ownerId` (a `people.id`) | Already computed in the wizard; the same field `entry_carts.exhibitor_id` expects |

## Phases

### Phase 1 — `registrationToCartItems` utility

**Goal:** convert wizard state → `NewCartItem[]` (the inverse of the existing
`reconcileCartToSelections` direction).

**New file:** `apps/myk9show/src/utils/registrationToCartItems.ts`

```ts
// Signature
export function registrationToCartItems(
  showId: string,
  classSelections: ClassSelectionData[],
  handlerAssignments: Record<string, HandlerInfo>,
  classes: Array<{ id: string; entryFee?: number }>,
  showFeeInfo: ShowFeeInfo
): NewCartItem[]
```

Implementation mirrors `registrationToEntries.ts`:
- Iterate `classSelections`, for each `selectedClasses` entry produce a `NewCartItem`
- Fee: reuse `getShowEntryFee(showFeeInfo, classData?.entryFee)` → multiply by 100 → `entryFeeCents`
- Handler: look up `handlerAssignments[\`${dogId}|${classId}\`]?.handlerId` → `handlerId`
- Jump height: `selectedClass.jumpHeight` → `jumpHeight`

**Tests:** `apps/myk9show/src/utils/registrationToCartItems.test.ts`
- Maps single class selection to one cart item with correct fee cents
- Carries jump height through
- Carries handler ID through
- Multiple dogs produce multiple items
- Unknown class defaults to show pre-entry fee
- Empty selections returns `[]`

---

### Phase 2 — Wizard payment fork

**File:** `apps/myk9show/src/pages/RegistrationWizardPage.tsx`

In `handleNext`, replace the monolithic `submitShowRegistration` call with a fork
immediately after the `currentStepId === 'payment'` guard:

```ts
if (registrationData.paymentMethod === 'credit_card') {
  // --- Stripe path ---
  if (!ownerResolution.ok) {
    notifications.error('Cannot determine exhibitor for this entry.');
    return;
  }
  submittingRef.current = true;
  setIsSubmitting(true);
  try {
    const exhibitorId = ownerResolution.ownerId;
    // Reuse or create cart
    let cart = await cartStore.loadCart(showId, exhibitorId);
    if (cart) {
      // [EXPANDED] clearCart must succeed before adding items — stale items from a
      // prior session must not mix with the new selection. Throw if it fails so the
      // user sees an error instead of a cart with doubled entries.
      const cleared = await cartStore.clearCart();
      if (!cleared) throw new Error('Failed to clear existing cart. Please try again.');
    } else {
      cart = await cartStore.createCart(showId, exhibitorId);
    }
    if (!cart) throw new Error('Failed to create cart');

    const items = registrationToCartItems(
      showId, classSelections, handlerAssignments, classes, showFeeInfo
    );
    // [EXPANDED] Track whether any items were added so the catch block knows
    // whether to clean up a partially-populated cart.
    let addedCount = 0;
    try {
      for (const item of items) {
        const ok = await cartStore.addItem(item);
        if (!ok) throw new Error('Failed to add entry to cart');
        addedCount++;
      }
    } catch (addError) {
      // Partial add: abandon the cart so the next attempt starts clean.
      // addedCount > 0 means at least one item persisted — don't leave it.
      if (addedCount > 0) {
        await cartStore.abandonCart();
      }
      throw addError;
    }

    // [ADDED] Delete the wizard draft now that selections are in the cart.
    // Without this, a stale draft re-hydrates if the user returns to the wizard
    // after a successful Stripe payment (e.g. browser back from success page).
    await draftDelete();

    navigate('/cart');
  } catch (error) {
    notifications.error(getErrorMessage(error));
  } finally {
    submittingRef.current = false;
    if (mountedRef.current) setIsSubmitting(false);
  }
  return;
}
// --- Existing check/cash/secretary_paid/etc. path ---
const submissionResult = await submitShowRegistration({ ... });
```

Note: the local Zustand `registrationId` is **not** persisted to the DB on the
credit_card path. The cart/Stripe completion path inserts the paid entries and
Stripe order records after payment rather than creating a `show_registrations`
row during wizard handoff.

---

### Phase 3 — Remove the mock and update copy

**`apps/myk9show/src/features/registration/submitShowRegistration.ts`**

In `ensureEnrollment`, remove the `credit_card` branch. Add a throw to guard against
accidental future callers:

```ts
// credit_card should never reach here — the wizard forks before calling this
if (paymentMethod === 'credit_card') {
  throw new Error('Invariant: submitShowRegistration called with credit_card payment method');
}
```

**`apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/PaymentMethodSelector.tsx`**

Replace the "coming soon" `INTENT:` block:

```tsx
// Before (lines 163–173):
// INTENT: No card form here — online payment via Stripe is not yet integrated...
{paymentMethod === 'credit_card' && (
  <Alert>
    <Info ... />
    <AlertDescription>{PAYMENT_MESSAGES.CARD_COMING_SOON}</AlertDescription>
  </Alert>
)}

// After:
{paymentMethod === 'credit_card' && (
  <div className="ml-4 border-l-2 border-primary/20 pl-4">
    <Alert>
      <CreditCard className="h-4 w-4" />
      <AlertDescription>
        You'll be taken to our secure checkout to complete payment. Your entries
        will be confirmed once payment is processed.
      </AlertDescription>
    </Alert>
  </div>
)}
```

Also update the `description` prop on the `credit_card` `PaymentOptionCard`:
```
"Secure online payment via credit or debit card"
```

Remove `CARD_COMING_SOON` from `PaymentStep/types.ts` `PAYMENT_MESSAGES`.

---

### Phase 4 — Tests

**`RegistrationWizardPage` fork tests** (new describe block in existing test file or
a new `RegistrationWizardPage.payment.test.tsx`):

- When `paymentMethod === 'credit_card'`: `submitShowRegistration` is NOT called
- Happy path — no existing cart: `cartStore.createCart` called with `(showId, ownerResolution.ownerId)`, `cartStore.addItem` called once per class selection, `draftDelete` called, `navigate('/cart')` called
- **[ADDED] Cart reuse path**: when `loadCart` returns an existing cart, `clearCart` is called before `addItem`; `createCart` is NOT called
- **[ADDED] clearCart failure**: when `clearCart` returns false, an error toast is shown and `navigate` is NOT called
- Error from `addItem` on item N: `abandonCart` called (because `addedCount > 0`); error toast shown; `navigate` NOT called
- **[ADDED] addItem failure on first item** (addedCount === 0): `abandonCart` is NOT called; error toast shown
- Error shows toast and does NOT call `navigate`

**Update `submitShowRegistration.test.ts`:** [EXPANDED]

The first test (`'confirms credit-card registration, submits entries, and writes armbands back'`)
directly asserts `confirmRegistration` was called with `MOCK-PAYMENT-REF`. This entire
test must be **replaced** (not just deleted) with:

```ts
it('throws when called with credit_card payment method', async () => {
  const params = makeParams({ paymentMethod: 'credit_card' });
  await expect(submitShowRegistration(params)).rejects.toThrow(
    'Invariant: submitShowRegistration called with credit_card payment method'
  );
  expect(params.deps.confirmRegistration).not.toHaveBeenCalled();
  expect(params.deps.submitShowEntries).not.toHaveBeenCalled();
});
```

Any other tests that pass `paymentMethod: 'credit_card'` (there are several in the
file using `makeParams()` which defaults to `credit_card`) must be updated to use
a non-card method (e.g. `'check'`) so they still exercise the submission logic.

**Update `PaymentMethodSelector.test.tsx`:**
- Remove test asserting "coming soon" text
- Add test asserting redirect copy is shown when `credit_card` selected

---

### Phase 5 — Verification checklist

Run locally before opening PR:

- [ ] `pnpm typecheck` passes
- [ ] `cd apps/myk9show && pnpm test` passes (no hanging tests)
- [ ] Walk the wizard with `credit_card` selected → lands on `/cart` with items pre-loaded
- [ ] Walk the wizard with `check` selected → existing flow unchanged
- [ ] `/cart` → Stripe → `CheckoutSuccessPage` completes end-to-end (use Stripe test card `4242 4242 4242 4242`)
- [ ] Re-entry after abandoning Stripe: wizard → credit_card → cart has fresh items (stale items cleared)

---

## Out of scope (tracked separately)

- **Confirmation email** for the Stripe path — OPEN-TODOS.md:473 notes this rides with
  this blocker but should be its own PR to avoid scope creep
- **`loadActiveCart` newest-cart clobber** — noted in Codex round 13 deferred list;
  belongs in a follow-up
- **`stripe_subscriptions` missing UNIQUE constraint** — pre-existing, separate fix

## Files changed (summary)

| File | Change |
|---|---|
| `src/utils/registrationToCartItems.ts` | New — wizard→cart conversion |
| `src/utils/registrationToCartItems.test.ts` | New — unit tests |
| `src/pages/RegistrationWizardPage.tsx` | Fork credit_card path before `submitShowRegistration` |
| `src/features/registration/submitShowRegistration.ts` | Remove credit_card branch, add invariant throw |
| `src/components/.../PaymentMethodSelector.tsx` | Remove "coming soon"; add redirect copy |
| `src/components/.../PaymentStep/types.ts` | Remove `CARD_COMING_SOON` message |
| Existing test files | Update credit_card assertions |
