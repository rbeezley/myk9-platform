# Exhibitor Onboarding Remediation Plan

> **Status:** Active — metadata reconciled 2026-09-05.
> Richard owns reconciliation: existing historical implementation/status is preserved below; closure evidence is not independently established in this pass. Keep active pending that evidence.


**Date:** 2026-07-07
**Owner:** Codex
**Source audit:** `docs/exhibitor-onboarding-ux-audit.md`
**Parent plan:** `docs/plan-exhibitor-elderly-ux-remediation.md`, Phase 6 - Onboarding Confidence
**OpenSpec change:** `openspec/changes/exhibitor-elderly-ux-remediation`
**Role intent:** Exhibitor should feel "This respects my time."
**Implementation status:** Completed in branch `codex/exhibitor-ux-audit` on 2026-07-07.

## Goal

Make first-run exhibitor onboarding honest, finishable, and hard to get stuck in.

The fixed flow should:

1. Get a verified exhibitor from first login to `/shows` without an unexplained step reset.
2. Avoid collecting address or notification choices unless the app saves them.
3. Keep dog setup optional and lightweight.
4. Leave completed users out of onboarding unless they explicitly restart a supported setup task.

## Duplication Check

Does this duplicate an existing page? No, and it should not.

The audit found onboarding trying to collect data that already belongs to existing surfaces:

- Mailing address belongs to the existing Account/Profile surface, not a second onboarding-only form.
- Notification preferences belong to the existing Account/Notifications surface, not a second onboarding-only form.
- Full dog profile details belong to the existing dog profile/Add Dog surface, not a mandatory onboarding subflow.

Remediation should either remove these onboarding steps or deep-link to the existing Account/Dogs surfaces after onboarding. Do not create another preferences page, another dog profile flow, or another exhibitor dashboard.

## Scope

In scope:

- `apps/myk9show/src/pages/onboarding/ExhibitorOnboardingPage.tsx`
- `apps/myk9show/src/pages/onboarding/steps/*`
- `apps/myk9show/src/hooks/useExhibitorProfile.ts`
- `apps/myk9show/src/components/exhibitor/ExhibitorOnboardingChecker.tsx`
- Shared Add Dog dialog close behavior if the backdrop issue reproduces outside onboarding.
- Account deep-link support only if needed to route users to existing profile/preferences sections.

Out of scope:

- New database columns for address or notification preferences.
- New onboarding pages or modals.
- Reworking the full dog profile editor beyond the close/backdrop defect.
- Any Supabase migration unless a later implementation discovery proves one is required and gets explicit approval.

## Phase 0 - Reproduce And Pin The Failure

**Problem:** The browser audit proved completion persisted in Supabase, but the UI returned to `/onboarding` at Step 2. Before changing behavior, pin that failure in tests.

**Tasks:**

- Add a component test that models a profile with `onboarding_completed_at: null`, clicks through completion, resolves `completeOnboarding`, and asserts navigation to `/shows`.
- Add a regression test for a completed profile visiting `/onboarding`; expected behavior should be redirect to `/shows`, not rendering Step 2.
- Add a test for the current profile-created-at-signup case so the wizard can still start at Dogs only when onboarding is incomplete.
- Record the suspected cache path in the test name or comments: completion mutation updates DB, but local onboarding state can remain stale.

**Acceptance criteria:**

- The completion redirect bug is represented by a failing test before implementation.
- Completed exhibitors cannot see the onboarding wizard.
- Incomplete exhibitors with an existing profile can still resume at the first incomplete supported step.

**Likely files/tests:**

- `apps/myk9show/src/pages/onboarding/__tests__/ExhibitorOnboardingPage.test.tsx`
- `apps/myk9show/src/components/exhibitor/__tests__/ExhibitorOnboardingChecker.test.tsx`
- `apps/myk9show/src/hooks/useExhibitorProfile.test.ts`

## Phase 1 - Fix Completion Routing And Profile Cache

**Problem:** `completeOnboarding` persists `onboarding_completed_at`, but the app can redirect or render from stale profile state.

**Tasks:**

- In `useExhibitorProfile`, update the `['exhibitorProfile', user.id]` query cache immediately on successful completion instead of only invalidating.
- Make `completeOnboarding` return or expose the completed timestamp so callers can use one source of truth.
- In `ExhibitorOnboardingPage`, redirect completed exhibitors to `/shows` once auth, RBAC, and profile loading have resolved.
- Keep staff redirect behavior unchanged.
- Ensure `handleFinish` cannot double-submit and cannot navigate until completion state is locally updated.

**Acceptance criteria:**

- Clicking "Browse Shows" updates Supabase and lands on `/shows`.
- Reloading `/onboarding` after completion redirects to `/shows`.
- An incomplete profile remains allowed to complete onboarding.
- Staff users still route to their role dashboard, not `/shows`.

## Phase 2 - Remove Unsaved Address And Notification Steps

**Problem:** Address and notification steps collect data that is discarded. This is worse than not asking.

**Tasks:**

- Remove `StepAddress` and `StepNotifications` from the first-run wizard.
- Reduce the wizard to durable steps only:
  - Profile, when no exhibitor profile exists.
  - Dogs, optional.
  - Welcome.
- Recalculate progress labels dynamically so a profile-created-at-signup user does not see "Step 2 of 5" as their first visible step.
- Update Welcome copy to point users to existing account settings after onboarding:
  - Profile/address: Account -> Profile.
  - Notifications: Account -> Notifications.
- If direct Account section links are needed, add lightweight query-param support to the existing Account page, for example `/account?section=notifications`. This is a deep-link into an existing surface, not a new page.
- Delete or rewrite tests for removed steps so they do not preserve fake behavior.

**Acceptance criteria:**

- Onboarding no longer asks for address or notification preferences unless those values are persisted.
- Progress counts match the visible steps.
- The final screen does not imply hidden setup work was saved.
- Users still have a clear path to profile/preferences through existing Account surfaces.

**Likely files/tests:**

- `apps/myk9show/src/pages/onboarding/ExhibitorOnboardingPage.tsx`
- `apps/myk9show/src/pages/onboarding/steps/StepWelcome.tsx`
- `apps/myk9show/src/pages/onboarding/steps/__tests__/StepWelcome.test.tsx`
- `apps/myk9show/src/pages/onboarding/__tests__/ExhibitorOnboardingPage.test.tsx`
- Optional: `apps/myk9show/src/pages/AccountPage.tsx` and an AccountPage section-link test.

## Phase 3 - Make Dog Setup Optional Without Trapping Users

**Problem:** The Dogs step says "Add your dogs," but the action opens a full multi-tab profile dialog. Cancel also left a backdrop intercepting the page during the audit.

**Tasks:**

- First, decide whether onboarding should keep Add Dog inline at all.
- Preferred low-surface option: keep Dogs as optional, but frame it as "Add a dog now or do it later" and make "Skip for now" the calm path.
- If Add Dog remains available in onboarding, fix the shared dialog close path so Cancel and X fully unmount the backdrop and return focus.
- Add an integration-style test around `StepDogs` with the real AddDogPanel close path, or a focused AddDogPanel test that asserts no modal backdrop remains after Cancel.
- Do not fork a separate onboarding-only dog editor unless later product review explicitly asks for it.

**Acceptance criteria:**

- Cancel/X from Add Dog never leaves the wizard visually enabled but click-blocked.
- Users can skip Dogs and complete onboarding.
- Dog setup copy accurately reflects the amount of work if the full dialog remains.

**Likely files/tests:**

- `apps/myk9show/src/pages/onboarding/steps/StepDogs.tsx`
- `apps/myk9show/src/pages/onboarding/steps/__tests__/StepDogs.test.tsx`
- `apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx`
- A new or existing AddDogPanel close/backdrop regression test.

## Phase 4 - Quiet The Onboarding Shell

**Problem:** First-run onboarding shows global search, messages, theme, AskQ, and account controls. That creates avoidable cognitive load.

**Tasks:**

- Add a minimal app-header mode for `/onboarding`, or hide utility actions there.
- Keep enough account affordance to let a user sign out or recover from being in the wrong account.
- Do not add visible instructions about how onboarding works; the flow itself should be obvious.
- Re-check mobile after the header change so the title is not crowded.

**Acceptance criteria:**

- `/onboarding` has a calm, focused shell.
- Mobile first viewport shows the onboarding task before unrelated app tools.
- Sign-out/account recovery remains possible.

**Likely files/tests:**

- `apps/myk9show/src/components/layout/AppHeader.tsx`
- `apps/myk9show/src/App.tsx`
- Header route-visibility tests if present, or a focused App/Header test.

## Phase 5 - Smooth Sign-In Copy And Loading State

**Problem:** Sign-in is functional, but plain email login still says "Sign in or join a show," and the initial loading state gives no timing expectation.

**Tasks:**

- Adjust Smart Sign In heading after an email is classified so the password step reads like normal account sign-in.
- Keep passcode language for passcode flows.
- Consider a shorter loading fallback on auth pages, or show the sign-in shell sooner when possible.
- Keep this phase lower priority than completion and unsaved-data fixes.

**Acceptance criteria:**

- Email/password users see account sign-in language.
- Passcode users still understand show-passcode entry.
- The initial loading state does not feel like a blocker on normal network conditions.

**Likely files/tests:**

- `apps/myk9show/src/pages/SmartSignInPage.tsx`
- `apps/myk9show/src/pages/SmartSignInPage.helpers.ts`
- Existing SmartSignInPage tests or new focused tests.

## Testing Phase

Run tests as each slice lands. Do not mark a phase complete until relevant tests pass.

Required unit/component coverage:

- `ExhibitorOnboardingPage` completion redirects to `/shows`.
- Completed exhibitors visiting `/onboarding` are redirected out.
- Incomplete profile-created-at-signup exhibitors start at the first supported incomplete step.
- Removed Address/Notifications steps are absent from onboarding and no tests preserve local-only state.
- Optional Account deep-links open the existing Account section when used.
- Add Dog Cancel/X fully closes modal/backdrop.
- Onboarding header shell hides unrelated utilities while preserving account recovery.

Focused commands:

```bash
cd apps/myk9show
pnpm exec vitest run \
  src/pages/onboarding/__tests__/ExhibitorOnboardingPage.test.tsx \
  src/pages/onboarding/steps/__tests__/StepDogs.test.tsx \
  src/pages/onboarding/steps/__tests__/StepWelcome.test.tsx \
  src/components/exhibitor/__tests__/ExhibitorOnboardingChecker.test.tsx \
  src/test/hooks/useExhibitorProfile.test.ts
```

Add Account, Header, AddDogPanel, or SmartSignInPage test files to the command when those files are touched.

Required browser verification:

- Create or reset a verified exhibitor account with no `onboarding_completed_at`.
- Sign in with email/password.
- Complete onboarding without adding a dog.
- Confirm the browser lands on `/shows`.
- Reload `/onboarding` and confirm it redirects away.
- Open onboarding on a mobile viewport and confirm the shell remains focused and readable.

Shared-system note: any staging Supabase account creation/reset for browser verification requires explicit confirmation before the write.

Automated verification completed:

```bash
cd apps/myk9show
pnpm exec vitest run src/pages/onboarding/__tests__/ExhibitorOnboardingPage.test.tsx src/pages/onboarding/steps/__tests__/StepDogs.test.tsx src/pages/onboarding/steps/__tests__/StepWelcome.test.tsx src/test/hooks/useExhibitorProfile.test.ts src/components/exhibitor/__tests__/ExhibitorOnboardingChecker.test.tsx src/test/pages/AccountPage.test.tsx src/components/layout/AppHeader.test.tsx src/pages/SmartSignInPage.test.tsx src/components/panels/edit/__tests__/EditPanelWrapper.test.tsx
```

Result: 9 test files passed, 83 tests passed.

```bash
pnpm typecheck
```

Result: passed.

## Rollout Order

1. Phase 0 and Phase 1 together: pin and fix the critical completion trap first.
2. Phase 2 next: remove false setup steps before launch testing trains users to distrust preferences.
3. Phase 3: fix the dog-dialog trap or make the dog step purely optional.
4. Phase 4: quiet the shell after the flow is structurally correct.
5. Phase 5: polish sign-in copy/loading once the core onboarding path is reliable.

## Tracking Updates

- Add concrete Phase 6 subtasks to `openspec/changes/exhibitor-elderly-ux-remediation/tasks.md` when implementation starts.
- Update `docs/plan-exhibitor-elderly-ux-remediation.md` after each shipped slice with verification evidence.
- Keep `docs/exhibitor-onboarding-ux-audit.md` as the evidence source until a follow-up browser re-walk supersedes it.
