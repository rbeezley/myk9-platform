# Tasks

## 1. Batch 1: number-first Add Dog and registry lookup (PR 1, independent review)

- [x] 1.1 Add migration `<ts>_myk9_1162_registry_identity_taken.sql` creating `public.registry_identity_taken(p_organization text, p_registration_number text) RETURNS boolean` (SECURITY DEFINER, STABLE, `search_path = public`, normalized comparison against live dogs, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated`). Add a behavioral SQL test under `supabase/tests/` covering a taken number, a free number, a soft-deleted-only number, and an anon refusal. Register it and verify the migration-auditor agent reports no blocking findings.
- [x] 1.2 Add a client wrapper `isRegistryIdentityTaken(org, number)` in `services/database/registrations/`. It returns `null` offline or on error, never throws, and never blocks. Verify unit tests cover true, false, offline and error.
- [x] 1.3 Reorder `DOG_STEP_TABS` to Registration → Essential → Optional. Rebuild the Registration step's opening state as the identity form (registry + number + **Find dog**), reusing `RegistrationFormBody` fields, and reveal the remaining registration fields after a no-match result. Verify the AddDogPanel tests assert the new order and the reveal.
- [x] 1.4 Wire the lookup:
  - local `findDogByExactRegistrationIdentity` over the panel's dogs with no owner filter, showing the existing "Use existing dog" card and `handleUseExistingDog`;
  - then the RPC when online;
  - a taken-but-not-visible result shows "This number is already registered to another dog. Contact the show secretary." and blocks continuing with that identity.

  Verify with tests: local hit, RPC-only hit (no details rendered), no match, offline (no network wait).

- [x] 1.5 Gate the step: exhibitors cannot pass Registration with zero registrations (a step-scoped schema issue via `locateInvalidField`), and managers (`isAdminRole(userRole)`) get **No registration number yet**, which skips the lookup. Verify tests for each role, including the `QuickCreateFlow` (secretary) and `StepDogs` (exhibitor) callers.
- [x] 1.6 Run the affected AddDogPanel, dogIdentity, registration and onboarding test directories shuffled, plus `pnpm typecheck`, `pnpm lint` and `pnpm qa:code-quality-ratchet` in the worktree. Verify all are green.
- [x] 1.7 Ship batch 1:
  - PR referencing MYK9-1162;
  - `pnpm qa:review-tier`, then `pnpm qa:codex-review --post`, with findings fixed;
  - watcher green, then squash-merge;
  - the migration's `db push` is listed as owner-pending in the PR.

## 2. Batch 2: held entries (PR 2, independent review)

- [x] 2.1 Add migration `<ts>_myk9_1162_entries_registration_manager_exception.sql`. It copies `entries_require_dog_registration()` from `20260828210000`, adds `IF public.can_manage_trial(<trial id>) THEN RETURN NEW; END IF;` after class and trial resolution, and updates the header comment. Extend the behavioral SQL test: a manager insert without a number passes, an exhibitor insert fails, and the puppy carve-out is unchanged. Verify the migration-auditor reports no blocking findings.
- [x] 2.2 Expose the server's held verdict (`awaiting_registration_number` on both entry-results views) and read it through `isHeldEntry` in `features/dogs/identity/`; the client never rederives it (design D4, owner decision 2026-10-14).
- [x] 2.3 Exclude held entries from:
  - `catalogRows` and `countCatalogClass`;
  - `buildRunSheetEntries` and the run-order source;
  - `paperScoresheetData.loadEntriesWithDogs`;
  - pipeline print.

  Load registrations where a builder lacks them. Verify each builder has a test with one held and one normal entry, and a test showing that unloaded registrations exclude nothing.

- [x] 2.4 Update `emergency_packet_input` (copy from `20260922220537`) to exclude held entries using its existing per-registry registration join. Verify an extended behavioral SQL test.
- [x] 2.5 Add the `'registration-needed'` exception:
  - params, views and count;
  - the pane in `EntryManagementPage`;
  - rows with Add registration and the existing Pull / Withdraw actions.

  Verify tests for the count, the row actions, URL round-trip and removal after a number is added.

- [x] 2.6 Update secretary guide card 5 (`docs/user-guides/secretary-guide.md:103-119`): replace the "save is refused" callout with held-entry behavior and the Exceptions pane. Verify `pnpm format:check:changed` passes and the callout matches the behavior.
- [x] 2.7 Run the shuffled affected test directories, typecheck, lint and the ratchet. Verify green; then grep for any other run-list or catalog consumer not covered and list the result in the PR.
- [ ] 2.8 Ship batch 2 as in 1.7.

## 3. Batch 3: "Registration number needed" email (PR 3, independent review)

- [x] 3.1 Add migration `<ts>_myk9_1162_lifecycle_registration_number_needed.sql`:
  - drop and re-add the `step_type` CHECK on both `show_lifecycle_email_steps` and `show_lifecycle_email_jobs` with `registration_number_needed`;
  - update `ensure_show_lifecycle_email_steps` (copy from its latest definition);
  - backfill existing shows.

  Verify a migration test for the CHECK and the backfill, and that the migration-auditor reports no blocking findings.

- [x] 3.2 Client side:
  - add the step to `LIFECYCLE_EMAIL_STEP_TYPES`;
  - add its draft in `render.ts`;
  - add its toggle in `ScheduledLifecycleEmailsPanel`.

  Verify render tests (dog, show, registry, instructions; escaped content) and toggle tests.

- [x] 3.3 Offer the preview after a secretary save that created held entries, following the `useEntryDecisionLifecycleEmails` pattern and the existing preview dialog. Add **Send reminder** on the Exceptions row, preparing a fresh `save_ready` job with a reminder-sequenced idempotency key, and "No email on file — contact by phone" when there is no address. Verify hook and pane tests, including the disabled step (no offer, no reminder).
- [x] 3.4 `send-lifecycle-email`: before sending a `registration_number_needed` job, re-check server-side that its entry is still held, and mark the job skipped if not. Verify handler tests under `// @vitest-environment node`: still held → sent, number added → skipped, unauthorized → refused.
- [x] 3.5 Update secretary guide section 9 ("Email your exhibitors") with the new step. Run the shuffled affected tests, typecheck, lint and the ratchet; verify green.
- [ ] 3.6 Ship batch 3 as in 1.7. The PR lists the owner-pending `db push` and the `send-lifecycle-email` deploy.

## 4. Batch 4: integration (PR 4)

- [ ] 4.1 Add an isolated-target e2e journey: a secretary adds a dog number-first (existing-dog hit, then a no-number skip), enters it, sees it under Registration number needed, and confirms it is absent from the class run sheet; then adds the number and sees it leave the pane and appear on the run sheet. Add an exhibitor phone-width Add Dog that hits the foreign-number message. Verify it passes on the Nightly target and fails if the trigger relaxation is reverted.
- [ ] 4.2 Run `opsx:verify` against the integrated tree and fix CRITICAL findings in this PR. Verify the report has no CRITICAL findings.
- [ ] 4.3 Ship batch 4 with the review tier the diff reports; watcher green, then squash-merge.

## Workflow follow-up

- Owner runs `supabase db push` (batches 1–3, in order) and deploys `send-lifecycle-email` (batch 3). Verify grants, the trigger and the CHECKs on the applied database per CLAUDE.md § Database Migrations.
- Archive the change (`opsx:archive`), comment on MYK9-1162 with evidence, and move it to Done after a fresh `get_issue` check. Re-scope MYK9-1151 against the merged lookup.
