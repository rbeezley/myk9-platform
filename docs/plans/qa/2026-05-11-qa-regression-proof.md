# QA Regression Proof Plan

## Goal

Prove that all six remediation batches for the 2026-05-10 secretary `qa-feature` walk remain fixed, and that the fixes did not introduce adjacent regressions.

This document is the proof matrix. The current Playwright spec, `apps/myk9show/src/test/e2e/uat/secretary/qa-regression-proof.spec.ts`, is one artifact in the matrix, not the whole proof.

## Source Of Truth

- `OPEN-TODOS.md` — resolved finding list and remaining open items.
- `docs/plans/2026-05-11-open-todos-remediation-master-plan.md` — original batch grouping.
- PRs merged for Batches 1-6.
- Focused unit/component tests added by each batch.
- New browser proof spec in this branch.

## Global Pass Criteria

- Every Batch 1-6 row below has at least one proof artifact: unit/component test, E2E check, or explicit manual QA replay.
- Targeted unit/component regression tests pass.
- The strict Playwright proof run passes with no console errors, page errors, or owned 4xx/5xx network responses. Verified on 2026-05-12.
- Manual replay of the original secretary `qa-feature` walk cannot reproduce any original finding.
- Any newly discovered issue is added to `OPEN-TODOS.md` before the proof PR ships.

## Batch 1 — Show-Creation Flow Stopper

Proof target: a fresh secretary can create a show end to end, including inline club creation, without authorization dead ends or stale club labels.

Findings covered:

- Host Club picker shows `No clubs found` for a fresh secretary.
- Create New Club has no way back.
- Newly-created host club displays as `Unknown Club`.
- F17 new club path briefly shows `Unknown Club`.
- `Failed to create show: not authorized to create shows for club <id>`.
- Show edit Judges save silently fails because chairman/secretary role rows are missing.

Automated proof:

- Host-club picker component tests verify cancel/create/selected-label behavior.
- Role/RLS or mutation tests verify newly-created clubs grant the needed role path.
- Show edit judge-save tests verify errors surface instead of failing silently.

Browser/manual proof:

- Secretary creates a new club inline, cancels once, creates again, sees the created club label, completes show creation, then edits/saves Judges.
- Network panel has no RLS denial for club/show/judge operations.

Status to record:

- `OPEN-TODOS.md` marks all Batch 1 items fixed.
- DB migration proof must include `supabase db push --dry-run` reporting remote database up to date.

## Batch 2 — Wizard Data Integrity

Proof target: the wizard preserves entered data and shows human values instead of schema/raw enum details.

Findings covered:

- Premium-style dropdown/type drift.
- Show Dates can be silently wiped by adjacent date picker.
- Entry Period cross-month range persists incorrectly.
- Trial Type trigger/cards display `scent_work`.
- AKC trial type list is too small.
- Trial date picker opens to the wrong month.
- AKC Event Number required state is too quiet.
- Element Select All has an empty accessible label.
- Rapid class-card clicks can drop selection state.

Automated proof:

- `src/components/ui/__tests__/date-range-picker.test.tsx`
- `src/components/shows/wizard/steps/TrialConfigurationStep.test.ts`
- Class selector/select-all accessibility and rapid-click tests from Batch 2.
- Trial card/table label tests that assert raw enum text is absent.
- Route/premium-style tests proving all supported styles are typed and rendered.

Browser proof:

- `qa-regression-proof.spec.ts` covers the canonical route, style options, date range independence, trial type labels/options, required event number, and date picker opening behavior.

Status to record:

- Targeted Batch 2/4 unit tests passed locally: 10 tests across 5 files on 2026-05-12.
- Strict browser proof passed locally on 2026-05-12 after tightening the proof harness and locators.

## Batch 3 — Post-Create Secretary Management

Proof target: after show creation, secretaries can manage entries, trials, and classes without dead ends or mislabeled actions.

Findings covered:

- Show detail Entries tab shows personal entries instead of full show entries.
- Public `/shows/:showId/register` says online entry is coming soon.
- Secretary registration dog picker defaults to empty + "your dogs".
- Manage Entries button leads to scoring instead of entry management.
- Secretary cannot remove an entry from a class.
- No delete affordance for trials/classes.
- New Trial launches the full wizard instead of focused flow.
- Class edit requires Judge despite wizard-created blanks.
- Class edit requires Start Time despite wizard-created blanks.
- Class header count shows `Classes (0)` while All Classes has rows.
- Trial summary cards display raw `scent_work`.

Automated proof:

- Role-specific Entries tab tests verify secretary sees show entries, not exhibitor-only personal entries.
- Registration route tests verify public registration renders the real entry flow.
- Entry management mutation tests verify remove/scratch/withdraw behavior.
- Trial/class delete confirmation tests verify affordance plus cancel/confirm behavior.
- New Trial route/action tests verify focused post-create flow.
- Class edit validation tests verify blank judge/start time are allowed.
- Class count tests verify `all` sentinel behavior.
- Shared trial-type formatter tests cover trial cards/table.

Browser/manual proof:

- Open one seeded Heritage/Headline show as secretary.
- Visit Entries, Classes, Trials, public registration, and class detail actions.
- Remove one disposable class entry through UI and verify the row/count updates.
- Add/delete one disposable trial/class with confirmation.

Status to record:

- Batch 3 PR is owned by the other conversation; this proof branch should link its merged PR and consume its tests once merged to `main`.

## Batch 4 — Feedback, Accessibility, And Calm UI Polish

Proof target: successful actions are visible, common controls are accessible, and console noise does not hide real problems.

Findings covered:

- Dashboard `Managing 0 shows` contradicts Needs Attention.
- Show cards on `/shows` are clickable divs instead of links.
- Sidebar links lack accessible names.
- Raw UUID leaks into Tasks panel UI.
- More actions contains only Delete Show.
- No success toast after deleting a show.
- Delete confirm shows trial times as `12:00 AM`.
- No success toast after registration/save/completion flows.
- Base UI native-button warning flood.
- Class judge dropdown renders `Liz Beezley( - )`.
- Show cards lack personalized badge.

Automated proof:

- `src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx`
- `src/components/layout/sidebar/__tests__/RoleSidebar.test.tsx`
- Show card link/accessibility tests.
- Task display tests asserting raw UUIDs are not visible.
- Delete dialog tests asserting dates omit meaningless midnight times.
- Toast tests for delete/show edit/registration completion.
- Base UI helper/regression tests proving expected `nativeButton` behavior.
- Judge dropdown label tests.
- Personalized badge tests for logged-in exhibitor show cards.

Browser proof:

- `qa-regression-proof.spec.ts` dashboard test asserts Needs Attention stays scoped to managed shows.
- The strict browser-health gate passed on 2026-05-12 with no remaining Base UI warning.

Current known blocker:

- None. The strict proof run is green.

## Batch 5 — Premium PDF Cover Upload

Proof target: Gazette/Magazine cover-image upload works and premium narrative failures are actionable.

Findings covered:

- Cover-image upload for Gazette + Magazine.
- Premium narrative generation can fail silently.

Automated proof:

- Supplemental data shape tests include `coverImageUrl`.
- Premium panel tests cover upload success, remove, and upload failure state.
- PDF cover renderer tests cover uploaded image and fallback stat-panel behavior.
- Narrative generation tests cover error detail and retry affordance.

Browser/manual proof:

- Upload a small cover image for Gazette and Magazine templates.
- Generate premium, preview PDF, and download PDF.
- Verify image appears when supplied and fallback appears when removed.
- Simulate/force narrative generation failure and verify actionable detail plus Retry.

Status to record:

- If migration/storage policy changed, include `supabase db push --dry-run` and storage bucket/policy verification.

## Batch 6 — Health Records And Training Journal

Proof target: dog-care and training quick actions are complete user-facing flows, not placeholders.

Findings covered:

- Import Records button.
- View Progress Report.
- Set Training Goals.

Automated proof:

- `src/components/dogs/DogDetails/HealthRecords/healthImport.test.ts`
- `src/components/dogs/DogDetails/HealthRecords/HealthTimeline.test.tsx`
- `src/components/dogs/DogDetails/TrainingJournal/trainingInsights.test.ts`
- `src/components/dogs/DogDetails/TrainingJournal/EnhancedTrainingJournal.test.tsx`
- Training goals dialog tests for create, complete, and reopen behavior.

Browser/manual proof:

- Open a dog detail page.
- Import valid and invalid CSV health rows; verify preview validation and created timeline records.
- Open progress report; verify sessions by skill, assessment distribution, and monthly training-time trends.
- Create, complete, and reopen a training goal; reload and verify persistence.

Status to record:

- Include migration verification for `training_goals` if that table was added in Batch 6.

## Targeted Commands

Run these from the QA proof worktree.

Batch 2 and Batch 4 core regressions:

```bash
cd apps/myk9show
npx vitest run \
  src/components/ui/__tests__/date-range-picker.test.tsx \
  src/components/shows/wizard/steps/TrialConfigurationStep.test.ts \
  src/components/layout/sidebar/__tests__/RoleSidebar.test.tsx \
  src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx \
  src/routes/routeRegistry.test.ts
```

Batch 6 health/training regressions:

```bash
cd apps/myk9show
npx vitest run \
  src/components/dogs/DogDetails/HealthRecords/healthImport.test.ts \
  src/components/dogs/DogDetails/HealthRecords/HealthTimeline.test.tsx \
  src/components/dogs/DogDetails/TrainingJournal/trainingInsights.test.ts \
  src/components/dogs/DogDetails/TrainingJournal/EnhancedTrainingJournal.test.tsx
```

Strict browser proof:

```bash
cd apps/myk9show
pnpm test:e2e:clean src/test/e2e/uat/secretary/qa-regression-proof.spec.ts --project=chromium --workers=1
```

Locator/debug mode only:

```bash
cd apps/myk9show
QA_STRICT_BROWSER_HEALTH=false pnpm test:e2e:clean src/test/e2e/uat/secretary/qa-regression-proof.spec.ts --project=chromium --workers=1
```

Debug mode is not sufficient proof; the final acceptance run must use strict browser health.

DB migration proof:

```bash
source supabase/.env 2>/dev/null && supabase db push --password "$SUPABASE_DB_PASSWORD" --dry-run
```

## Manual Replay Checklist

Replay the original secretary `qa-feature` walk after all six batches are merged:

- Create show from `/secretary/create-show/wizard`.
- Inline-create a club, cancel once, then create and use it.
- Set cross-month Show Dates and Entry Period.
- Add AKC trials with event numbers and human trial labels.
- Select multiple class cards rapidly and use element-level Select All.
- Create the show and verify no auth/RLS failures.
- Manage entries from show detail and class detail.
- Register through public show registration.
- Remove/scratch a disposable entry.
- Add/delete a disposable trial and class.
- Save show edit and verify success toast.
- Delete a disposable show and verify success toast plus clean confirm copy.
- Generate/preview/download Gazette and Magazine premium PDFs with uploaded covers.
- Import health records from CSV.
- Open training progress report.
- Create, complete, and reopen a training goal.

After every page/action:

- Check console errors.
- Check owned failed network responses.
- Capture any new issue in `OPEN-TODOS.md`.

## Current Worktree Status

- Plan expanded for Batches 1-6.
- `qa-regression-proof.spec.ts` currently covers Batch 2 and part of Batch 4.
- Targeted Batch 2/4 unit tests passed locally on 2026-05-12.
- Targeted Batch 6 unit tests passed locally on 2026-05-12.
- Strict browser proof passed locally on 2026-05-12.

## Completion Criteria

This proof branch is complete when:

- The matrix above has PR/test/manual evidence filled in for every Batch 1-6 finding.
- Targeted unit/component commands are green.
- Strict browser proof is green.
- The manual replay checklist is complete.
- Remaining unrelated open todos, like F30 dog-selection state desync or access-code secrecy, stay open and clearly out of scope unless separately fixed.
