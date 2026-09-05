# MYK9-354: qualification save authorization contract

> **Status:** Complete — metadata reconciled 2026-09-05.
> MYK9-354 Done in authoritative inventory; PR #1994 freshly verified MERGED, 648a0619ba3d0a25638b01bc878ced3beaa7fc09; full SQL evidence in plan.


## Scope and owner decision

On 2026-09-03, the owner approved secretaries managing the full qualification
list through `replace_judge_qualifications`, including removing all rows, while
direct table DELETE stays site-admin-only. This explicitly accepts the
RPC/table-policy distinction instead of widening direct DELETE or restricting
secretary saves. Ordinary users remain unable to edit their own credentials.

The implementation is already deployed in PR #1992 (`29f76327a`). This follow-up
documents and tests that existing behavior; it does not change permissions,
introduce UI, rewrite deployed migrations, or deploy another migration.
The lightweight workflow is appropriate for this narrow docs/test follow-up.

## Testing seams

The owner approved these interfaces: `public.replace_judge_qualifications`
and direct `DELETE` on `public.judge_qualifications`. Exercise both as
`authenticated`, with separate ordinary-user, secretary, and site-admin JWTs.

## Implementation and testing

- [x] Document the approved operations, global secretary scope, and rationale
      alongside the RLS comparison in the existing judge role document.
- [x] Extend the registered behavioral SQL test: secretary clears the list and
      restores it through the RPC; secretary direct DELETE remains denied;
      site-admin direct DELETE actually removes a row. Retain existing ordinary
      self-denial and authorized replacement coverage.
- [x] Run the SQL test against an isolated local PostgreSQL schema using the
      repository's relevant migrations/helpers. Prove sensitivity by temporarily
      denying secretary clear-list saves and by widening direct DELETE in that
      disposable database; each mutation must fail the test. Restore and pass.
- [x] Run the behavioral harness tests, review both standards and approved
      scope, and commit only this follow-up.
- [x] Record the owner decision and verification in MYK9-354; close only after
      the follow-up merges and its expanded SQL contract passes in CI.

## Verification boundary

The earlier full migrated Supabase CI and deployed-function verification are
recorded on MYK9-354. The local reduced-schema run for this follow-up is not a
replacement for full-schema CI. Both evidence gates are now satisfied below.

## Verification results — 2026-09-03

- The expanded SQL contract passed on isolated PostgreSQL 18 with the actual
  repository qualification table, policies, RPC, authorization helpers, and
  secretary club-scope constraint; surrounding auth/people tables were reduced
  fixtures, not a full Supabase migration replay.
- A mutated RPC denying only secretary empty-list saves failed at the new
  clear-list call. Restoring the deployed RPC passed.
- A widened secretary direct DELETE policy failed the denial assertion.
- An admin DELETE policy that denied everyone failed the new admin-positive
  assertion. Restoring the repository policies passed the full contract again.
- Behavioral SQL harness: 8/8 tests passed. `git diff --check` passed.
- No application TypeScript or runtime changes: no broad app suite needed for
  this docs/test-only follow-up. Expanded full-schema SQL CI subsequently passed.

## Standards review

No findings. Existing SQL conventions, isolated worktree, scoped changes,
sub-500-line files, and the pending CI gate are preserved.

## Spec review

No findings against the owner-approved RPC/direct-DELETE distinction.

Review summary: Standards 0 findings; Spec 0 findings.

## Completion — 2026-09-03

[PR #1994](https://github.com/rbeezley/myk9-platform/pull/1994) merged at
17:12:46 UTC as `648a0619ba3d0a25638b01bc878ced3beaa7fc09`.
[All required CI checks passed](https://github.com/rbeezley/myk9-platform/actions/runs/33781805850),
including the expanded SQL contract against the complete migrated Supabase
schema. The SQL job explicitly confirmed secretary replace/clear/restore,
ordinary denial, secretary direct DELETE denial, and admin RPC/direct DELETE.

The original migration was deployed and verified at 16:43:39 UTC: the live
function no longer contains the self-service authorization arm, while direct
DELETE remains site-admin-only. MYK9-354 is Done with all acceptance criteria
satisfied. This docs/test follow-up requires no additional deployment.
