## Why

The registration wizard is the exhibitor's money path and the surface Richard flagged first in the 2026-09-10 audit (MYK9-483). Its stepper splits step labels mid-word from 1024px up (`Pa`/`ym`/`en`/`t`; one character per line in the five-step staff variant), the only running fee total sits 2,500–3,100px down the Classes step, and ~1,100 lines of wizard code are unreachable from any route. Fall 2026 launch readiness needs an entry flow an exhibitor completes in "30 seconds" (docs/INTENT.md) and a codebase with one implementation per concern; this change delivers the chosen direction (Option B on the linked design canvas) and the two consolidation decisions recorded on the issue.

## What Changes

- **Stepper becomes a numbered rail.** `HorizontalProgressIndicator` (shared by the registration and show-creation wizards) renders a row of numbered circles joined by a connector, one single-line title beneath each. The status pill ("Done"/"Current"/"Upcoming") and the `description` line are removed; state stays on the circle (check / current ring / number) and on `aria-current` + the existing `aria-label` suffixes. Titles truncate, never break mid-word.
- **Registration step titles simplify** to `Select dogs`, `Select classes`, `Handlers` (staff only), `Payment`, `Receipt`. The `confirmation` step keeps the name "Receipt" and its `// INTENT:` comment.
- **A sticky "Your entries" panel** on Select dogs, Select classes and Payment itemises the cart per dog and per trial day with a running entry-fee total, sourced from the same cart store and fee helpers the bottom-of-page totals use today. At phone widths it collapses to a bottom bar (`N classes · $X`) with a Details toggle. The bottom-of-page `DogCartSummary` / `OverallCartSummary` are removed, not duplicated.
- **Payment copy and controls made consistent** (walk findings 6, 7, 8): the Check commit label says the check is brought to the show, matching the method card; the Check option no longer uses a check-mark icon; removing a fee line on the Payment step asks for confirmation.
- **BREAKING (internal): dead modules deleted** — `PaymentReconciliation.tsx` with `test/components/phase3-5-payment-components.test.tsx`; `OfflineClassSelectionStep.tsx`, `hooks/useOfflineEntryCreation.ts`, and the `services/entries` barrel re-export of both. The unreachable `secretary_existing` workflow config is deleted.
- **Geometry test** pins "no mid-word split" at 1024, 1100, 1280 and 1440 for both the exhibitor four-step and staff five-step variants, and at 390, measuring rendered line boxes rather than class names.

Duplication check: this adds no page, sheet or dialog. The rail replaces the card stepper in place for both wizards; the entries panel replaces two existing summary blocks rather than sitting beside them. The two dog-selection steps are both kept, on the recorded basis that they serve different jobs routed by path (`/shows/:id/register` = own dogs; `/secretary/register/:id` = find any dog, create exhibitors); they share the new shell so only the search stack differs. A link would not do: the fee total is the answer to a question the exhibitor is asking on the same screen.

## Capabilities

### New Capabilities

- `wizard-progress-indicator`: single-title, numbered-rail step navigation that never breaks a title mid-word at any viewport from 320px up, keeps step state available to assistive technology, and is shared by every wizard that uses it.
- `entry-wizard-running-total`: a persistent, per-dog, per-day itemised entry-fee summary visible while dogs and classes are chosen and on the payment step, collapsing to a bar at phone widths; service fee appears only on Payment and only for card.

### Modified Capabilities

- `entry-wizard-guidance`: the payment step's commit control label MUST agree with the selected method's instructions; a payment-method option MUST NOT use a selection glyph as its identifying icon; removing a fee line on the payment step requires confirmation.

## Impact

- `apps/myk9show/src/components/shows/wizard/components/HorizontalProgressIndicator.tsx` (rewrite; also changes the show-creation wizard's stepper — descriptions there are dropped too, content untouched).
- `apps/myk9show/src/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants.tsx` (labels, drop `description`, delete `secretary_existing`), `RegistrationWorkflow.types.ts`.
- `apps/myk9show/src/pages/RegistrationWizardPage.tsx`, `RegistrationWizardShell.tsx`, `WorkflowStepContent.tsx` (two-column shell with the entries panel; new `EntriesPanel` sibling module ≤ 500 lines).
- `ClassSelectionStep.tsx` / `.components.tsx` (remove `DogCartSummary`, `OverallCartSummary`), `PaymentStep/RegistrationSummary.tsx` (confirm on remove), `PaymentStep/PaymentMethodSelector.tsx` (icon), `pages/RegistrationWizardPage/commitLabels.ts` (+ test).
- Deletions: `PaymentReconciliation.tsx`, `test/components/phase3-5-payment-components.test.tsx`, `OfflineClassSelectionStep.tsx`, `hooks/useOfflineEntryCreation.ts`, lines 30-38 of `services/entries/index.ts`; `registrationSecretaryMobile.test.ts` / `registrationStepsMobile.test.ts` source-text guards that name removed code.
- Tests: `test/e2e/registration/wizardVisualQA.spec.ts` (+ geometry sweep, both variants), unit tests for the rail, the panel's itemisation, and the commit label.
- Untouched on purpose: `submitPaymentStep.ts`, `entryCloseGuard.ts`, fee arithmetic (`cartStore.helpers`, `PlatformFeeSplitLines`), the wizard state machine and its step order.

## Non-goals

- Resuming the wizard step after a browser reload (finding 4) — wizard state work; file separately.
- Explaining judge-day "Full" and offering a route forward (finding 1) — capacity-model UX; file separately.
- Entering a class whose status is `in_progress` (finding 12) — product call; file separately.
- Any change to the Receipt step's content, the Handlers step, or `DogSelectionStepEnhanced`'s search and create stack beyond adopting the shared shell.
- Option D's one-page model, Option C's sidebar, or any new route, sheet or dialog.
- Announcing cart expiry (walk finding 3) — follow-up issue.
- MYK9-485 (dog-picker checkbox target size) — owned there.
