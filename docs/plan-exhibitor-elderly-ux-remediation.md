# Exhibitor Elderly UX Remediation Plan

**Date:** 2026-07-06  
**Owner:** Codex  
**Source audits:** `docs/audits/2026-07-06-exhibitor-elderly-browser-ux-audit.md`; `docs/ux-audits/exhibitor-entry-journey-elderly-ux-audit-2026-07-10.md`
**Persona:** Retired elderly exhibitor with no computer skills  
**Intent frame:** Exhibitor experience should feel like "This respects my time."

## Goal

Remove the trust-breaking contradictions and dead ends from the exhibitor journey before adding any new surface area. The target user should be able to answer four questions without guessing:

1. Can I enter this show?
2. Is my dog entered?
3. Do I owe money?
4. What do I do at the show today?

## Duplication Check

Does this plan duplicate an existing page? No.

The remediation should tighten existing surfaces:

- Show landing/detail handles whether entries are open.
- Registration wizard handles actual entry creation only when entry is possible.
- My Shows summarizes entries and status.
- My Payments handles money owed and payment history.
- Show day answers "where do I go now?"
- My Dogs handles dog facts and registrations.

If a need already belongs to another page, add a clear link or filtered deep-link instead of rebuilding the same workflow in place.

## Current Branch Status

Branch/worktree: `codex/exhibitor-elderly-ux-remediation`

OpenSpec change: `exhibitor-elderly-ux-remediation`

Already completed in this branch:

- Closed Monogram show CTAs no longer advertise "Enter this show"; they show closed-state guidance instead.
- Premium-style public landings now gate entry CTAs on both class readiness and entry-close state across Heritage, Field Guide, Magazine, Gazette, Banner, Poster, Headline, and Monogram.
- Direct `/shows/:showId/register` URLs now stop on a closed-entry recovery screen before dog/class selection.
- Post-deadline My Entries cards provide "Message the show team" instead of silently dropping the edit path.
- Dog height/weight conversion no longer saves blank invalid values as `NaN`.
- Dog detail hides invalid or blank measurements instead of displaying `NaN` or accidental zero.
- Exhibitor onboarding completion now updates the local profile cache with the saved timestamp before navigating to `/shows`.
- Completed exhibitors who return to `/onboarding` are redirected to `/shows` instead of seeing an earlier wizard step.
- First-run onboarding no longer asks for unsaved address or notification preferences; it keeps only durable Profile, optional Dogs, and Welcome steps.
- Onboarding Dogs is framed as optional, and empty Add Dog dialog cancellation closes without a discard/backdrop trap.
- The onboarding shell hides global search, notifications, cart, theme, and AskQ actions while preserving account access.
- Email/password sign-in now uses account sign-in copy after email classification while passcode copy remains unchanged.
- My Shows and My Payments now share the same current-balance helper for unpaid entry fees.
- My Shows sends a single-show online balance to the existing cart recovery URL and sends ambiguous/multi-show balances to My Payments.
- My Payments now shows Amount due above history, separates pay-online from pay-at-show balances, and keeps existing cart checkout links.
- My Payments history now separates gross paid, refunds, and net paid in plain language.
- Focused tests added for those behaviors.

Verification already run:

```bash
cd apps/myk9show
npx vitest run src/components/dogs/DogDetailsMain/utils.test.ts src/components/dogs/DogDetailsMain/sidebar/AboutCard.test.tsx src/features/monogram/landing/__tests__/entryCtas.test.tsx
```

Result: 3 test files passed, 17 tests passed.

```bash
cd apps/myk9show
pnpm exec vitest run src/pages/RegistrationWizardPage/entryCloseGuard.test.ts src/pages/__tests__/RegistrationWizardPage.workflowMode.test.tsx src/features/_shared/hooks/__tests__/useCountdown.test.ts src/features/monogram/landing/__tests__/entryCtas.test.tsx src/features/heritage/landing/__tests__/heritageEnterCtaGating.test.tsx src/features/fieldGuide/landing/__tests__/fieldGuideEnterCtaGating.test.tsx src/features/magazine/landing/__tests__/magazineEnterCtaGating.test.tsx src/features/gazette/landing/__tests__/gazetteEnterCtaGating.test.tsx src/features/poster/landing/__tests__/posterEnterCtaGating.test.tsx src/features/banner/landing/__tests__/bannerEnterCtaGating.test.tsx src/features/headline/landing/__tests__/HeadlineLandingPage.test.tsx src/components/dogs/DogDetailsMain/utils.test.ts src/components/dogs/DogDetailsMain/sidebar/AboutCard.test.tsx src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx
```

Result: 14 test files passed, 155 tests passed.

```bash
pnpm typecheck
```

Result: passed.

```bash
cd apps/myk9show
pnpm exec vitest run src/features/payments/entryBalanceSummary.test.ts src/features/payments/paymentsSummary.test.ts src/pages/exhibitor/ExhibitorPaymentsPage.test.tsx src/pages/MyEntriesPage/modules/useMyEntriesFilters.test.ts src/test/components/CompactStatsRow.test.tsx
```

Result: 5 test files passed, 59 tests passed.

```bash
pnpm typecheck
```

Result: passed.

```bash
cd apps/myk9show
pnpm exec vitest run src/pages/onboarding/__tests__/ExhibitorOnboardingPage.test.tsx src/pages/onboarding/steps/__tests__/StepDogs.test.tsx src/pages/onboarding/steps/__tests__/StepWelcome.test.tsx src/test/hooks/useExhibitorProfile.test.ts src/components/exhibitor/__tests__/ExhibitorOnboardingChecker.test.tsx src/test/pages/AccountPage.test.tsx src/components/layout/AppHeader.test.tsx src/pages/SmartSignInPage.test.tsx src/components/panels/edit/__tests__/EditPanelWrapper.test.tsx
```

Result: 9 test files passed, 83 tests passed.

```bash
pnpm typecheck
```

Result: passed.

## Phase 1 - Stop Impossible Entry Paths

**Problem:** Closed shows still looked enterable during the browser walk, and the user reached payment before being blocked.

**Remediation:**

- Audit every public/show detail style, not only Monogram, for stale entry CTAs.
- Gate entry CTAs on the same close-date/business-rule check used by submission.
- Replace unavailable entry CTAs with "Entries closed" and a direct "Contact/message show team" recovery action.
- If the wizard is reached by URL after close, show a closed-entry screen before dog/class selection.

**Acceptance criteria:**

- A closed show has no primary "Enter this show" action.
- A direct closed wizard URL does not allow class selection.
- The user always gets a recovery path for late-entry help.

## Phase 2 - Make Existing Entry Changes Explain Themselves

**Problem:** After the entry deadline, `Edit Entry` disappears with no explanation.

**Remediation:**

- On entry cards where editing is no longer allowed, show a replacement action:
  "Need to change this? Entries are closed - message the show team."
- Deep-link the action to the existing message/show-team surface.
- Keep the original edit flow unchanged for entries that are still editable.

**Acceptance criteria:**

- Editable entries still show `Edit Entry`.
- Closed entries explain why editing is unavailable.
- Closed entries provide one obvious next action.

## Phase 3 - Align My Payments With Amount Due

**Problem:** My Shows showed current fees and amount due, but My Payments showed only paid history.

**Remediation:**

- Add an "Amount due" section to My Payments using the existing payment/cart data source.
- Link My Shows fee summaries to My Payments or the cart with the relevant entries filtered.
- Separate gross paid, refunds, and net paid in plain language.

**Acceptance criteria:**

- If My Shows says money is due, My Payments shows the same due amount.
- The user can start payment from the amount-due area.
- Payment history remains available but is visually secondary to unpaid balances.

## Phase 4 - Reframe Show Day Around The Exhibitor

**Problem:** "Go to show day" landed on ringside/class data with `0 / 0` and "No Entries Yet," contradicting the user's own entries.

**Remediation:**

- For exhibitor role, default show-day route to "Your dogs today."
- Show each entered dog, class, armband/confirmation, check-in state, and next practical action.
- Keep the full class/ringside list as a secondary link for users who want it.
- If class data is empty but the exhibitor has entries, do not show "No Entries Yet"; explain that the running order is not posted yet.

**Acceptance criteria:**

- An exhibitor with entries sees their own dogs first.
- Empty class/ringside data never implies their dog is not entered.
- The user has a clear "what now?" action on show day.

## Phase 5 - Simplify Check-In Language

**Problem:** The exhibitor check-in dialog exposes staff statuses like `At Gate`, `Conflict`, and `Pulled`.

**Remediation:**

- Replace exhibitor-facing labels with plain choices:
  "I am here", "I am not there yet", "I have a conflict - tell the secretary".
- Map those labels to existing internal statuses.
- Reserve staff-only statuses for secretary/gate steward views.

**Acceptance criteria:**

- Exhibitors never need to understand operational status jargon.
- Existing staff workflows keep their current precision.
- Status changes remain auditable and reversible where supported today.

## Phase 6 - Reduce Dog Profile Friction

**Problem:** Add Dog is simple, but Edit Dog exposes many optional details and invalid blank measurements damaged trust.

**Remediation:**

- Keep the completed measurement fixes.
- Group Edit Dog fields into "Basics" and "More details," matching Add Dog's simplicity.
- Add date-of-birth format helper text.
- Add mixed-breed/registration guidance near organization and breed fields.
- Collapse premium dog tabs behind one "More for this dog" area.
- Remove duplicate registration add affordances where they appear on the same surface.

**Acceptance criteria:**

- A simple dog correction can be made without scanning advanced fields.
- Blank optional fields display as blank or "Not recorded," never `NaN`.
- The registration path gives enough guidance for AKC/PAL/ILP/mixed-breed uncertainty.

## Phase 7 - Onboarding Confidence

**Problem:** The walkthrough saw onboarding appear to return from Step 5 to Step 2, which can make a low-tech user think setup failed.

**Remediation:**

- Trace onboarding completion state from save through redirect/reload.
- Confirm whether this is a seed-data/profile-completion issue or a real state bug.
- If profile completion is partial, show "Finish setting up" with saved progress rather than restarting unexpectedly.

**Acceptance criteria:**

- After completing onboarding, reload does not surprise the user with an earlier step.
- If more setup is required, the page explains what is missing and what was saved.

## Phase 8 - Reconcile Entry State And Touch Targets

**Problem:** The reopened Heartland staging walk showed `Entry Submitted` on Browse Shows, `My Entries 0` plus a no-entry empty state on Show Detail, and `My entry` classes plus already-entered dogs in the registration wizard. The same journey also exposes a 32px payment-summary remove control and a 40px Cart `Continue Shopping` action.

**Remediation:**

- Derive the exhibitor's owned entry history and active submitted entries once from the route's replication-backed show-entry result and owned-dog identity, using the existing lifecycle classifier for terminal states.
- Use owned history for the Show Detail `My Entries` count/content, and use the active subset for the default tab plus Classes-tab `My entry` labels and present-tense submitted badges.
- Keep cart-only selections separate: registration may label them `In cart`, but they must not increment submitted-entry counts or produce `Entry Submitted` outside the cart/wizard.
- Do not render the no-entry empty state while the canonical entry read is loading or failed; preserve the existing retry state.
- Raise the payment-summary remove action and Cart `Continue Shopping` action to a minimum 44×44px target without adding new controls.

**Acceptance criteria:**

- Browse Shows, Show Detail, Classes, and registration agree on whether submitted entries exist.
- `My Entries` counts equal the owned history rows rendered in `My Entries`, including clearly labelled terminal history.
- Present-tense submitted badges and Classes `My entry` labels use active submitted rows only.
- Cart-only selections are clearly labelled and never presented as submitted entries.
- Loading or failed entry reads never collapse into `My Entries 0` or a false no-entry message.
- Both audited controls meet the 44×44px touch floor at 390px without clipping or overflow.

## Testing Phase

Run focused tests as each implementation phase lands, then one full browser audit pass.

Required automated coverage:

- Unit tests for new utilities, date/entry gating helpers, and status-label mapping.
- Component tests for closed-entry CTAs across each show landing/detail style touched.
- Component tests for post-close entry-card replacement actions.
- Component tests for My Payments amount-due visibility.
- Component tests for exhibitor show-day empty/running-order-not-posted states.
- Hook tests for any onboarding completion state changes.
- Regression tests for dog measurement parsing/display.
- Pure-selector and component tests for submitted-entry, cart-only, loading, and error states across Show Detail tabs/classes.
- Component tests pinning the payment-summary remove and Cart `Continue Shopping` actions to the 44px minimum.

Required E2E/browser coverage:

- Exhibitor with open show: add dog, add registration, create entry, edit entry before close, pay or reach payment handoff.
- Exhibitor with closed show: verify no normal entry CTA, direct wizard URL is blocked early, late-entry recovery is visible.
- Exhibitor with existing show-day entry: My Shows -> Go to show day shows the user's dogs first.
- Exhibitor with amount due: My Shows fee summary matches My Payments amount due.
- Elderly low-tech pass: repeat the browser walkthrough using only visible labels, no route guessing, no developer knowledge.

Verification commands:

```bash
cd apps/myk9show
npx vitest run <focused test files>
pnpm test:e2e -- <focused exhibitor specs>
```

If the known test-suite hang appears for more than 60 seconds without useful output, stop and report the hang rather than retrying in a loop.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The full remediation touches entry gating, payments, show-day routing, check-in state, dog profile editing, and onboarding; ship each slice with focused tests, then run relevant app typecheck/E2E and browser audit evidence before considering that slice complete.

## Rollback / Recovery

- Each implementation slice should remain independently revertible because no shared-system writes or data migrations are planned.
- If a slice exposes a contradictory state after merge, roll back the slice's UI/helper changes and keep the existing canonical pages as the fallback.
- Do not archive the OpenSpec change until the final required remediation PR is merged or explicitly deferred in tracking.

## Rollout Order

1. Ship Phase 8 first because the current staging journey gives contradictory answers to the basic question "Am I entered?"
2. Finish Phase 1 and Phase 2 together because both prevent impossible or unexplained entry changes.
3. Ship Phase 3 before show season testing so payment confidence can be validated with realistic balances.
4. Ship Phase 4 and Phase 5 together because both affect day-of-show trust.
5. Ship Phase 6 and Phase 7 as polish/hardening once the critical contradictions are gone.
6. Re-run the full elderly exhibitor browser audit with the reopened Heartland test show before closing Phase 8.

## Risks And Notes

- Seed data currently limits verification: all available exhibitor shows were closed on 2026-07-06.
- The Heartland test show is now open through 2026-07-31 for Phase 8 verification; do not rely on changing production show dates.
- Do not add a new exhibitor dashboard to solve these issues. The problem is contradictory state across existing pages, not absence of another page.
- Favor links/deep-links to existing pages over duplicating payment, entry editing, messaging, or show-day tools.
