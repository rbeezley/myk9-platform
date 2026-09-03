# MYK9-361: Truthful role assignment during user creation

> **Status:** Complete

Request: implement MYK9-361

Narrow bug fix using the existing role vocabulary and Manage Roles surface; no new OpenSpec change is needed. Does this duplicate an existing page? No: club grants stay in Manage Roles, reached through the user record opened after creation.

- [x] Reproduce swallowed secretary grant failure with component assertions before changing implementation.
- [x] Restrict creation to manageable, non-club roles; report failed grants and include only successful grants in invitations.
- [x] Test filtering, partial/all grant failure, successful invitations and contact-only creation. Once secretary is unavailable, exercise the same rejection with judge.
- [x] Run affected Vitest, monorepo typecheck and lint; inspect the final diff.

No database, permission policy, or role-manager changes. Creation remains an online admin flow. Failed grants leave the created record available for repair in Manage Roles.

## Verification evidence

- Baseline component regression selected Secretary and rejected its grant: both invitation modes failed on the erroneous success toast before the implementation changed.
- Final component coverage uses Judge for the same rejection path because Secretary is no longer offered. Filtering additionally covers legacy `trial_secretary`, `club_admin`, and unknown roles.
- Final shuffled Vitest: **40/40 passed** across CreateUserDialog and RoleManager (seed 1788467013290). Includes partial/all grant failures, combined grant and delivery failures, pending-grant submission protection, failed role lookups, and existing-assignment verification.
- Full shuffled app suite: stopped after approximately 60 seconds with no test progress, following the repository hang rule; no full-suite pass claimed.
- Schema/defaults moved unchanged to a sibling module to keep the component below 500 lines.
- Independent shipping review found an ambiguous `false` role-service result. Fixed locally by verifying the exact active, unexpired, unscoped assignment before advertising that role; missing assignments and lookup errors are failures. New tests ran red before the fix. Second review: **APPROVED**, no blocking findings. Role policy and database schema remain unchanged; existing Manage Roles handles repair.
- `pnpm typecheck`: passed, including application, test, E2E baseline gate, and edge-test checks. Initial sandbox run could not open the tsx IPC socket; permitted rerun passed. Existing E2E diagnostics remain within the repository baseline.
- `pnpm lint`: passed with 0 errors and 18 existing warnings.
- Prettier on touched TypeScript and `git diff --check`: passed.
- Branch: `codex/myk9-361`. Merged in PR #2003 (`6858ba9b1399e73d00c4e3f67648d924d230e9a8`); MYK9-361 is Done. All required CI checks passed, including Test, Quality Checks, A11y smoke, and E2E PR Smoke.
