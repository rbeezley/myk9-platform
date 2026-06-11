# Security Audit — 2026-06-11

**Mode:** Diff Review (branch: `claude/stupefied-buck-698877`)
**Checklist version:** references/checklist.md @ 84e656142

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 1 |
| **Total** | **1** |

Auto-fixable: 0 of 1 findings

**Verdict on the focus question — does the tightened RLS actually close the cross-tenant read hole?**
**Yes, verified.** With both `ENABLE` (mig 006) and `FORCE` (mig 021) RLS on `dogs` and `people`, there is no residual path for a non-staff user to read another owner's dog or another person's PII. See the adversarial analysis under SA-NONE.

## Findings

### [LOW] SA-001: `reconcileDeleted` can transiently clear the local dog cache on an empty-but-successful fetch

**Category:** Data Exposure (availability edge, not exposure)
**Location:** `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts` (`reconcileDeleted`)
**Evidence:**
```ts
const { data, error } = await query;        // select('id').is('deleted_at', null)
if (error || !data) return 0;               // guards failure, NOT empty success
const liveIds = new Set(data.map(...));
return this.removeStaleEntries(liveIds);    // empty set → removes all non-dirty rows
```
`sync()` only calls this after a successful download, and `removeStaleEntries` preserves dirty (pending-write) rows. But an RLS-filtered SELECT returns `[]` with `error === null` when no rows match — including the brief window of a token-refresh race where `auth.uid()` is momentarily unresolved. In that window `liveIds` is empty and every non-dirty cached dog is pruned.
**Risk:** Availability/UX only — **not** a security exposure. Server data is untouched, dirty local writes are preserved, and the next authenticated sync re-downloads the rows, so the condition is self-healing. No cross-tenant data is revealed. This matches the existing `ReplicatedArmbandsTable` `shouldCleanupStaleRows` precedent.
**Fix (optional hardening, not required):** skip the prune when the main sync downloaded zero rows *and* the local store is non-empty, or assert an authenticated session before reconciling. Deferred — the self-healing behavior is acceptable for a pre-launch offline cache.
**Auto-fixable:** No (design decision on the guard condition).

---

### SA-NONE: Adversarial analysis of the tightened policies (no finding — recorded for the reviewer)

`dogs_select`: `deleted_at IS NULL AND (owner_id = (SELECT get_my_person_id()) OR co_owner_id = (SELECT get_my_person_id()) OR (SELECT is_show_manager()))`

- **Non-staff reading a non-owned dog:** `is_show_manager()` → false; `owner_id`/`co_owner_id = my_person_id` → false for dogs they don't own → row excluded. **Closed.**
- **User with no `people` row / unauthenticated:** `get_my_person_id()` → NULL. `owner_id = NULL` evaluates to NULL (not TRUE) in SQL, so a dog with `owner_id IS NULL` is *not* accidentally matched, and the user reads nothing. **No null-match bypass.**
- **`anon` role:** policy is `TO authenticated`; anon gets no policy → no access.

`people_select`: `deleted_at IS NULL AND (auth_user_id = (SELECT auth.uid()) OR (SELECT is_show_manager()))`

- **Non-staff reading another person:** `is_show_manager()` → false; `auth_user_id = auth.uid()` matches only their own row. Other people's email/phone → blocked. **Closed.**
- **Unlinked people (`auth_user_id IS NULL`, secretary-created):** `NULL = auth.uid()` → NULL → not self-matched; only staff can read. **Correct.**

`is_show_manager()` = `is_site_admin() OR is_trial_secretary() OR is_club_admin()` — all three sub-helpers are the migration-156 `SECURITY DEFINER STABLE` versions that check `ur.auth_user_id = auth.uid()` against `user_roles` (no `people` join) and respect `is_active = true AND (expires_at IS NULL OR expires_at > now())`. **(Note: the originally-committed version used `has_role('club_admin')`, which joins `public.people` and would have caused RLS recursion (42P17) under FORCE RLS when evaluated inside `people_select`; corrected to `is_club_admin()` per Codex P1.)** So **suspended/expired staff roles do not grant access**, and there is no privilege-escalation surface (the function only reads role state; it grants nothing and takes no user input). Uncorrelated `(SELECT …)` call sites are InitPlans — a positive side effect for performance, neutral for security.

**Intentional residual (documented in `docs/plan-dogs-people-rls-tightening.md`, not a finding):** any staff role reads *all* dogs/people platform-wide (not show-scoped), and `email`/`phone` remain readable on rows a viewer can already see. Both are accepted pre-launch trade-offs; column masking and show-scoping are deferred follow-ups.

## Categories Checked

| Category | Files Examined | Findings | Skipped |
|----------|---------------|----------|---------|
| RLS Policy Integrity | 1 (mig 20260611120000 + 5 referenced helpers) | 0 | — |
| Edge Function Auth | 0 | — | No changes |
| RBAC & Privilege Escalation | 1 (is_show_manager + sub-helpers) | 0 | — |
| Client Auth Patterns | 0 | — | No changes |
| Data Exposure | 1 (ReplicatedDogsTable.ts) | 1 (LOW) | — |
| Payment Security | 0 | — | No changes |
| Input Validation | 1 (ReplicatedDogsTable.ts) | 0 | — |

## Previous Audit Comparison

No `docs/security-audit-*.md` / `docs/security-review-*.md` present prior to this run — first review for this branch, no comparison available.
