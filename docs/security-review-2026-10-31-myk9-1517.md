# Security review — MYK9-1517

- **Date:** 2026-10-31
- **Mode:** Diff review of PR #3462, merge `3226753a50385f9d1eb84104de60208c06399397`, against its first parent
- **Verified checkout:** `1cc9a82cf5e7f78523cbcfcc879a3d7d8b566fb1`
- **Checklist:** `.agents/skills/security-audit/references/checklist.md`, tracked checklist version `04be60937`
- **Reviewers:** Codex primary agent (client/data flow) and `owner_sheet` subagent (SQL/authorization)

## Result

The required security audit has one unresolved **MEDIUM** authorization finding. It does not pass yet. No implementation was changed, no new issue was created, and no browser or production authentication test was run.

| Severity | Count |
| -------- | ----: |
| Critical |     0 |
| High     |     0 |
| Medium   |     1 |
| Low      |     0 |

Auto-fixes applied: none. Implementation belongs to the existing MYK9-1517 issue.

## SA-1517-01 — inactive people retain access to the limited roster

**Categories:** authorization and data exposure.

**Location:** `supabase/migrations/20261031055300_myk9_1517_exhibitor_show_dogs.sql:82`, and its live-entry authorization arm at line 125.

`show_dogs_limited_view` resolves the requesting person by `auth_user_id` without checking `deleted_at` or `status`. Its SECURITY DEFINER execution bypasses the underlying tables' RLS. A surviving handler, owner or co-owner entry therefore continues to authorize that principal after suspension or supported person soft deletion.

Two guarded, local SQL controls confirmed the same missing identity predicate:

1. A previously eligible synthetic exhibitor was suspended. Under that account's existing request principal, the RPC still returned **three roster rows**, including another exhibitor's dog.
2. A synthetic handler-only person with no owned dogs successfully called the supported `soft_delete_person` RPC. The same principal then still received **three roster rows**. This exercised the supported deletion boundary, including its owns-dogs guard.

The exposure is limited to the approved roster projection for a formerly eligible show. No arbitrary-show access, contact details, scores, registration data, payment data or privilege mutation was demonstrated. This bounded exposure and the existing-principal prerequisite support MEDIUM severity.

The token hook rejects suspended accounts when issuing or refreshing a token, and AuthContext signs out a suspended profile. Those controls do not make the new RPC check a still-valid request principal. Repository configuration and applied local and hosted role/database settings contained no `pgrst.db_pre_request` hook. **An HTTP attack replay was not performed**; the demonstrated behavior is authenticated SQL execution of the applied function.

**Required follow-up:** resolve the account authorization arm through a live, active person and add regressions for suspension with an existing principal and supported handler-only self-deletion. Preserve the independent, current anonymous passcode arm. This finding does not reopen the owner's accepted MYK9-1593 or MYK9-1578 scope decisions.

## Verification performed

- Loaded the exact merged function into isolated stack `verify-in-review-1031` only, with an exact data-directory-prefix guard. Native listener: loopback port 41791. No hosted migration or committed hosted data write occurred.
- Replayed the merged MYK9-1517 behavioral SQL assertions and the additional identity controls in a transaction. Baseline projection, grants, show membership, no-entry/other-show denial, current/stale passcode, deleted related entities, non-running entries, null identity, numeric armbands and pagination controls passed. Forged user-writable passcode metadata was denied.
- The final probe explicitly rolled back. A separate read-only query found **zero** remaining synthetic people, auth users, entries and shows from the security test.
- The first self-delete attempt correctly hit the owns-dogs guard. Only the synthetic fixture setup was corrected for the successful handler-only control; no implementation was patched and no hanging runner was retried.
- Applied local function ACL was `{postgres, service_role, authenticated}` with no PUBLIC/anon execution. SECURITY DEFINER and an empty search path were verified. The migration creates no table, column grant or sequence grant.
- The existing exact-head CI run `41208635317`, SQL job `124559206667`, had already passed the registered behavioral SQL suite. That prior CI evidence is distinct from the new local controls.
- Rebuilt `@myk9/supabase` successfully after aligning the verification checkout with the deployed commit.
- Ran `AtShowDogsLink.test.tsx`, `AtShowDogsPage.test.tsx`, `exhibitorDogIndex.test.ts` and `useAtShowExhibitorDogs.test.tsx`: **four files, 34 tests passed, exit 0**, 4.57 seconds. No test source was changed.

Detailed local receipts: `.logs/1517-security-probe.sql`, `.logs/1517-security-probe.log`, `.logs/1517-security-rollback-check.log`, `.logs/1517-prerequest-local.log`, `.logs/1517-prerequest-hosted.log`, `.logs/1517-app-tests.log` and `.logs/1517-local-function-setup.log`.

## Other security controls checked

| Category         | Examined behavior                                                                                                | Result                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| RLS integrity    | New function and explicit grants; unchanged table policies; deleted show, trial, class and dog filtering         | The caller identity finding above remains                                  |
| Authorization    | Account membership and immediate identity, token, soft-delete and passcode-generation helpers                    | Inactive person authorization fails                                        |
| Client auth      | Staff/exhibitor hook selection, unresolved-role redirect and inherited show-scoped grants                        | No additional finding                                                      |
| Data exposure    | Exact nine-column projection and exhibitor row mapping; shared list renders no score fields or staff detail link | No additional finding                                                      |
| Input validation | UUID/integer RPC arguments, fixed SQL, guarded armband cast, bounded paging and React-escaped text               | No additional finding                                                      |
| Edge/payment     | No changed edge function or payment path                                                                         | Outside this diff; immediate passcode stamper checked only as a dependency |

The client uses the existing list and favorites flow. Exhibitor mapping deliberately supplies no score, time, faults or placement values, and the exhibitor list has no staff dog-detail link. The server function's return signature contains exactly the owner-approved armband, call name, breed, handler, class, trial/date and check-in fields.

The prior `docs/security-audit-2026-10-31.md` is a broader audit and does not cover this newly merged RPC. This report addresses MYK9-1517's explicit security-audit criterion; it does not reassess unrelated findings or claim the outstanding three-identity browser and alert-delivery criteria passed.
