# Show Creation Wizard — Harden Follow-ups

**Date:** 2026-04-21
**Scope:** Post-merge harden review of PR #67 (`fix(shows): atomic show creation via create_show_with_children RPC`)
**Status:** 3 HIGH findings recorded. Medium/low findings lost to context compaction — **re-run `/harden` to recover the full list before treating this as complete.**

---

## Context

PR #67 introduced `create_show_with_children` (migration 145), an atomic SECURITY DEFINER RPC that replaced the legacy multi-step show-creation path for the new-show-online scenario. The code under review:

- [`apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts`](../../../apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts)
- [`apps/myk9show/src/pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts`](../../../apps/myk9show/src/pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts)
- [`apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`](../../../apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts)
- [`supabase/migrations/145_create_show_with_children_rpc.sql`](../../../supabase/migrations/145_create_show_with_children_rpc.sql)

---

## HIGH-Severity Findings

### HIGH-1: Official role grant failures silently swallowed in the atomic path

**File:** `saveShowAtomicOnline.ts:134–152`

The `void Promise.allSettled(...)` block that fires `grant_show_official` RPCs logs failures to the console but **never calls `notifications.warning()`**. The legacy offline/edit path in `useShowCreationWizardActions.ts:350–353` does surface a warning toast when grants fail. The new atomic path does not.

**Impact:** A secretary assigns stewards/chairmen during wizard creation, the show is created successfully, the role grants silently fail, and the officials cannot access the show. The secretary has no indication anything went wrong.

**Fix:** Mirror the legacy path: after filtering `failures`, call `notifications.warning(...)` with the count of failed grants.

---

### HIGH-2: Offline show creation has no rollback on partial failure

**File:** `useShowCreationWizardActions.ts:229–366` (the legacy branch, lines 272–366)

The offline path (and the edit-mode path) still uses the multi-step sequential flow: create show → create trials → create classes → persist judge assignments. These are four separate async operations with no transaction guard. The `catch` block at line 402 shows an error toast but **does not roll back any rows that were already written**.

**Impact:** A network hiccup between trial creation and class creation (or a Supabase error mid-batch) leaves a show with trials but no classes, or a show with no trials at all. The user sees an error, retries, and may create duplicate shows or orphaned trials.

**Fix options:**
- Extend the `create_show_with_children` RPC to also handle offline-queued creates (wrap the IndexedDB path in an optimistic-rollback coordinator).
- Or: add a compensating cleanup step in the `catch` block that deletes the partially-created show when creation fails mid-flight.
- Or: document this as an accepted risk with a manual-cleanup path in support docs.

---

### HIGH-3: Client-supplied UUIDs + no idempotency guard on retry

**File:** `buildCreateShowPayload.ts:98–103` + `saveShowAtomicOnline.ts:57–65`

The client generates UUIDs for the show, trials, and classes via `crypto.randomUUID()` before calling the RPC. The RPC inserts those exact UUIDs into the DB. If the first RPC call succeeds server-side but times out before the response reaches the client, and the user retries (or the wizard auto-retries), the RPC will throw a primary key constraint violation. The client sees an error toast — but the show **was already created** on the first attempt.

**Impact:** Secretary clicks "Create Show," gets a spinner for several seconds, sees a failure toast, and believes the show was not created. The show is actually in the DB. Retrying creates a duplicate with fresh UUIDs.

**Fix options:**
- Add a pre-flight check: before calling the RPC, query whether a show with this name + date + club_id already exists and route to the existing one.
- Or: add idempotency at the RPC level — `INSERT ... ON CONFLICT (id) DO NOTHING` and return the existing ID.
- Or: re-generate UUIDs only on explicit user retry (not automatic), and show a "check if show was created" message on timeout.

---

## What Is NOT Recorded Here

This document preserves only the **three HIGH-severity findings** that survived context compaction in the original harden session. The harden review was conducted by three parallel agents; medium and low findings (covering validation gaps, UX edge cases, type-cast debt, and test coverage holes) were **not retained**.

**Do not assume these three items are the complete picture.** Before closing out harden work on this feature, run `/harden` again against the same file set to recover the medium/low list.

---

## Suggested Next Steps

1. Fix HIGH-1 (5 min): add `notifications.warning(...)` in `saveShowAtomicOnline.ts` after filtering failures.
2. Decide on HIGH-2 strategy (design choice, not just a code fix) — involves a tradeoff between rollback complexity and risk tolerance for offline edge cases.
3. Decide on HIGH-3 strategy (idempotency approach) — `ON CONFLICT DO NOTHING` in the RPC is the lowest-effort path.
4. Re-run `/harden` to recover medium/low findings before marking wizard harden complete.
