# MYK9-354: qualification save authorization contract

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
- [x] Record the owner decision and verification in MYK9-354; keep it open
      until the follow-up is merged and its expanded SQL contract passes in CI.

## Verification boundary

The earlier full migrated Supabase CI and deployed-function verification are
recorded on MYK9-354. The local reduced-schema run for this follow-up is not a
replacement for new CI coverage. Do not claim a fresh CI pass before it runs.

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
  this docs/test-only follow-up. Expanded full-schema SQL CI remains pending.

## Standards review

No findings. Existing SQL conventions, isolated worktree, scoped changes,
sub-500-line files, and the pending CI gate are preserved.

## Spec review

No findings against the owner-approved RPC/direct-DELETE distinction.

Review summary: Standards 0 findings; Spec 0 findings.
