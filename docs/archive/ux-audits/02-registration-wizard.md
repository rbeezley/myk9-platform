# UX Audit: Registration Wizard

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of RegistrationWizardPage.tsx and RegistrationWorkflow/ components
**Role context:** Exhibitor -- "This respects my time"

---

## Executive Summary

The Registration Wizard is architecturally sound -- role-aware workflow configs, draft persistence, optimistic updates, and cart integration are all present. However, the exhibitor flow has significant friction that works against the INTENT target of "30 seconds." The biggest issues: the payment step requires too many decisions, the class selection step has collapsed trials by default, credit card fields are a mock form rather than Stripe Elements, and there is no loading/submission feedback during the heavy async work on payment-to-confirmation transition. Several quick wins could cut exhibitor time in half.

---

## Pass 1: Mental Model Alignment

**Question:** Does the wizard flow match how exhibitors think about entering a show?

### Exhibitor Flow (3 steps: Classes -> Payment -> Confirmation)

| Finding                                                                | Severity | Details                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Good: Dog selection is auto-skipped for exhibitors                     | --       | `WORKFLOW_CONFIGS.exhibitor` has only `['class-selection', 'payment', 'confirmation']`. All dogs are auto-selected. This matches the mental model: "I'm entering MY dogs."                                                                                                                                                           |
| Good: Handler auto-assigned to owner                                   | --       | `smartDefaults.autoAssignHandler: true` means most exhibitors never think about handlers. The inline collapsible in ClassSelectionStep only surfaces if needed.                                                                                                                                                                      |
| Issue: Exhibitor sees "Confirmation" as a step they must click through | Medium   | The confirmation step is a read-only receipt, but the wizard forces the user to click "Complete Registration" (the "Next" button on the last step). Exhibitors expect to be done after paying. The confirmation should be a success page, not a step that requires a final click.                                                    |
| Issue: "Payment" step mental model mismatch                            | Medium   | Exhibitors think: "How much and how do I pay?" But the payment step shows a full fee breakdown, 3+ payment method cards (some secretary-only, gated by `PermissionGuard`), a credit card mock form, registration summary, payment summary, AND a security notice. This is a review-and-pay page, but it presents as a wall of cards. |
| Issue: No "Review" step before payment                                 | Low      | Exhibitors cannot see a summary of what they selected (dogs + classes + handlers) before committing to payment. The payment step shows a fee breakdown, but not a human-readable "You are entering Rover in Novice Buried and Elite Handler Discrimination" summary.                                                                 |

### Secretary Flow (5 steps: Dogs -> Classes -> Handlers -> Payment -> Confirmation)

The secretary flow is appropriately longer. No mental model issues -- secretaries expect more steps because they are managing someone else's registration.

---

## Pass 2: Information Architecture

**Question:** Is each step focused? Is information grouped logically?

| Step               | Finding                                                    | Severity | Details                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dog Selection      | Good: Focused, single purpose                              | --       | Shows eligible dogs with checkboxes, breed/gender/DOB metadata, registration badges. Selection count summary at bottom.                                                                                                                                                                                                                                                                     |
| Dog Selection      | Issue: 400px fixed ScrollArea height                       | Low      | `ScrollArea className="h-[400px]"` -- for a user with 1-2 dogs, this wastes space. For a user with 10+ dogs, it works fine. Should be `max-h-[400px]` to avoid empty scroll area.                                                                                                                                                                                                           |
| Class Selection    | Issue: Trial sections collapsed by default (all but first) | High     | `expandedTrials` state initializes with only `firstTrialId`. For a multi-trial show (common: 2-3 trials per weekend), the exhibitor must manually expand each trial to see available classes. This is the single biggest friction point. Most exhibitors enter the same elements across all trials.                                                                                         |
| Class Selection    | Issue: Dog tabs when exhibitor has 1 dog                   | Low      | If the user has only one dog, a tab bar with a single tab is visual noise. Single-dog exhibitors (probably 40%+ of users) should see no tabs at all.                                                                                                                                                                                                                                        |
| Class Selection    | Good: Element/level grouping is smart                      | --       | Classes grouped by element (e.g., "Buried") with level chips (Novice, Advanced, Excellent). This matches how exhibitors think about scent work entries.                                                                                                                                                                                                                                     |
| Class Selection    | Issue: Cart summary shown twice                            | Low      | Both `DogCartSummary` (per-dog) and `OverallCartSummary` (total) render at the bottom. For a single-dog exhibitor, these show the same information.                                                                                                                                                                                                                                         |
| Handler Assignment | Good: "Set all" bulk action                                | --       | `entries.length > 1` triggers a "Set all for [Dog]" button. This is a smart default.                                                                                                                                                                                                                                                                                                        |
| Handler Assignment | Issue: Opens a dialog for handler changes                  | Medium   | Changing a handler requires opening `HandlerSelectionDialog` -- a modal on top of the wizard. This is an extra click + context switch for what should be a simple reassignment.                                                                                                                                                                                                             |
| Payment            | Issue: Too many cards stacked vertically                   | Medium   | The payment step renders 4 cards in sequence: RegistrationSummary, PaymentMethodSelector, SecretaryPaymentManagement (permission-gated), PaymentSummaryCard, plus a security Alert. For exhibitors (who only see 3 payment options: credit card, check, cash), this is still 3 cards + alert = a lot of vertical scrolling.                                                                 |
| Payment            | Issue: Credit card fields are a mock form                  | High     | `PaymentMethodSelector` renders local state fields (`cardNumber`, `expiryDate`, `cvv`, `cardholderName`) that are never submitted anywhere. The CreditCardVisual component collects real-looking card data but the actual payment path in `handleNext` uses `'MOCK-PAYMENT-REF'`. This is confusing and potentially concerning for users who type real card numbers into a non-Stripe form. |
| Confirmation       | Issue: Too much content for a receipt page                 | Medium   | The confirmation step renders: success banner, show info card, dogs/classes card, payment summary card, RegistrationManagementPanel (secretary-only), NotificationPreferencesCard, documents card, important reminders alert, and action buttons. Even for exhibitors (where management panel is gated), this is 6+ sections to scroll through.                                             |
| Confirmation       | Good: Armband assignments shown immediately                | --       | If armbands were assigned during the payment->confirmation transition, they display inline with each dog.                                                                                                                                                                                                                                                                                   |

---

## Pass 3: Affordance Clarity

**Question:** Are buttons clear? Can users tell what's required vs optional?

| Finding                                                                                                             | Severity | Details                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Good: WizardNavigation has clear Back/Next/Complete buttons                                                         | --       | `nextLabel` switches to "Complete Registration" on last step. Back button shows "Cancel" on step 0. Arrow icons reinforce direction.                                                                                                                                                  |
| Issue: "Next" button glow effect is distracting                                                                     | Low      | `WizardNavigation` renders an animated pulsing glow (`animate-pulse`) behind the Next button when `canGoNext` is true. INTENT.md says "No surprise animations -- motion is purposeful, never decorative." This glow is decorative and could be distracting for older/sensitive users. |
| Issue: Step indicator glow is also decorative                                                                       | Low      | `VerticalProgressIndicator` has a pulsing glow on the current step circle (`animate-pulse` with `animationDuration: 2s`). Same concern as above.                                                                                                                                      |
| Issue: Draft "Save" button disabled when no unsaved changes, but no visual indicator when there ARE unsaved changes | Medium   | `DraftIndicator` shows a green "Saved" badge when `!hasUnsavedChanges`, but shows nothing at all when there are unsaved changes. The user has no way to know their work is at risk. Should show "Unsaved changes" or similar.                                                         |
| Issue: "Save Draft" requires a title in a dialog                                                                    | Medium   | To save a draft, the user must: click "Save Draft" button -> type a title in a dialog -> click "Save Draft" again. This is 3 interactions for a safety feature. Auto-save happens every 30 seconds, but manual save is too heavy.                                                     |
| Issue: Back button on step 0 navigates to browser history                                                           | Low      | `handleBack` calls `navigate(-1)` when `currentStep > 0` is false. The header also has a "Back" button that calls `navigate(-1)`. Two different back buttons, same behavior, but the header one is always visible. This could cause confusion about which "back" does what.           |
| Good: Disabled state on Next button when validation fails                                                           | --       | `canProceed()` returns false until required selections are made. Button grays out cleanly.                                                                                                                                                                                            |
| Issue: No indication of what's missing when Next is disabled                                                        | Medium   | When `canProceed()` returns false, the Next button is simply disabled. No tooltip, no inline message saying "Select at least one class to continue." Users must figure out why they cannot proceed.                                                                                   |
| Good: Payment option cards have clear selection state                                                               | --       | `PaymentOptionCard` uses border color, background, and a check circle to show selected state. Large touch targets.                                                                                                                                                                    |

---

## Pass 4: Cognitive Load

**Question:** How many decisions per step? Smart defaults? Total fields?

### Decision Count by Step (Exhibitor Flow)

| Step            | Required Decisions                               | Optional Decisions                                       | Fields                      | Time Estimate                   |
| --------------- | ------------------------------------------------ | -------------------------------------------------------- | --------------------------- | ------------------------------- |
| Class Selection | Select classes for each dog (N classes x M dogs) | Change handler (inline collapsible)                      | 0 text fields, N checkboxes | 15-60s depending on trial count |
| Payment         | Select payment method (1 of 3)                   | Enter card details (4 fields) OR check number (1 field)  | 0-5 fields                  | 10-30s                          |
| Confirmation    | Click "Complete Registration"                    | Download receipt, email confirmation, notification prefs | 0 required fields           | 5-10s                           |

**Total minimum taps for a single-dog, single-trial, 2-class entry:** Select 2 classes (2 taps) -> Next (1 tap) -> Select payment method (1 tap) -> Next (1 tap) -> Complete (1 tap) = **6 taps**. This is close to the "30 seconds" target.

**Total taps for a realistic scenario (1 dog, 3 trials, 2 classes per trial):** Expand trial 2 (1 tap) -> select 2 classes (2 taps) -> expand trial 3 (1 tap) -> select 2 classes (2 taps) -> trial 1 already expanded, select 2 classes (2 taps) -> Next (1 tap) -> select payment (1 tap) -> Next (1 tap) -> Complete (1 tap) = **12 taps**. Still feasible in 30 seconds IF the user knows what to do.

**Worst case: 2 dogs, 3 trials, different handlers:** Significantly more taps. Tab switching between dogs, expanding trials for each dog, changing handlers in dialogs. Easily 30+ taps, well over 30 seconds.

### Smart Defaults Assessment

| Default                                   | Present? | Quality                                         |
| ----------------------------------------- | -------- | ----------------------------------------------- |
| Auto-select all exhibitor's dogs          | Yes      | Excellent -- skips entire dog selection step    |
| Auto-assign owner as handler              | Yes      | Excellent -- `autoAssignHandler: true`          |
| Auto-calculate fees                       | Yes      | Good -- `autoCalculateFees: true`               |
| Remember last payment method              | No       | Missing -- user must re-select every time       |
| Pre-expand all trials                     | No       | Missing -- only first trial expanded            |
| Remember class preferences from last show | No       | Missing -- no "enter same classes as last time" |
| Draft auto-save                           | Yes      | Good -- 30-second interval                      |

### Missing Smart Defaults (High Impact)

1. **"Same as last show" button** -- If the exhibitor entered this dog in a previous show with the same elements, offer a one-tap "Enter same classes" option. This alone could reduce the class selection step to 1 tap.
2. **Remember payment method** -- Store the last-used payment method in user preferences.
3. **Expand all trials by default** -- Or better: flatten trials into a single list when the exhibitor has 1 dog.

---

## Pass 5: State Coverage

**Question:** Empty, loading, success, partial, and error states for each step?

| Step               | State                            | Covered? | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dog Selection      | Loading                          | Yes      | Spinner with "Loading your dogs..." text                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Dog Selection      | Empty                            | Yes      | "No eligible dogs found" with guidance text                                                                                                                                                                                                                                                                                                                                                                                                               |
| Dog Selection      | Error                            | No       | No error boundary or error state. If `useDogStoreCompat` fails, no feedback.                                                                                                                                                                                                                                                                                                                                                                              |
| Class Selection    | Loading (dogs auto-selecting)    | Yes      | Skeleton placeholders shown while `dogsLoading` is true                                                                                                                                                                                                                                                                                                                                                                                                   |
| Class Selection    | Empty (no dogs)                  | Yes      | Alert with link to register a dog                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Class Selection    | Empty (no trials)                | Yes      | `NoTrialsAlert` -- "No trials found, contact organizer"                                                                                                                                                                                                                                                                                                                                                                                                   |
| Class Selection    | Empty (no classes)               | Yes      | `NoClassesAlert` -- shows trial count but no classes                                                                                                                                                                                                                                                                                                                                                                                                      |
| Class Selection    | Cart add failure                 | Partial  | `toast.error('Failed to add to cart')` -- no retry, no details                                                                                                                                                                                                                                                                                                                                                                                            |
| Class Selection    | Cart remove failure              | Partial  | `toast.error('Failed to remove from cart')` -- same issue                                                                                                                                                                                                                                                                                                                                                                                                 |
| Handler Assignment | Loading                          | Yes      | "Loading dog information..." text                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Handler Assignment | Empty (no selections)            | Yes      | "No class selections found. Please go back and select classes."                                                                                                                                                                                                                                                                                                                                                                                           |
| Handler Assignment | All assigned                     | Yes      | Green alert: "All entries have handlers assigned"                                                                                                                                                                                                                                                                                                                                                                                                         |
| Handler Assignment | Partial                          | Yes      | Alert showing "X of Y entries have handlers assigned"                                                                                                                                                                                                                                                                                                                                                                                                     |
| Payment            | Loading                          | No       | No loading state during fee calculation                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Payment            | Error                            | No       | If `calculateTotalFees` throws or returns unexpected data, no error UI                                                                                                                                                                                                                                                                                                                                                                                    |
| Payment            | Credit card submission           | No       | No loading spinner or disabled state during payment processing                                                                                                                                                                                                                                                                                                                                                                                            |
| Confirmation       | Success                          | Yes      | Large green checkmark, "Registration Confirmed!"                                                                                                                                                                                                                                                                                                                                                                                                          |
| Confirmation       | Waitlist                         | Yes      | Orange warning in reminders list                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Confirmation       | Missing info                     | Yes      | Red warning in reminders list                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Confirmation       | Email send failure               | Partial  | Falls back to clipboard copy, then falls back to info toast. Graceful but confusing chain.                                                                                                                                                                                                                                                                                                                                                                |
| **Wizard-level**   | Payment->Confirmation transition | **No**   | **Critical gap.** `handleNext` on the payment step runs `submitRegistration`, `confirmRegistration`, `createMultipleEntries`, `assignArmband` (N times), and `updateRegistration` (N times). This is 5+ async operations with no loading indicator. The user sees nothing while this runs. If any operation fails, only some have try/catch -- `assignArmband` failures are swallowed silently, but `createMultipleEntries` has no error handling at all. |
| **Wizard-level**   | Network failure mid-wizard       | **No**   | No offline detection. If the user loses connectivity between steps, the next `handleNext` could fail silently (optimistic state updates succeed, but server operations fail).                                                                                                                                                                                                                                                                             |
| **Wizard-level**   | Browser back/refresh             | Partial  | Draft auto-save every 30s helps, but no "Are you sure you want to leave?" prompt. User could lose up to 30 seconds of work.                                                                                                                                                                                                                                                                                                                               |

### Critical State Gap: Payment-to-Confirmation Transition

This is the highest-severity finding in the audit. Lines 330-397 of `RegistrationWizardPage.tsx` execute:

```
submitRegistration(registrationId)
confirmRegistration(registrationId, 'MOCK-PAYMENT-REF')
createMultipleEntries(entryInputs, userId, 'submitted', dbRegistrationId)
assignArmband(showId, dogId)  // for each unique dog
updateRegistration(entry.id, { armband })  // for each entry with armband
```

All of this runs inside `handleNext` with no loading state (`isCreatingRegistration` is only used for the initial registration creation in dog selection). The `WizardNavigation` component accepts an `isLoading` prop but it is never passed from the page. If any of these calls takes more than a second (likely, given multiple DB operations), the user sees a frozen wizard with no feedback.

---

## Pass 6: Flow Integrity

**Question:** Walk the full journey. Count clicks. Note friction and abandonment risks.

### Happy Path: 1 dog, 1 trial, 2 classes, credit card payment

| #   | Action                                   | Taps           | Friction                                                                       | Abandonment Risk                                                 |
| --- | ---------------------------------------- | -------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | Land on wizard, see Class Selection step | 0              | Trial sections may be collapsed if >1 trial                                    | Low                                                              |
| 2   | Check 2 class checkboxes                 | 2              | None -- checkboxes are clear                                                   | Low                                                              |
| 3   | Click "Next"                             | 1              | None                                                                           | Low                                                              |
| 4   | Review fee summary (scroll)              | 0              | Must scroll past RegistrationSummary to find payment methods                   | Low                                                              |
| 5   | Click "Credit/Debit Card" option         | 1              | Mock credit card form appears -- asks for card number, expiry, CVV, name       | **High** -- user types real card data into a non-functional form |
| 6   | Fill 4 card fields                       | 4 interactions | These fields do nothing. No Stripe integration.                                | **High** -- if user notices nothing happens, trust is broken     |
| 7   | Click "Next"                             | 1              | **No loading indicator.** Multiple async operations fire. Page appears frozen. | **High** -- user may click again, causing duplicate submissions  |
| 8   | See Confirmation page                    | 0              | Scroll through 6+ sections                                                     | Low                                                              |
| 9   | Click "Complete Registration"            | 1              | Navigates to show page with success toast                                      | Low                                                              |

**Total taps:** 10 (plus 4 card field interactions)
**Total time estimate:** 45-90 seconds (fails the 30-second target)

### Friction Points Ranked

1. **Mock credit card form (High)** -- Collects card data that goes nowhere. This is the most dangerous UX issue. Either integrate Stripe Elements or don't show card fields.
2. **No loading state on payment submission (High)** -- The heaviest async work in the wizard has zero user feedback.
3. **Collapsed trial sections (High)** -- Forces extra taps for multi-trial shows.
4. **Confirmation requires a final click (Medium)** -- After payment, users expect to be done.
5. **No "why is Next disabled?" feedback (Medium)** -- Users stuck without guidance.
6. **Draft save requires dialog + title (Medium)** -- Over-engineered for a safety feature.
7. **Decorative animations violate INTENT.md (Low)** -- Pulsing glow on Next button and step indicator.

### Abandonment Risk Assessment

| Risk                                                           | Likelihood | Impact | Trigger                      |
| -------------------------------------------------------------- | ---------- | ------ | ---------------------------- |
| User types real card data, nothing happens, loses trust        | High       | High   | Mock credit card form        |
| User clicks Next on payment, page freezes, user navigates away | High       | High   | No loading feedback          |
| User with 3 trials gives up expanding each one                 | Medium     | Medium | Collapsed trials             |
| User loses progress on browser back/refresh                    | Low        | Medium | No "unsaved changes" warning |
| User confused by dual cart summaries                           | Low        | Low    | Single-dog scenario          |

---

## Summary

### Findings by Severity

#### Critical (fix before production)

| #   | Finding                                                                   | Pass | Recommendation                                                                                                                                                    |
| --- | ------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Mock credit card form collects real-looking card data but submits nothing | 2, 6 | Remove the card input form entirely. Show a message: "You'll be redirected to secure payment after confirming your entries." Or integrate Stripe Elements.        |
| C2  | No loading state during payment-to-confirmation async operations          | 5, 6 | Pass `isLoading` to `WizardNavigation`. Set a loading flag before the async block in `handleNext` and clear it after. Show a spinner overlay on the step content. |

#### High

| #   | Finding                                            | Pass | Recommendation                                                                                         |
| --- | -------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------ |
| H1  | Trial sections collapsed by default (except first) | 2, 4 | Initialize `expandedTrials` with ALL trial IDs. Exhibitors enter across trials; hiding them adds taps. |
| H2  | No error handling on `createMultipleEntries`       | 5    | Wrap in try/catch. Show error notification. Allow retry.                                               |
| H3  | No "unsaved changes" browser prompt                | 5    | Add `beforeunload` event listener when wizard has dirty state.                                         |

#### Medium

| #   | Finding                                                    | Pass | Recommendation                                                                                                                                                   |
| --- | ---------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Confirmation step requires final click to leave            | 1    | Make confirmation a terminal view. Replace "Complete Registration" with "View Show Details" and "Enter Another Show" action buttons (already partially present). |
| M2  | No feedback when Next button is disabled                   | 3    | Add inline validation message below step content: "Select at least one class to continue."                                                                       |
| M3  | Draft unsaved indicator shows nothing (instead of warning) | 3    | When `hasUnsavedChanges` is true, show amber "Unsaved" indicator instead of rendering nothing.                                                                   |
| M4  | Handler change requires a dialog (context switch)          | 2    | Replace dialog with inline dropdown or popover for handler selection.                                                                                            |
| M5  | Payment method not remembered across registrations         | 4    | Store last-used payment method in user preferences / localStorage.                                                                                               |
| M6  | Payment step has too many stacked cards for exhibitors     | 2    | Consolidate RegistrationSummary and PaymentSummaryCard into a single summary section. Move security notice to a tooltip on the card payment option.              |

#### Low

| #   | Finding                                                    | Pass | Recommendation                                                                                  |
| --- | ---------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| L1  | DogSelectionStep uses fixed `h-[400px]` ScrollArea         | 2    | Change to `max-h-[400px]`                                                                       |
| L2  | Single-dog exhibitors see a tab bar with 1 tab             | 2    | Hide tab bar when `selectedDogs.length === 1`                                                   |
| L3  | Dual cart summaries (per-dog + overall) for single dog     | 2    | Hide overall summary when only 1 dog is selected                                                |
| L4  | Pulsing glow animations on Next button and step indicator  | 3    | Remove. Violates INTENT.md "no decorative animations" guardrail.                                |
| L5  | Two "Back" affordances (header button + wizard navigation) | 3    | Consider hiding the header back button when wizard navigation is visible                        |
| L6  | Step indicator and main content both show "Step X of Y"    | 2    | Remove duplicate from main content area (line 563-566) since the sidebar already shows progress |

---

### Quick Wins (< 1 hour each)

1. **Expand all trials by default** -- Change `expandedTrials` initialization from `new Set([firstTrialId])` to `new Set(showTrials.map(t => t.id))` in `ClassSelectionStep.tsx`. (5 minutes)

2. **Add loading state to payment submission** -- Add `const [isSubmitting, setIsSubmitting] = useState(false)` to wizard page. Wrap the payment->confirmation async block. Pass `isLoading={isSubmitting}` to `WizardNavigation`. (15 minutes)

3. **Remove mock card fields** -- In `PaymentMethodSelector`, when `credit_card` is selected, show a static message instead of `CreditCardVisual`. (10 minutes)

4. **Show validation hint when Next is disabled** -- Add a `validationMessage` computed value below step content when `!canProceed()`. (20 minutes)

5. **Remove decorative pulse animations** -- Delete the `animate-pulse` spans from `VerticalProgressIndicator` (line 99-102) and the glow div from `WizardNavigation` (line 77). (5 minutes)

6. **Fix DraftIndicator empty state** -- When `hasUnsavedChanges` is true, render an amber "Unsaved" badge instead of returning null. (5 minutes)

7. **Hide single-dog tab bar** -- Wrap the `TabsList` in ClassSelectionStep with `{selectedDogs.length > 1 && ...}`. (5 minutes)

---

### INTENT Alignment Score

| INTENT Guardrail                 | Score | Notes                                                                                                          |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| "That took 30 seconds"           | 5/10  | Happy path is ~45-90s. Missing smart defaults (remember payment method, expand trials) add unnecessary taps.   |
| Pre-filled dog info              | 8/10  | Dogs auto-selected, handlers auto-assigned. Good.                                                              |
| Remembered preferences           | 3/10  | No remembered payment method, no "same as last show" feature.                                                  |
| Minimal taps to enter            | 6/10  | 6-12 taps for simple case is reasonable, but multi-trial/multi-dog scales poorly.                              |
| No long registration forms       | 4/10  | The mock credit card form is literally a long registration form. Payment step has 3-4 card sections to scroll. |
| No re-entry of known information | 7/10  | Dog info is pulled from profiles. But payment method must be re-selected each time.                            |

**Overall: The wizard's architecture is strong, but the exhibitor experience has preventable friction.** The role-aware config system is well-designed. The critical issues (mock card form, no loading state) are bugs, not architecture problems. The high-impact issues (collapsed trials, missing smart defaults) are small code changes with big UX payoff.
