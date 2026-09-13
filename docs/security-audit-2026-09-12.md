# Security Audit — 2026-09-12

- **Mode:** Full Audit (`security-audit --full`)
- **Detecting task:** `claude-security-audit` (scheduled, unattended)
- **Source:** claude
- **Baseline SHA:** `d4cb4941ca9677832c0bb4d605890454e4be3fc7` (`origin/main`, clean detached worktree)
- **Prior Claude report:** `docs/security-audit-2026-09-05.md` (baseline `e8a410f6e`)
- **Checklist:** `.claude/skills/security-audit/references/checklist.md` @ `04be60937`
- **Finding contract:** `quality-finding-lifecycle`
- **Verification target:** applied staging database, project ref `sojmvhhwsjxmfistvzbe`

**Method.** Applied-database evidence first, source second. Every ACL claim comes from
`pg_class.relacl`, `pg_attribute.attacl`, `pg_policy`, `pg_default_acl` and `pg_proc` against the
live database — never from migration text. Anon behaviour was replayed in a **cold, unauthenticated
session** (publishable key only, no bearer token, no cookie) against
`https://sojmvhhwsjxmfistvzbe.supabase.co/rest/v1`. The one deployment claim in this report is read
from the live function bundle via `get_edge_function`, and its _code line_ was extracted rather than
grepped — the fixed source carries the old expression inside a comment, so a substring count would
have reported the opposite of the truth. No writes of any kind were made to the shared database,
storage, Stripe, or Supabase Auth.

**Migration drift:** none. All 31 repo migrations dated `20260901`–`20260911` are present in
`supabase_migrations.schema_migrations`; the newest applied version is `20260911034500`, which is
also the newest in `origin/main`.

---

## Summary

| Source severity | Count |
| --------------- | ----: |
| CRITICAL        |     0 |
| HIGH            |     0 |
| MEDIUM          |     2 |
| LOW             |     3 |
| INFO            |     1 |
| **Total**       | **6** |

| Canonical launch severity | Count |
| ------------------------- | ----: |
| P0                        |     0 |
| P1                        |     0 |
| P2                        |     2 |
| P3                        |     4 |

### Transition set

| Lifecycle status | Count | Records                                                                     |
| ---------------- | ----: | --------------------------------------------------------------------------- |
| new              |     5 | SA-2026-09-12-01 … -05                                                      |
| unchanged        |     1 | SA-027 (6th consecutive run)                                                |
| resolved         |     6 | SA-2026-09-05-01, -03, -04, -06, -07, -08                                   |
| blocked          |     1 | SA-2026-07-29-11 (MYK9-125) — no new evidence this run                      |
| withdrawn (held) |     2 | SA-2026-09-05-02, -05 — withdrawn 2026-09-05; MYK9-403 confirmed `Canceled` |

**No P0 or P1 finding this run.** Every prior P0 is closed with replayed proof (below). The two P2s
are cross-tenant read-scope gaps that are latent-to-small today and get materially worse with real
users — they are pre-launch work, not incidents.

### At a glance

- **SA-2026-09-12-01 — MEDIUM / P2, new, CONFIRMED.** Four tables carry a PUBLIC
  `SELECT … USING (true)` policy with no show-status and no soft-delete predicate. Replayed cold:
  anon gets `[]` for a draft show from `shows`, `trials` and `classes`, but reads that same show's
  **judge-assignment graph** — show id, trial ids, class ids, judge person ids, assignment status —
  straight out of `judge_assignments`. 4 of 18 live rows are in a non-public show right now.
- **SA-2026-09-12-02 — MEDIUM / P2, new, latent.** A family of RLS policies gates on the
  **argument-less** `is_trial_secretary()` / `is_club_admin()`, i.e. "any secretary of any club" and
  "any admin of any club", with no scope to the row's own show or club. The live one is
  `vaccinations_select`: any trial secretary on the platform can read every dog's vaccination
  records. Zero rows today, so nothing has leaked; `vaccinations` is a shipped feature with six
  non-test source files, so it will hold real data before launch.
- **SA-2026-09-05-01 (MYK9-398) — P0, resolved.** The show-branding storage policies now correlate
  against the **object path** (`storage.foldername(objects.name)[2]::uuid` behind a UUID regex),
  not `shows.name`. The self-arming rename path is gone.
- **SA-2026-09-05-03 (MYK9-400) — P0 availability, resolved.** `ringside_containment.state` is
  `armed`, `tripped_at` is null, and `last_sample_at` is minutes old. Auto-rearm works.

---

## Findings

### [MEDIUM] SA-2026-09-12-01: Four tables expose unpublished-show rows to cold anon through a `USING (true)` PUBLIC SELECT policy

- **Category:** RLS Policy Integrity (row scope / soft-delete) · **Canonical:** P2 ·
  **Source severity:** MEDIUM · **Status:** new · **Confidence:** high
- **Affected role:** anonymous (unauthenticated) · **Workflow:** public show browsing
- **Location:** `pg_policy` on `public.judge_assignments`, `public.armbands`,
  `public.achievements`, `public.show_templates`

**Evidence** — policy text read from `pg_policy` on the applied database. All four are identical in
shape:

```
relname          | polname                 | polcmd | roles  | using_expr
judge_assignments| judge_assignments_select| r      | PUBLIC | true
armbands         | armbands_select         | r      | PUBLIC | true
achievements     | achievements_select     | r      | PUBLIC | true
show_templates   | show_templates_select   | r      | PUBLIC | true
```

`roles = PUBLIC` means the policy applies to `anon`, and each table carries matching column-level
`anon=r` grants (`pg_attribute.attacl`). Every _other_ anon-reachable table in this schema gates on
the show's publication state — `entries_anon_select_for_tv` is
`(deleted_at IS NULL) AND (show_id IN (SELECT s.id FROM shows s WHERE s.status = ANY
(ARRAY['published','upcoming','in_progress','completed']) AND s.deleted_at IS NULL))`, and
`classes_select` and the `trials` policy do the same. These four do not.

**Exploit path, replayed cold** (publishable key only, no bearer token). Against a show whose
`status = 'draft'`:

```
GET /rest/v1/shows?id=eq.<draft-show-id>&select=id,name,status          -> 200 []
GET /rest/v1/trials?show_id=eq.<draft-show-id>&select=id,name           -> 200 []
GET /rest/v1/classes?trial_id=eq.<draft-trial-id>&select=id,name        -> 200 []
GET /rest/v1/judge_assignments?show_id=eq.<draft-show-id>&select=id,person_id,show_id,trial_id,class_id,status,invited_at
                                                                        -> 200 [ 4 rows ]
```

RLS correctly hides the show, its trials and its classes; `judge_assignments` hands back the same
show's id, its trial id, four class ids, the assigned judges' `person_id`s and each assignment's
status. Row counts from the applied database:

| Table               | Rows | Rows in a non-public or soft-deleted show | Exposure today |
| ------------------- | ---: | ----------------------------------------: | -------------- |
| `judge_assignments` |   18 |                                         4 | **live**       |
| `armbands`          |  260 |                                         0 | latent         |
| `achievements`      |    0 |                                         0 | latent         |
| `show_templates`    |    0 |                                         0 | latent         |

**Risk.** Pre-announcement disclosure of who is judging what, and of a show's trial/class structure,
before the club has published it — the competitive-information leak a draft state exists to prevent.
No human PII leaves the boundary: `fee` and `notes` were revoked by MYK9-146 (re-verified: cold anon
`select=id,fee,notes` → 401), and the embed `judge_assignments?select=id,person:people(...)` returns
`"person": null` because `people` has no anon-visible policy. `armbands` becomes the same leak for
armband→dog mapping the moment a secretary assigns armbands before publishing, which is the normal
order of operations. Not P1: nothing here lets an attacker act, only observe, and the observable set
is UUIDs plus assignment status.

**Fix.** Give each of the four the predicate its siblings already use — restrict to shows in
`('published','upcoming','in_progress','completed')` with `deleted_at IS NULL`, plus the usual
manager arms. `achievements` and `show_templates` need a scope decision rather than a copy
(`show_templates` has no `show_id`), so the mechanical part is `judge_assignments` and `armbands`.

**Auto-fixable:** Partly — yes for `judge_assignments` and `armbands` (known-good predicate), no for
`achievements` and `show_templates` (needs a scoping decision).

**Closure proof required:** cold-anon `GET /rest/v1/judge_assignments?show_id=eq.<draft-show-id>`
returns `[]` while the same query against a published show still returns rows.

---

### [MEDIUM] SA-2026-09-12-02: Argument-less `is_trial_secretary()` / `is_club_admin()` in RLS gives every secretary and club admin platform-wide reach on six tables

- **Category:** RBAC & Privilege Escalation (scoped permission fallthrough) · **Canonical:** P2 ·
  **Source severity:** MEDIUM · **Status:** new · **Confidence:** high
- **Affected roles:** `secretary` / `trial_secretary`, `club_admin` (any club) ·
  **Workflow:** dog health records, offline scoring, nationals, volunteers
- **Location:** `pg_policy` on `public.vaccinations`, `public.offline_scoring`,
  `public.nationals_scores`, `public.nationals_rankings`, `public.nationals_advancement`,
  `public.volunteer_roles`, `public.result_submissions`

**Evidence.** Both helpers treat a NULL/absent argument as a wildcard — this is the documented
"round-8" trap, and the function bodies confirm it verbatim:

```sql
-- is_club_admin(check_club_id uuid DEFAULT NULL)
AND (check_club_id IS NULL OR ur.club_id = check_club_id)
-- is_trial_secretary(check_club_id uuid DEFAULT NULL)
AND (check_club_id IS NULL OR ur.club_id = check_club_id)
```

Called with no argument they mean "holds this role in **any** club". The refund edge functions get
this right and say so in a comment — `stripe-refund-entry/index.ts` refuses the club-admin arm
outright when `show.club_id` is null, citing the same round-8 finding. These policies pass no
argument at all:

| Table                   | Policy                                   | Cmd   | Predicate                                                        |
| ----------------------- | ---------------------------------------- | ----- | ---------------------------------------------------------------- |
| `vaccinations`          | `vaccinations_select`                    | `r`   | owner/co-owner `OR is_platform_admin() OR is_trial_secretary()`  |
| `offline_scoring`       | `offline_scoring_{insert,update,delete}` | a/w/d | `is_club_admin() OR is_trial_secretary() OR is_platform_admin()` |
| `nationals_scores`      | `nationals_scores_manage`                | ALL   | `is_club_admin() OR is_trial_secretary() OR is_platform_admin()` |
| `nationals_rankings`    | `nationals_rankings_manage`              | ALL   | same                                                             |
| `nationals_advancement` | `nationals_advancement_manage`           | ALL   | same                                                             |
| `volunteer_roles`       | `volunteer_roles_manage_*`               | a/w/d | same                                                             |
| `result_submissions`    | `secretary_admin_{select,insert}_*`      | r/a   | `is_trial_secretary() OR is_site_admin()`                        |

**Risk.** `vaccinations` is the one that matters: a secretary's legitimate need is the vaccination
record of a dog **entered in a show they run**, and the policy instead grants every secretary on the
platform read access to every dog's health record. `offline_scoring` and the three `nationals_*`
tables are score data under an unscoped `ALL` — cross-club score corruption if they ever carry rows.

**Why P2 and not P0.** Every one of these tables is empty on the applied database
(`vaccinations` 0, `offline_scoring` 0, `nationals_*` 0, `volunteer_roles` 0,
`result_submissions` 0), and `nationals_*` have **zero** non-test source references — they are
dormant schema. Nothing can be read or corrupted today. `vaccinations` is the exception that keeps
this above P3: it is referenced by six non-test source files, so it is a shipped surface awaiting
data, and the exposure becomes real on the first real user.

**Not a duplicate of the withdrawn MYK9-403.** That finding concerned
`replace_judge_qualifications`, whose platform-wide secretary reach is an **owner decision** dated
2026-09-03 (MYK9-354), recorded in `docs/roles/judge.md` and pinned by
`judge_qualification_rpc_authorization_test.sql`. Following the rule that produced that correction,
these seven policies were checked the same way before being written up: `supabase/tests/` contains
no test naming any of them, and their originating migrations
(`20260728130000_consolidate_identity_registration_rls.sql:163`,
`20260728131000_split_showday_manage_read_rls.sql`) carry no `RATIONALE` and no reference to an
approved boundary. The `vaccinations` comment describes the shape ("exact OR of owner/co-owner/admin
and trial-secretary visibility") without justifying the unscoped arm.

**Fix.** Scope each predicate to the row's own club or show. For `vaccinations`, the natural
boundary is "a dog entered in a show I manage" — an `EXISTS` over `entries`/`shows` with
`can_manage_show`, not a bare role check. If any of these is in fact an approved boundary, the
remedy is a `RATIONALE` comment and a behavioural test, not a code change.

**Auto-fixable:** No — each needs a scoping decision about what the role should actually reach.

**Closure proof required:** a rolled-back `SET LOCAL role` transaction in which a secretary of club
A selects a `vaccinations` row for a dog owned by an unrelated person with no entry in that
secretary's shows, and gets zero rows.

---

### [LOW] SA-2026-09-12-03: `send-push-notification` compares the caller's token to the service-role key with `!==`

- **Category:** Edge Function Auth · **Canonical:** P3 · **Source severity:** LOW ·
  **Status:** new · **Confidence:** high
- **Location:** `supabase/functions/send-push-notification/index.ts:41`

**Evidence.**

```ts
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
if (token !== supabaseServiceKey) {
  // ... fall through to JWT validation + self-send check
}
```

This is the same class MYK9-404 / SA-2026-09-05-08 closed, at a site that fix did not reach — and
the one it did reach is the lower-value of the two, since this comparison's right-hand side is the
**service-role key** rather than a single-purpose function secret. The repo has a shared
`timingSafeEqual` in `_shared/timingSafeEqual.ts`, used by `requireFunctionSecret`,
`requirePushWebhookSecret`, `assertWaitlistInviteSecret` and (since MYK9-404)
`requireConfirmationEmailSecret`. A repo-wide sweep for non-constant-time secret comparisons found
this as the only remaining instance.

**Risk.** Not practically exploitable: recovering a high-entropy key byte-by-byte through
first-difference timing across an edge runtime, a TLS terminator and the public internet is not a
realistic attack. The reason to fix it is the same one MYK9-404 gave — the next gate someone copies
should be the right shape — with the added point that the fail-open direction here is a
service-role-equivalent trust decision.

**Fix.** `if (!timingSafeEqual(token, supabaseServiceKey))`.

**Auto-fixable:** Yes.

---

### [LOW] SA-2026-09-12-04: Three owner-run entry-results views carry `authenticated=arwd`

- **Category:** RLS Policy Integrity (defense in depth) · **Canonical:** P3 ·
  **Source severity:** LOW · **Status:** new · **Confidence:** high
- **Location:** `public.view_public_entry_results`, `public.view_authenticated_entry_results`,
  `public.view_authenticated_entry_results_replication`

**Evidence** — `pg_class.reloptions` and `relacl` on the applied database:

```
view_public_entry_results                    | {security_invoker=false} | authenticated=arwd/postgres, anon=r/postgres
view_authenticated_entry_results             | {security_invoker=false} | authenticated=r/postgres
view_authenticated_entry_results_replication | {security_invoker=false} | authenticated=r/postgres
```

`view_public_entry_results` — the one view `anon` can read — additionally carries INSERT, UPDATE and
DELETE for `authenticated`. All three are `security_invoker=false`, so the view body executes as
`postgres` and base-table RLS does not apply inside it; that is the deliberate, documented design
for the nulling public-results view (`20260909203500_document_replication_view_definer_acceptance`).

**Risk today: none.** Verified, not assumed — `pg_relation_is_updatable(oid, true)` returns `0` for
all three, because each joins `entries` to `classes`/`shows`/`dogs` and a multi-table view is not
auto-updatable. The write grants cannot be exercised.

**Why it is still worth recording.** The grant and the owner-run property are each safe alone and
unsafe together. If any of these views is ever simplified to a single base table — or given an
`INSTEAD OF` trigger — an authenticated user gains write access to `entries` that executes as the
table owner with RLS skipped. Nothing in the schema couples the two properties, and the same
`CREATE OR REPLACE` that drops a join preserves the ACL.

**Fix.** `REVOKE INSERT, UPDATE, DELETE ON public.view_public_entry_results FROM authenticated;`
(and the same on the other two, which already read-only in practice). These views are read surfaces;
no caller writes through them.

**Auto-fixable:** Yes.

---

### [LOW] SA-2026-09-12-05: `people.email` carries an `anon` column grant with no anon-visible policy behind it

- **Category:** Data Exposure (defense in depth) · **Canonical:** P3 · **Source severity:** LOW ·
  **Status:** new · **Confidence:** high
- **Location:** `pg_attribute.attacl` on `public.people` — columns `id`, `first_name`, `last_name`,
  `email`

**Evidence.** Those four columns carry `anon=r/postgres`. `public.people` has **no** table-level
`anon` grant and, per `pg_policy`, no policy whose `polroles` includes `anon` or `PUBLIC` — every
`people` policy is `TO authenticated`.

**Verified inert, both ways in.** Cold anon, no bearer token:

```
GET /rest/v1/people?select=id,first_name,last_name,email&limit=3                 -> 200 []
GET /rest/v1/judge_assignments?select=id,person:people(first_name,last_name,email) -> 200 [{"id":"…","person":null}, …]
```

Direct read returns zero rows; the embed from the one anon-readable table that references `people`
returns `null` rather than leaking through. RLS is doing the work; the grant is doing nothing.

**Risk.** A dormant grant is a trap for the next change rather than a current exposure. Column
grants are invisible in `pg_class.relacl` and absent from `information_schema.role_table_grants` over
this connection, so the day someone adds an anon-visible `people` policy — for a public officials
directory, a premium-list contact block — the email column comes along silently and nothing in
review shows it. Equally, the LESSON that put these grants here (`postgrest-embed-grants`: an
embedded relation needs a grant for the embedding role) is about _table-level_ SELECT; column grants
were not the fix it called for.

**Fix.** `REVOKE SELECT (email) ON public.people FROM anon;` and re-verify with the cold-anon embed
probe above. Keep `id`/`first_name`/`last_name` only if a current anon embed needs them — none was
found in this pass, so the whole set is a candidate.

**Auto-fixable:** Yes.

---

### [INFO] SA-027: SECURITY DEFINER functions using `search_path=public`

- **Canonical:** P3 · **Status:** unchanged (6th consecutive run) · **Linear:** MYK9-151 (Backlog)
- **Accepted-risk record:** `docs/security/sa-027-search-path-accepted-risk.md`

Count moved 19 → **20**: `resolve_class_result_visibility` (added by MYK9-126, migration
`20260910224500`) declares `SET search_path TO 'public'`. Of 203 `SECURITY DEFINER` functions in
`public`, 183 use `search_path=''` and 20 use `search_path=public`; **none** lacks an explicit
`search_path`.

Re-verified non-exploitable — the precondition holds unchanged:

```
has_schema_privilege('anon','public','CREATE')          -> false
has_schema_privilege('authenticated','public','CREATE') -> false
nspacl: pg_database_owner=UC/pg_database_owner | =U/… | anon=U/… | authenticated=U/… | service_role=U/…
```

No client-facing role can create an object in `public` to shadow a name these functions resolve.
Worth noting for the next `CREATE OR REPLACE` in this area: the two helpers the new visibility view
calls, `_result_timing_visible` and `_result_visibility_preset`, both use `search_path=''`, so the
inconsistency is inside one feature's own function set.

---

## Verification of prior findings

A merge is not resolution. Each row below states the replay that was run this session.

| Prior finding                 | Linear             | Status       | Proof executed this run                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA-2026-09-05-01 (P0)         | MYK9-398 (Done)    | **resolved** | All three `storage.objects` show-branding policies now read `(storage.foldername(name))[2] ~* '^[0-9a-f]{8}-…$' AND (can_manage_show(((storage.foldername(objects.name))[2])::uuid) OR is_platform_admin())`. Authorization is correlated with the object path; `shows.name` appears nowhere in the expression. The rename-to-self-arm path no longer exists.             |
| SA-2026-09-05-03 (P0, avail.) | MYK9-400 (Done)    | **resolved** | `SELECT * FROM ringside_containment` → `state='armed'`, `tripped_at=NULL`, `trip_reason=NULL`, `last_sample_at` within minutes of this run, `rearm_after_calm_samples=5`. The breaker samples and re-arms.                                                                                                                                                                |
| SA-2026-09-05-04 (P2)         | (in #2045)         | **resolved** | `get_show_officials` now returns `pe.email` for a steward only when `can_manage_show(s.id)`, else `NULL`. Secretary/chairman email remains public by documented intent ("the paperwork contacts the premium list publishes"). Cold-anon RPC against a published show returned `[]` (no `show_officials` rows seeded), so the steward branch is proved from the body only. |
| SA-2026-09-05-06 (P3)         | (in #2045)         | **resolved** | `ringside_containment` and `ringside_containment_audit` both show `relrowsecurity=true`, `relforcerowsecurity=true`, `npol=0`, and no `anon` entry in `relacl`. Cold anon → `401`. Deny-by-default, as intended.                                                                                                                                                          |
| SA-2026-09-05-07 (P3)         | (in #2045)         | **resolved** | `pg_get_viewdef('view_public_entry_results')` `WHERE` clause now reads `e.deleted_at IS NULL AND c.deleted_at IS NULL AND (t.id IS NULL OR t.deleted_at IS NULL) AND sh.deleted_at IS NULL AND sh.status = ANY (…)`. Class soft-delete present, plus trial and show.                                                                                                      |
| SA-2026-09-05-08 (P3)         | MYK9-404           | **resolved** | Deployed bundle **v48** of `send-confirmation-email`: the extracted body of `requireConfirmationEmailSecret` is `if (!provided \|\| !timingSafeEqual(provided, functionSecret))`. The string `provided !== functionSecret` is present in the bundle **only inside the explanatory comment** — the code line was read, not counted.                                        |
| SA-2026-09-05-02, -05         | MYK9-399, MYK9-403 | withdrawn    | Both were withdrawn on 2026-09-05 before any change shipped. Re-checked: MYK9-403 is `Canceled` in Linear. No attempt was made to re-derive them.                                                                                                                                                                                                                         |
| SA-2026-07-29-11 (P2)         | MYK9-125 (Todo)    | **blocked**  | Unchanged. The authorization half remains closed; the stated remaining proof (an authorized paid smoke, plus an account-wide generation budget decision) needs a live paid run and a product decision, neither available to an unattended read-only audit.                                                                                                                |

---

## Categories checked

| Category                    | What was examined                                                                                                                                                                                               | Findings |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: |
| RLS Policy Integrity        | All 203 `public` tables (`relrowsecurity`/`relforcerowsecurity`/policy count/`relacl`); all 15 `storage.objects` policies; 3 storage buckets; 12 views                                                          |        2 |
| Edge Function Auth          | 45 functions (33 root + 12 app), shared `handler.ts` envelope, `functionSecret.ts`, `pushWebhookAuth.ts`, `timingSafeEqual.ts`; 1 live bundle read                                                              |        1 |
| RBAC & Privilege Escalation | `can_manage_show`, `is_show_official`, `is_show_office_manager`, `is_show_secretary`, `is_site_admin`, `is_platform_admin`, `is_club_admin`, `is_trial_secretary`; every policy calling an argument-less helper |        1 |
| Client Auth Patterns        | `adminRoutes.tsx` (22 routes vs `adminGuard`), `ProtectedRoute` via `AuthContext`                                                                                                                               |        0 |
| Data Exposure               | Column ACLs for `anon` across all of `public`; cold-anon probes of 21 endpoints and 3 RPCs; PostgREST embed behaviour                                                                                           |        1 |
| Payment Security            | `stripe-webhook` signature path, `stripe-checkout` price derivation, `stripe-refund-entry`, `stripe-refund-show`, `stripe-customer-portal`, `stripe-upgrade-subscription`                                       |        0 |
| Input Validation            | `dangerouslySetInnerHTML` sites, hardcoded-secret sweep, `VITE_*` secret-name sweep                                                                                                                             |        0 |

### What came back clean, and how

- **Anon table surface.** 18 tables carry an `anon` grant — 17 read, 1 write (`platform_waitlist`,
  INSERT only; a cold-anon `SELECT` returns `42501 permission denied`, correct). All 203 `public`
  tables have RLS **enabled and forced**; the 8 with zero policies (`login_attempts`,
  `premium_generation_attempts`, `ringside_containment`, `ringside_containment_audit`,
  `show_money_locks`, `show_passcodes`, `stripe_order_refunds`, `waitlist_notification_events`)
  deny everything to `anon` and `authenticated`, which is the intended shape, not the
  `rls_enabled_no_policy` defect the Supabase linter reports it as.
- **Column ACLs.** Cold anon `select=id,fee,notes` on `judge_assignments` → `401`;
  `entries?select=id,total_score,result_status` → `401`; `platform_settings?select=*` → `401` while
  `select=platform_fee_percent` → `200`. Protected columns are protected at the column level, and
  the protection is real rather than mirrored from the migration text.
- **Sequences.** All four `relkind='S'` objects in `public` checked (the audit class the
  `sequence-privileges` LESSON exists for): `frontend_logs_id_seq`, `ringside_conflict_seq` and
  `ringside_containment_audit_id_seq` grant nothing beyond `postgres`/`service_role`;
  `registration_confirmation_seq` adds `authenticated=rU`, which is exactly what its BEFORE INSERT
  trigger needs. No `anon`.
- **`ALTER DEFAULT PRIVILEGES` anon trap (MYK9-93).** `pg_default_acl` still shows the
  `supabase_admin`-granted default handing `anon` full `arwdDxtm` on new tables — but the
  **`postgres`**-granted default, which is the one that applies to migration-created objects, grants
  only `postgres` and `service_role`. Empirically consistent: every table created since that
  narrowing (`ringside_containment`, `show_money_locks`, `stripe_order_refunds`,
  `waitlist_notification_events`, `premium_generation_attempts`) has **no** `anon` entry in
  `relacl`. No table was created in the 7-day window, so nothing new was at risk this run.
- **Result-release gate (MYK9-126, the newest security-relevant change).** The set-based
  `private.class_result_visibility` was compared clause-by-clause against the row-wise
  `resolve_class_result_visibility` RPC it replaced; the trial-then-class preset/override precedence
  is equivalent, and both **fail closed** on an unknown preset (`_result_visibility_preset` returns
  `NULL` → `_result_timing_visible(NULL, …)` → `false`). The outer view's `LEFT JOIN` +
  `COALESCE(…, false)` means a class missing from the visibility set hides every field rather than
  revealing it. The `private` schema's ACL is `postgres=UC/postgres` only — no `USAGE` for `anon` or
  `authenticated`, so it is not PostgREST-reachable.
- **Stripe.** Signature verification reads the **raw body** before parsing and fails closed with 400
  (`stripe-webhook/webhookHandler.ts`); platform and Connect secrets are tried in order and a
  failure of both is still a 400 with no trusted event id. Entry amounts are recomputed server-side
  via `authoritativeEntryFeeCents` and client `entry_fee_cents` is overwritten on mismatch —
  `// NEVER trust entry_cart_items.entry_fee_cents`. Subscription `price_id` is allowlisted against
  `VALID_PRICE_IDS` (SA-024, still closed). Both refund functions re-derive `club_id` **from the
  fetched show row**, never from the request body, and evaluate `is_show_secretary` /
  `is_club_admin` / `is_site_admin` through a **caller-scoped** client rather than trusting JWT
  claims; `stripe-refund-entry` explicitly refuses the club-admin arm when `show.club_id` is null.
- **Edge-function envelope.** Every `handle()` function validates the bearer through
  `supabase.auth.getUser(token)` against the service-role client — no JWT-claim trust anywhere. All
  ten `auth: 'none'` functions are gated by `beforeBody` with `requireFunctionSecret` /
  `requirePushWebhookSecret`, which **fail closed on an unset secret** (503, not a bypass) and use
  the shared constant-time compare. `sentry-dashboard-metrics` resolves the caller's person row and
  requires `site_admin` through `applyActiveRoleValidity` (so `is_active` and `expires_at` are
  honoured); `sms-opt-in` and `revoke-self-auth-identity` are self-scoped to the JWT's own user.
- **Definer RPCs reachable by anon.** The 14 the linter flags were probed cold: `is_site_admin()` →
  `false`, `get_my_person_id()` → `null`, `get_show_officials(<published show>)` → `[]`. All fail
  closed for an unauthenticated caller.
- **Client.** Both `dangerouslySetInnerHTML` sites pass through `sanitizeHTML`, which is
  DOMPurify-backed. No hardcoded Stripe/service-role/JWT literal in `apps/myk9show/src` or
  `packages`. No `VITE_*` name carries a Stripe secret — the one `VITE_SECRET` grep hit is a comment
  reading "The browser must never hold `WAITLIST_INVITE_SECRET`".

### Coverage gaps and non-findings (report-only — deliberately not filed)

These are recorded so the next run does not re-derive them. None is a defect.

1. **`clubs` publishes `email` and `phone` to cold anon** (`clubs_select` is `USING (true)`, 5 rows
   returned unauthenticated). A club's contact details are the public directory's purpose and the
   subject is an organisation, not a private individual — but unlike the deliberate
   `get_show_officials` exposure, there is no `RATIONALE` comment saying so. Worth one comment; not
   worth an issue.
2. **Two `/admin` routes are not wrapped in `adminGuard`** — `/admin` and
   `/admin/permissions/users`. Both are bare `<Navigate replace>` redirects to guarded destinations
   and render no data. Cosmetic inconsistency only (`/admin/permissions/audit`, the adjacent
   redirect, _is_ wrapped). This is the third run in which the "unguarded admin routes" shape has
   been raised and correctly rejected.
3. **`premium-published` storage policies cast `split_part(objects.name,'.',1)::uuid` with no UUID
   regex guard**, unlike their show-branding siblings. A non-UUID object name raises `22P02` and the
   statement fails — closed, not open. Style divergence, not a hole.
4. **`is_show_secretary(check_show_id)` requires `ur.show_id IS NULL`**, so a show-scoped secretary
   row does not satisfy it. This fails _closed_ (a denial, not a bypass) and is a functionality
   question for MYK9-465's scoped-manage-gate work, not a security finding.
5. **Not proved this run:** whether the `supabase_admin` default-privilege row would fire for a
   table created outside the migration path (dashboard SQL editor). Proving it needs a `CREATE
TABLE`, which this audit is read-only. The `postgres` grantor default and the observed `relacl`
   of every recently created table both say the exposure is not live.
6. **Not proved this run:** the steward branch of `get_show_officials`, because `show_officials` has
   no rows for any published show on staging. The function body is unambiguous; a behavioural replay
   would need seeded data.

---

## Linear disposition

There are **no P0 or P1 findings**, so no standalone issue was opened. All five new findings are
P2/P3 and were filed as sub-issues of one parent, per the scheduled-task contract:

- Parent: **MYK9-468** — "Security audit 2026-09-12 — P2/P3 findings"
- Sub-issues: **MYK9-469** (SA-…-01), **MYK9-470** (SA-…-02), **MYK9-471** (SA-…-03),
  **MYK9-472** (SA-…-04), **MYK9-473** (SA-…-05)

**Deduplication** was run with `includeArchived: true` on every query, matching on table/route/
symptom rather than title. `judge_assignments` returned 25 issues, none covering row scope —
MYK9-146 is the `fee`/`notes` **column** exposure and is Done. The unscoped-helper family returned
MYK9-258 and MYK9-329 (both the NULL-`club_id` variant, both Done) and MYK9-403 (`Canceled`,
withdrawn); none covers `vaccinations`, `offline_scoring`, `nationals_*` or `volunteer_roles`.

**Label deviation, stated rather than silently resolved.** The task specifies `source:claude` and
`audit:security` labels. Neither exists in this workspace — the full team label set is
`vacation-blocked`, `needs-richard`, `auto:yellow`, `auto:green`, `Claude`, `Codex`, `Parked`,
`Human Tester`, `Wait for Launch`, `Test`, `Bug`, `Feature`, `Improvement`. Creating labels is a
shared-system mutation this task did not authorize, so the existing convention was used instead:
`Claude` carries the source (as on every prior Claude security issue — MYK9-398, MYK9-354, MYK9-403)
and `Bug` the class, with the audit identified in the parent issue's title. No `p0`/`p1` label was
needed, since no finding reached that severity.

---

## Ledger

`ID | P# | source severity | status | first/last seen | runs | owner | evidence | next proof`

```
SA-2026-09-12-01 | P2 | MEDIUM | new       | 2026-09-12/2026-09-12 | 1 | MYK9-469 | judge_assignments/armbands/achievements/show_templates carry PUBLIC SELECT USING(true); cold anon read 4 judge_assignments rows for a draft show whose shows/trials/classes rows all returned [] | cold-anon GET judge_assignments?show_id=eq.<draft> returns [] while a published show still returns rows
SA-2026-09-12-02 | P2 | MEDIUM | new       | 2026-09-12/2026-09-12 | 1 | MYK9-470 | vaccinations_select + 6 more gate on argument-less is_trial_secretary()/is_club_admin() = "any club"; all 7 tables empty today, vaccinations has 6 non-test source refs | rolled-back SET LOCAL role txn: secretary of club A gets 0 rows for an unrelated dog's vaccinations
SA-2026-09-12-03 | P3 | LOW    | new       | 2026-09-12/2026-09-12 | 1 | MYK9-471 | send-push-notification/index.ts:41 `token !== supabaseServiceKey`; sole remaining non-constant-time secret compare after MYK9-404 | source line reads !timingSafeEqual(...) and the deployed bundle's extracted function body agrees
SA-2026-09-12-04 | P3 | LOW    | new       | 2026-09-12/2026-09-12 | 1 | MYK9-472 | 3 views with reloptions security_invoker=false; view_public_entry_results relacl authenticated=arwd + anon=r; pg_relation_is_updatable=0 so inert today | relacl shows authenticated=r only on all three
SA-2026-09-12-05 | P3 | LOW    | new       | 2026-09-12/2026-09-12 | 1 | MYK9-473 | pg_attribute.attacl anon=r on people.{id,first_name,last_name,email} with no anon/PUBLIC policy on people; cold anon direct read [] and embed person:null | REVOKE applied; same two cold-anon probes still return [] and null
SA-027           | P3 | INFO   | unchanged | 2026-07-03/2026-09-12 | 6 | MYK9-151 | 20 of 203 SECURITY DEFINER fns use search_path=public (was 19; +resolve_class_result_visibility); 0 lack an explicit search_path; anon/authenticated CREATE on public = false | unchanged — accepted risk, revisit only if a client role gains CREATE on public
SA-2026-07-29-11 | P2 | HIGH   | blocked   | 2026-07-29/2026-09-12 | 6 | MYK9-125 | authz half closed and unchanged; the stated proof needs a live authorized paid generation and a budget decision | an authorized paid smoke plus an account-wide generation budget decision
```
