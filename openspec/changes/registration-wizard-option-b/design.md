## Context

See proposal.md — Why. Facts that shape the approach:

- `HorizontalProgressIndicator` (`components/shows/wizard/components/`) is consumed by both `RegistrationWizardPage.tsx` and `secretary/ShowCreationWizardPage.tsx`. It is `grid grid-cols-2 … lg:flex`; above `lg` (1024px, Tailwind default) every card shares one row with a `shrink-0` status pill, which is the measured cause of the mid-word split (1024/1100 four-step; 1024–1440 five-step). The pill arrived in PR #1487 (2026-07-26).
- The wizard mode is derived from the route (`useRegistrationWizardState.ts:127-135`): `/shows/:id/register` is always `exhibitor`; `/secretary/register/:id` yields `secretary_new` / `club_admin` / `site_admin`. `secretary_existing` is never produced.
- Fee totals already exist on the class step (`DogCartSummary`, `OverallCartSummary` in `ClassSelectionStep.components.tsx`, fed by `getTotalFeesForDog` over `cartItems`) and on payment (`PaymentSummaryCard` with `calculatePlatformFeeCents` + `PlatformFeeSplitLines`). `cartStore` computes `expirationWarning` with no reader.
- The shell (`RegistrationWizardShell.tsx`) is header + one content card; step content must not add margins to compensate for the header.
- The design reference is the Option B page of the linked canvas: rail ≤ 640px wide centred under the title row; content card left, 320px sticky panel right at desktop; phone = bottom bar.
- Money path: `submitPaymentStep.ts`, `entryCloseGuard.ts`, fee helpers and the step order are out of bounds.

## Goals / Non-Goals

**Goals:**

- One stepper component for both wizards, with a geometry test that fails on any mid-word break.
- One place that shows the entry total per step, reading the same store the existing totals read.
- Net line count of the wizard goes down (two dead modules and two summary blocks removed; one panel module added).

**Non-Goals:**

- Any change to how the cart is written (mutations stay on the existing cart store / mutation manager path).
- Reworking `DogSelectionStepEnhanced`'s search/create stack, `HandlerAssignmentStep`, or `ConfirmationStep` content.
- A shared "wizard layout" abstraction for other pages; the two-column shell lives in `RegistrationWizardShell` only.

## Decisions

1. **Rewrite the indicator as a rail, keep its props.** Same `steps / currentStep / completedSteps / onStepClick` contract, `description` accepted but ignored (then removed from both step definitions), so the show-creation wizard changes render without code changes there. Each `<li>` is `flex: 1 1 0; min-width: 0`; the button contains a 28px circle and a title span with `truncate` (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`). The connector is a pseudo-element between circles, not an absolutely positioned bar behind text, so nothing can be struck through. _Alternative:_ keep cards and only drop the pill — rejected: the cards still consume 64px of header for four words, and the split mechanism (`break-words`) would survive.
2. **Labels come from the constants, not the component.** `ALL_STEP_DEFINITIONS` gets the new titles; `confirmation` keeps `label: 'Receipt'` and its INTENT comment verbatim. `secretary_existing` is deleted from `WORKFLOW_CONFIGS` and `WorkflowMode`.
3. **Entries panel is one new module, `EntriesPanel.tsx` (+ `EntriesPanel.helpers.ts` for grouping), mounted by `RegistrationWizardShell`** via a new optional `aside` slot, rendered on every step except `confirmation`. It derives rows with a pure `groupCartByDogAndDay(cartItems, dogs, trials)` helper (unit-tested with the exact id shapes the store emits — LESSONS `assertion-first-ui-id-shapes`) and reads totals through the existing `getTotalFeesForDog` / `calculatePlatformFeeCents`. On the payment step it receives `paymentMethod` so the service-fee line uses the same predicate `PaymentSummaryCard` uses. _Alternative:_ keep `PaymentSummaryCard` and add a second summary — rejected: two totals on one screen can disagree (MYK9-367 was exactly that class of bug). Instead `PaymentSummaryCard`'s fee-line list moves into the panel on desktop and the card is retired; at phone width the same panel renders as the bottom bar.
4. **Phone bottom bar owns Back/Next.** Below `lg` (1024px, so tablets never lose the summary or gain a second Next) the panel renders `fixed bottom-0` with the count/total, a Details disclosure, and the `WizardNavigation` buttons; the in-card footer is hidden at that width. Content gets `padding-bottom` equal to the bar height via a CSS variable so the last control is reachable (spec: bar must not overlap). _Alternative:_ a floating total pill above the footer — rejected: two sticky regions on a 390px screen.
5. **Remove the class-step summaries rather than hide them.** `DogCartSummary` and `OverallCartSummary` are deleted with their tests; their `data-testid`s that `wizardVisualQA.spec.ts` references are re-pointed at the panel.
6. **Payment fixes are copy and one confirm.** `commitLabels.ts`: `check` → `Submit — bring check to show` (test first, red then green). `PaymentMethodSelector`: `Check` icon → `FileText` (lucide, a paper). `RegistrationSummary` remove → confirm dialog using the existing confirm primitive in `@/components/ui`, naming the class.
7. **Expiry warning reader.** A small `CartExpiryNotice` reads `expirationWarning` from `cartStore` and renders a `role="status"` line in the panel; on `expired` it shows the restart affordance that already exists in the class step's empty state. No timer logic is added; the store already computes it.
8. **Geometry test lives in `wizardVisualQA.spec.ts`.** For each width in [390, 1024, 1100, 1280, 1440] and each variant (exhibitor route, secretary route via `TEST_USERS.SECRETARY`), for each step title: `getClientRects()` over a Range on the text node must have length 1 and the visible text must equal the title or end with `…`. Known-answer check: the test first asserts the harness reports 2+ rects on a deliberately narrow probe element, so a silent pass is impossible (LESSONS `measurement-harness`).
9. **Deletions are a separate commit** on the same branch so the review sees the net diff of behaviour apart from the removals.

Offline-first / replication: the panel is read-only over the existing cart store and dog/trial replicated tables; no new reads bypass replication and no mutation path changes.

INTENT: exhibitor — "that took 30 seconds": total always in view, one fewer scroll; secretary — "easy": the five-step rail fits at 1024 without wrapping.

## Risks / Trade-offs

- [Show-creation wizard loses its step descriptions] → they were `Basic information` / `Configure trials` / `Select from templates` / `Final confirmation`; the step content headings already carry this. Screenshot both wizards in the PR.
- [Two-column shell at tablet widths squeezes the class chips] → panel is `lg:` only; `md` gets the bottom bar. Verify at 768 and 1024 in the visual QA spec.
- [Sticky is inert at desktop] → the app shell's `main` is `flex-1 overflow-auto` inside a `min-h-screen` flex row, so it is a scroll container that never scrolls (the document does) and every `position: sticky` inside it, the wizard header included, is inert. The panel's CSS is correct and sticks the moment the shell is fixed; the shell fix touches every page and is filed as a follow-up, not made here.
- [Retiring `PaymentSummaryCard` touches the money screen] → fee arithmetic is untouched (same helpers); pin with the existing `PaymentStep/__tests__` totals and an added assertion that panel total === `calculatePlatformFeeCents` result for the same inputs.
- [`registrationSecretaryMobile.test.ts` greps for strings in deleted files] → those source-text guards are removed with the code; the geometry test replaces them with rendered assertions.
- [Code-quality ratchet] → `RegistrationWizardShell.tsx` and `WorkflowStepContent.tsx` gain lines; keep both under 500 by extracting the aside slot and the phone bar into the panel module. Run `pnpm qa:code-quality-ratchet` from the worktree before pushing.

## Migration Plan

Pre-launch, no users: no data migration. Ship as one PR on this branch; rollback is a revert. No edge functions or migrations involved.
