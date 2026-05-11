# Open Todos Remediation Master Plan

Created: 2026-05-11

Purpose: turn the open todo backlog into a sequence of autonomous, testable repair batches after the QA-walk worktree is merged.

## Operating Rules

- Work from the merged `OPEN-TODOS.md` as the source of truth.
- Prefer small branches/commits by theme, not one branch per todo.
- Fix root causes before symptoms.
- Preserve `docs/INTENT.md`: secretary work should feel "That was easy"; exhibitor work should feel "This respects my time."
- Ask for user confirmation only for shared-system mutations: `supabase db push`, function deploys, GitHub PR/merge actions, or external-service writes.
- Update `OPEN-TODOS.md` and any relevant tracking docs after each completed batch.

## Batch 0 — Normalize the Backlog

Goal: make the backlog reliable before coding.

Tasks:
- Merge the QA-walk worktree into `main`.
- Confirm `OPEN-TODOS.md` contains the full QA-walk section.
- Remove or keep already-completed items consistently, especially `Secretary Task Timeline View` if it is already fixed on `main`.
- Add stable finding IDs to QA-walk todos where helpful (`F14`, `F17`, etc.) so references do not drift when numbering changes.

Testing:
- No app tests required.
- Verify `rg "QA Walk — Shows as Secretary" OPEN-TODOS.md`.

## Batch 1 — Show-Creation Flow Stopper

Goal: make a fresh secretary able to create a show end to end.

Todos covered:
- Host Club picker shows `No clubs found`.
- New club briefly displays `Unknown Club`.
- Create New Club has no way back.
- `Failed to create show: not authorized to create shows for club <id>`.
- Show edit Judges save silently fails because role rows are missing.

Likely work:
- Inventory `roles`, `permissions`, `role_permissions`, club membership/admin tables, `user_roles`, and relevant RLS policies before writing migrations.
- Fix club-create flow so the creator receives the required club-admin/member permission.
- Fix `create_show_with_children` so chairman/secretary user roles are created for the show.
- Make judge-assignment persistence throw on Supabase errors and surface a toast.
- Update host-club picker cache after inline club creation.
- Add a "Use existing club instead" action.

Testing:
- Assertion-first unit tests for the exact RPC payloads / mutation responses where possible.
- Focused component tests for host-club inline create and cache label.
- Migration/RLS validation locally if available.
- Manual secretary wizard smoke test after user-approved DB push.

## Batch 2 — Wizard Data Integrity

Goal: stop users from losing entered data or seeing raw schema values.

Todos covered:
- Premium-style wizard dropdown lists 8 options but type declares 6.
- Show Dates can be silently wiped by adjacent date picker.
- Entry Period multi-month range fails to persist.
- Trial Type trigger displays `scent_work`.
- Trial Type options are incomplete or unclear for AKC.
- Trial date picker opens to the wrong month.
- Event Number required state is too quiet.
- Select All checkbox has empty accessible label.
- Class-card rapid clicks can drop selections.

Likely work:
- Align premium style option source with `PremiumStyle` or deliberately restore missing styles with renderers.
- Isolate show-date and entry-period picker state.
- Fix cross-month range selection.
- Centralize trial-type label formatting and use it in forms and cards.
- Improve trial-date default month.
- Add inline validation near Next for missing event numbers.
- Add element-level aria labels.
- Stabilize class selection state updates.

Testing:
- Unit tests for premium-style options and trial-type formatting.
- Component tests for date-range picker behavior, including cross-month ranges.
- Component/a11y tests for element select-all labels.
- Interaction test for rapid class-card selection.

## Batch 3 — Post-Create Secretary Management

Goal: after creation, secretaries can manage the show without dead ends.

Todos covered:
- Entries tab shows personal entries instead of all show entries.
- Public registration says online entry is coming soon.
- Secretary registration dog picker defaults to empty + "your dogs".
- Manage Entries leads to scoring view.
- Secretary cannot remove an entry from a class.
- No delete affordance for trials/classes.
- New Trial launches the full wizard.
- Class edit requires Judge/Start Time though wizard creates blanks.
- Class header count is wrong.
- Trial summary cards display `scent_work`.

Likely work:
- Separate exhibitor "My Entries" from secretary "All Entries".
- Decide whether to enable public registration or make the disabled state explicit and non-blocking.
- Improve secretary dog search defaults/copy.
- Rename scoring-only buttons or build true entry-management actions.
- Add scratch/withdraw/remove/transfer affordances where supported by schema.
- Add trial/class delete confirmations.
- Replace "New Trial" wizard path with a focused form/dialog.
- Relax edit validation or provide wizard defaults for judge/start time.
- Reuse centralized trial-type label formatter.

Testing:
- Component tests for role-specific entries tab behavior.
- Mutation tests for entry remove/scratch/withdraw where implemented.
- Component tests for delete confirm flows.
- Route tests for "New Trial" destination.

## Batch 4 — Feedback, Accessibility, and Calm UI Polish

Goal: make successful actions visible and common controls accessible.

Todos covered:
- Dashboard says "Managing 0 shows" while Needs Attention lists shows.
- Show cards use clickable `<div>` instead of links.
- Sidebar nav links lack accessible names.
- Raw UUID leaks into Tasks panel UI.
- More actions has only Delete Show.
- No success toast after deleting a show.
- Delete confirm shows trial times as 12:00 AM.
- No success toast after registration/save/completions.
- Console flood: Base UI button warning.
- Class judge dropdown renders `Liz Beezley( - )`.
- Show cards lack personalized badge.

Likely work:
- Align secretary dashboard queries/counts.
- Convert show cards to real anchors.
- Add labels to icon-only nav links.
- Hide raw IDs from visible task text.
- Inline single destructive action or add meaningful actions.
- Standardize success toasts.
- Hide meaningless midnight times.
- Add `nativeButton={false}` only where intentional, or render true buttons.
- Omit empty judge qualification suffixes.
- Wire user entry status into browse cards.

Testing:
- Component tests for dashboard counts and task display.
- A11y assertions for nav link names and show-card anchors.
- Toast tests for successful mutations.
- Regression tests for judge dropdown labels.

## Batch 5 — Premium PDF Cover Upload

Goal: complete Gazette/Magazine cover-image upload without regressing PDF rendering.

Todos covered:
- Cover-image upload for Gazette + Magazine.
- Premium narrative generation can fail silently.

Likely work:
- Add `coverImageUrl` to `PremiumSupplemental` and `club_premium_templates`.
- Add Supabase Storage upload UI in `GeneratePremiumPanel`.
- Render uploaded cover image in Gazette and Editorial covers, with stat-panel fallback.
- Avoid the browser `Buffer is not defined` path by using a browser-safe image data strategy.
- Add actionable narrative-generation error details and Retry.

Testing:
- Type tests / component tests for supplemental data shape.
- Unit tests for image fallback behavior.
- Component tests for upload success/failure states.
- PDF preview smoke test.
- User-approved DB push for migration.

## Batch 6 — Health, Training, Payments, and Pre-Launch Work

Goal: schedule larger feature work after the show-creation and management path is stable.

Todos covered:
- Import Records button.
- Wire up edit for all health record types.
- View Progress Report.
- Set Training Goals.
- Stripe Integration.
- Exhibitor Payments page.
- CI-gated Vercel deploys.
- Require PRs to merge into main.
- Make E2E CI jobs blocking.
- Pre-load AKC & UKC Judge Directory.

Likely work:
- Create separate implementation plans for each feature-sized item before coding.
- Do Stripe before Exhibitor Payments.
- Do E2E stability before making E2E blocking.
- Treat judge directory import as a data-ingestion project with source verification.

Testing:
- Each feature plan must include unit tests, integration tests where applicable, and one manual smoke path.
- CI/branch-protection changes require user approval before external GitHub/Vercel mutation.

## Autonomous Execution Loop

For each batch:

1. Read relevant code, schemas, tests, and plans.
2. If a DB/data bug is involved, inventory all related tables and policies before writing a migration.
3. Write or update focused tests first for value-sensitive bugs.
4. Implement the smallest coherent fix set.
5. Run targeted tests.
6. Run `pnpm typecheck` when the batch touches shared types or several modules.
7. Update `OPEN-TODOS.md` and related plan/tracking docs.
8. Report only blockers, verification, and next batch.

## Recommended First Move

After the worktree merge, start with Batch 0, then Batch 1. Batch 1 removes the biggest secretary flow stopper and fixes the permission foundation that several later bugs depend on.

## Progress Log

### 2026-05-11 — First parallel repair wave

Completed:
- Batch 0 source-of-truth check: merged `OPEN-TODOS.md` contains the full QA-walk section.
- Batch 1 partial: added a migration that grants the creator an active `club_admin` role scoped to newly-created clubs; made show-level judge assignment persistence throw on delete/insert errors instead of swallowing RLS failures.
- Batch 2 partial: fixed trial type label formatting, trial date picker default month, clearer AKC event-number requirement, class selector accessibility labels/mixed state, and rapid class selection state.
- Batch 3 partial: relaxed simple class edit validation for blank judge/start time and improved secretary/admin dog-picker empty-state copy.
- Batch 4 partial: converted browse show cards to links, removed raw show IDs from Tasks UI, inlined single Delete Show action, added delete success toast, removed default midnight times from delete confirmation, and stripped empty judge qualification suffixes.

Verification:
- `npx vitest run src/types/__tests__/template.types.test.ts src/lib/validation.class.test.ts src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/TasksTab.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/taskTimelineUtils.test.ts src/components/templates/secretary/SimpleClassSelector.test.ts src/services/database/judges/reads.test.ts`
- `pnpm typecheck`

Shared-system work completed:
- Pushed and verified `supabase/migrations/20260511100000_grant_club_admin_to_club_creator.sql` against linked Supabase project `sojmvhhwsjxmfistvzbe`.

### 2026-05-11 — Batch 2 focused repair wave

Completed:
- Batch 2 partial: hardened `DateRangePicker` so empty calendar emissions do not wipe selected dates, cross-month ranges preserve both endpoints, and the calendar opens from a stable default month.
- Batch 2 partial: expanded wizard trial-type options so organization mappings remain the base list even when templates are sparse, and formatted raw trial-type enum values on Trials tab cards and table rows.
- Batch 2 partial: replaced the stale `/secretary/classes` show-creation registry/admin-help entry with `/secretary/create-show/wizard` and removed the unused `CreateShowPage` redirect page.
- Batch 2 partial: added accessible names/titles to collapsed sidebar icon links.
- Batch 4 carryover: filtered pending-entry attention items through the same managed-show set used by the secretary dashboard count.

Verification:
- `npx vitest run src/components/shows/wizard/steps/TrialConfigurationStep.test.ts src/components/ui/__tests__/date-range-picker.test.tsx src/test/components/shows/TrialsTab.test.tsx src/components/shows/tabs/__tests__/TrialsTab.table.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx`
- `pnpm typecheck`
- `pnpm lint`
