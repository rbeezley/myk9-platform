# Admin Support Runbook

> **Status:** Active
> **Audience:** Platform owner / site-admin. Last reviewed 2026-07-05.

General support now runs through the in-app ticket queue at `/admin/support`. The remaining sections cover the privileged support actions that still have **no dedicated in-app UI** for the fall launch and are explicitly accepted for fall rather than blocking launch on new UI.

Two operations live here: **user impersonation / "see as a user"** and **manual data repair**. Both are deliberately not exposed as one-click admin actions — they are rare, high-blast-radius, and safer behind a deliberate procedure.

---

## 0. Working the in-app support inbox

Use `/admin/support` for customer help before reaching for SQL, Supabase dashboards, or email.

1. Open `/admin/support`. The default queue is **Open**; use the status filters for Waiting, Resolved, or All.
2. Triage **Show-day priority** tickets first. These are raised from secretary show-day contexts and should interrupt normal backlog work.
3. Read the diagnostic panel before replying: route, show/trial/entry context, online state, replication status, queue size, conflict count, and captured client errors.
4. Reply in the ticket thread. Operator replies move the ticket to **Waiting** and notify the ticket owner by in-app link, push, and email where available.
5. When the customer replies, the ticket returns to **Open** and site admins are notified. Mark it **Resolved** only after the user confirms or the issue is clearly closed.
6. Payment/refund questions must stay human-reviewed. The support-mode AskQ path escalates those instead of auto-answering; use the Stripe and entry-management runbooks for the actual decision.

Do not create a parallel email reply-to workflow for myK9Show support tickets. Email notifications link back into the in-app ticket.

---

## 1. Diagnosing "user X can't access Y" (no impersonation needed)

Reach for this **first** — it resolves the large majority of access tickets without touching a session.

1. Open `/admin/permissions/users` and find the user.
2. Read their assigned roles and scopes. Most access bugs are a missing or mis-scoped role (e.g. a club-scoped `secretary` role attached to the wrong club — see [[project_rbac_role_grants_seed_gap]]).
3. Fix in-app: assign/adjust the role via the RBAC UI, or approve a pending request at `/admin/role-requests`.
4. Confirm the change in the audit tab on `/admin/permissions`.

If the user still reports a problem after their roles look correct, reproduce it with a **test account** (next section) rather than impersonating the real user.

## 2. Reproducing a user's view (controlled, for fall)

There is **no in-app impersonation** for fall. The audit-event scaffolding (`IMPERSONATE_START` / `IMPERSONATE_END`, permission `ADMIN_IMPERSONATE_USER`) exists for a future UI but is not wired — **do not assume a working impersonate button exists.**

Accepted fall procedure, in order of preference:

1. **Same-role test account (preferred).** Use or create an `e2e-*@test.myk9.com` staging account (the named `admin@`/`secretary@myk9t.com` accounts have **no auth row** — see [[project_staging_named_accounts_no_auth]]) and grant it the same roles/scopes as the affected user. Walk the broken flow. This reproduces what the user sees with zero impact on their account.
2. **Supabase Auth recovery link (only with user consent).** If you must enter the _actual_ user's account (e.g. data is account-specific and not reproducible), use the Supabase dashboard → Authentication → the user → "Send recovery / magic link," **with the user's explicit consent**, and have them screen-share instead if at all possible. Never silently assume a live session.
3. **Log it.** Whichever path, record who/why/when in your support log. When the impersonation UI ships post-launch, this manual path retires.

## 3. Manual data repair (SQL, accepted for fall)

Prefer in-app repair before any SQL:

- **Soft-deleted record** (show, trial, class, entry, dog, club, person) → restore at `/admin/deleted-items`. This goes through SECURITY DEFINER RPCs that handle the `deleted_at IS NULL` policy correctly (see [[project_restore_write_rls_rpcs]] / PR #790). Do **not** hand-write an `UPDATE ... SET deleted_at = NULL` — the SELECT policy makes it match zero rows.
- **Wrong role / access** → §1 above, in-app.

For field-level fixes with no in-app surface (e.g. correct a typo'd email, re-point an entry's `class_id`), use the Supabase **SQL editor** with these guardrails:

1. **SELECT before you mutate.** Run the `SELECT` with the exact `WHERE` first and confirm the row count is what you expect.
2. **Always scope by primary key.** `WHERE id = '...'` — never an unbounded `UPDATE`/`DELETE`.
3. **Wrap in a transaction** so you can `ROLLBACK`:
   ```sql
   BEGIN;
   UPDATE public.<table> SET <col> = <value> WHERE id = '<uuid>';
   -- re-SELECT to verify exactly one row changed as intended
   COMMIT;  -- or ROLLBACK;
   ```
4. **Mind RLS + triggers.** The SQL editor runs as a privileged role, so RLS won't protect you from a bad `WHERE`. Some tables have triggers (e.g. the owns-dogs delete guard, [[project_person_delete_owns_dogs_guard]]; placement recompute on scoring completion) — expect side effects and read the trigger before mutating status/enum columns.
5. **Never touch generated columns** (e.g. `final_placement` is computed by the scoring-completion trigger, not a manual field).
6. **Log the change** (table, id, before→after, why) in your support log.

## Escalation boundary

If a repair needs more than a single-row, transaction-wrapped fix — bulk updates, schema changes, anything you can't fully predict — **stop and write a migration** (`supabase/migrations/`) reviewed via the normal PR + `migration-auditor` path. Ad-hoc bulk SQL on the live DB is out of scope even for fall.

---

## In-app admin surfaces (no runbook needed)

For reference — these support actions have working UI and don't need this document:

| Need                      | Surface                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer support tickets  | `/admin/support`                                                                                                                                                  |
| See shows & users         | `/admin/dashboard`, `/admin/users`                                                                                                                                |
| Roles / access fixes      | `/admin/permissions/*`, `/admin/role-requests`                                                                                                                    |
| Payments / payouts        | `/admin/payouts` (+ Stripe dashboard for failed-charge detail, per [`stripe-platform-setup.md`](stripe-platform-setup.md))                                        |
| Sync / replication health | `/admin/support`                                                                                                                                                  |
| App health                | `/admin/health`, `/admin/support`                                                                                                                                |
| Deploy / migration health | [`ci-vercel-deploys.md`](ci-vercel-deploys.md), [`edge-function-deploy-drift-2026-06-23.md`](edge-function-deploy-drift-2026-06-23.md), `supabase migration list` |
| Soft-delete restore       | `/admin/deleted-items`                                                                                                                                            |
