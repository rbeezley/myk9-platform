# Security Audit — 2026-07-29

**Mode:** Full Audit
**Source:** `claude` (scheduled task `claude-security-audit`)
**Baseline SHA:** `39ed30dc803a016563768945c5fc672ea4311af2` (`main`, clean working tree)
**Checklist version:** `.claude/skills/security-audit/references/checklist.md` @ `84e656142`
**Applied database verified:** project ref `sojmvhhwsjxmfistvzbe` (staging)
**Finding handling:** `quality-finding-lifecycle`
**Previous Claude full audit:** [`docs/security-audit-2026-07-11.md`](security-audit-2026-07-11.md)

---

## Summary

| Severity (source) | Count  |
| ----------------- | ------ |
| CRITICAL          | 0      |
| HIGH              | 2      |
| MEDIUM            | 5      |
| LOW               | 3      |
| **Total**         | **10** |

| Canonical launch severity | Count |
| ------------------------- | ----- |
| P0                        | 1     |
| P1                        | 1     |
| P2                        | 5     |
| P3                        | 3     |

| Lifecycle status | Count                                                |
| ---------------- | ---------------------------------------------------- |
| new              | 9                                                    |
| unchanged        | 1 (recurrence of SA-027)                             |
| resolved         | 7 (entire 2026-07-11 baseline)                       |
| duplicate        | 0                                                    |
| rejected         | 1 (self-rejected during verification — see Rejected) |
| blocked          | 1 coverage gap (see Coverage Gaps)                   |

| Classification                     | Count |
| ---------------------------------- | ----- |
| security exposure                  | 5     |
| RBAC / privilege scope             | 2     |
| defense-in-depth (latent)          | 2     |
| product defect (security-adjacent) | 1     |

Auto-fixable: **4 of 10** (SA-…-03, -04, -07, -08). The rest need a design decision.

**Headline:** one confirmed, replayed unauthenticated exploit — an anonymous client can read the
**secret scent-work hide count and blank-area flag** for classes explicitly marked
`hides_known = false`, before those classes run. Everything else is latent or scope-tightening.

**Posture is otherwise strong.** All 119 public tables have RLS **enabled and forced**; every
sensitive table returns `42501` to a cold anon session; all 35 edge functions have a real
authorization gate; no wildcard CORS; no hardcoded secrets; Stripe webhook signatures, price
allowlist, and refund authorization are correct.

---

## Findings

### [HIGH] SA-2026-07-29-01: Anon reads the secret scent-work hide count and blank-area flag for unrun classes

- **Canonical severity:** **P0** — score/result integrity (scorecard: "score/result corruption")
- **Source severity:** HIGH · **Status:** new · **Confidence:** high (exploit replayed)
- **Category:** 1 RLS Policy Integrity / 5 Data Exposure
- **Affected roles:** anon (unauthenticated) **and** every authenticated account
- **Route/object:** `public.classes` columns `num_hides`, `has_blank`, `hides_known`
- **First seen:** 2026-07-29 · **Runs:** 1

**Evidence — cold anon session, anon key only, no auth:**

```
GET /rest/v1/classes?select=id,name,level,element,hides_known,num_hides,has_blank,status
    &hides_known=is.false
→ 200
[ { "name": "Exterior Excellent", "level": "Excellent", "hides_known": false,
    "num_hides": 2, "has_blank": false, "status": "upcoming" },
  { "name": "Buried Master",      "level": "Master",    "hides_known": false,
    "num_hides": 3, "has_blank": true,  "status": "upcoming" } ]
```

Applied-database cause — two orthogonal grants both permit it:

```sql
-- table-level: anon holds SELECT on every column of classes
pg_class.relacl → anon=r/postgres
-- RLS: PUBLIC-role policy, no column restriction, any non-draft show
classes_select  FOR SELECT TO PUBLIC USING (
  deleted_at IS NULL AND trial_id IN (
    SELECT t.id FROM trials t JOIN shows s ON s.id = t.show_id
    WHERE s.status = ANY (ARRAY['published','upcoming','in_progress','completed'])
      AND s.deleted_at IS NULL OR is_club_admin(...) OR ... ))
```

Data confirms the "secret" case is real and populated:

```sql
select hides_known, count(*), count(num_hides), count(*) filter (where has_blank)
from public.classes where deleted_at is null group by hides_known;
--  false | 2 | 2 | 1      ← flagged unknown, yet the count is stored and readable
--  true  | 7 | 7 | 0
```

**Risk:** `hides_known = false` is the schema's own encoding of "the number of hides is not
disclosed to competitors" — the AKC Scent Work Excellent/Master convention, where a blank area is
also possible at Master. Any competitor (or anyone with the public anon key, which ships in the
browser bundle) can read the exact hide count and whether the area is blank **before running**.
That is a decisive competitive advantage and invalidates the results of every affected class. It
needs no account, no passcode, and no preconditions.

**Aggravating:** `authenticated` also holds full table SELECT and the same PUBLIC policy applies, so
every logged-in exhibitor has the identical read. There is no results-release or visibility-cascade
predicate on these columns, unlike `entries` scored columns.

**Mitigating:** no client code consumes these columns — `grep -rn 'num_hides|hides_known|has_blank'`
across `apps/myk9show/src` and `packages` returns **zero** non-test hits. The exposure is pure
surplus privilege, so tightening it carries no UI regression risk.

**Fix:** apply the same revoke + column-allowlist pattern already used for `entries` in
[`20260616120000_public_results_release_gate.sql`](../supabase/migrations/20260616120000_public_results_release_gate.sql):

1. `REVOKE SELECT ON public.classes FROM anon;` then `GRANT SELECT (…)` on a safe allowlist that
   **excludes** `num_hides`, `has_blank`, `hides_known`.
2. For `authenticated`, gate those three columns behind show-official authority (a view, or
   `resolve_class_result_visibility`-style cascade) rather than a blanket table grant.
3. Add a contract test asserting anon cannot select `num_hides` — mirroring the existing
   anon-entries grant contract test.

**Auto-fixable:** No — requires a product decision on which roles may see hide counts and when
(judge and steward plausibly need them at ringside; exhibitors must not).

---

### [HIGH] SA-2026-07-29-02: Self-service anonymous sign-in reaches 32 unconditional read policies, including `volunteers` PII

- **Canonical severity:** **P1** — security exposure, latent today, escalates to **P0** on the first
  real volunteer or activity row
- **Source severity:** HIGH · **Status:** new · **Confidence:** high on the defect, **blocked** on the
  end-to-end replay (see Coverage Gaps)
- **Category:** 3 RBAC & Privilege Escalation / 5 Data Exposure
- **Route/object:** GoTrue anonymous sign-in + 32 `public` SELECT policies
- **First seen:** 2026-07-29 · **Runs:** 1

**Evidence — anonymous sign-in is enabled, verified read-only from a cold session:**

```
GET https://<project>.supabase.co/auth/v1/settings   → 200
{ "external": { "anonymous_users": true, "email": true, "google": true, … },
  "disable_signup": false, … }
```

Anyone can therefore call `signInAnonymously()` and receive a JWT with `role: authenticated`. That
role's reads are then bounded only by RLS. Enumerating the policies that impose **no** ownership or
role predicate (`USING (true)`, or `auth.uid() IS NOT NULL`, for PUBLIC or `authenticated`) returns
**32 SELECT policies**. The escalation delta beyond what plain `anon` already sees:

| Table                                                                               | Policy predicate         | Exposed                                             |
| ----------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------- |
| `volunteers`                                                                        | `USING (true)`           | **`name`, `email`, `phone`, `notes`**               |
| `volunteer_class_assignments` / `volunteer_general_assignments` / `volunteer_roles` | `USING (true)`           | rosters, `role_name`, `notes`                       |
| `activity_log`                                                                      | `auth.uid() IS NOT NULL` | full platform audit trail, `actor_name`, `metadata` |
| `roles`, `permissions`, `role_permissions`                                          | `USING (true)`           | complete RBAC model enumeration                     |
| `offline_scoring`                                                                   | `USING (true)`           | offline scoring records                             |
| `trial_checklist_state`                                                             | `auth.uid() IS NOT NULL` | every secretary's trial-prep checklist              |
| `show_announcements`                                                                | `auth.uid() IS NOT NULL` | all announcements, all shows, `author_name`         |
| `judge_qualifications`                                                              | `USING (true)`           | judge qualifications, `notes`                       |
| `organization_agreements`, `performance_metrics`                                    | `USING (true)`           | agreements, `metric_name`, `metadata`               |

**The intended guard already exists and was applied to exactly two tables.**
[`20260712160000_exclude_anon_from_platform_settings_sync_conflicts_select.sql`](../supabase/migrations/20260712160000_exclude_anon_from_platform_settings_sync_conflicts_select.sql)
added `((auth.jwt() ->> 'is_anonymous')::boolean) IS NOT TRUE` to `platform_settings` and
`sync_conflicts`. The remaining 32 policies never received it. This is a completeness gap in a known
remediation, not an unrecognised risk.

**Anonymous sign-in is load-bearing — do not disable it.** `validate-passcode` documents the
contract at [`index.ts:236`](../supabase/functions/validate-passcode/index.ts): _"A passcode user (no
account) signs in anonymously client-side first"_, and the function stamps the server-validated
`(show, role)` into `app_metadata`, which `private.entry_results_caller_context()` reads as
`claim_kind` / `claim_show_id` / `claim_role`. Turning the setting off would break QR/passcode
ringside access. The fix must be at the policy layer.

**Currently latent:** every table listed above has **0 rows** on staging, and
`select count(*) from auth.users where is_anonymous` = **0**. Nothing is leaking today. The defect is
that no code change is needed for it to leak — only data entry.

**Risk:** at launch, a volunteer roster with names, emails, and phone numbers becomes readable by
any internet user who calls one unauthenticated endpoint. The RBAC-model disclosure also hands an
attacker the full role/permission map — the same class of issue as the July 3 plan
[`plan-role-map-disclosure.md`](security-audit-2026-07/plan-role-map-disclosure.md), which remains
open for `roles` / `permissions` / `role_permissions`.

**Fix:** introduce one helper and use it everywhere an unconditional read is intended for real
accounts:

```sql
CREATE OR REPLACE FUNCTION public.is_real_account() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
     AND coalesce(((auth.jwt() ->> 'is_anonymous')::boolean), false) IS NOT TRUE;
$$;
```

Then replace `auth.uid() IS NOT NULL` with `public.is_real_account()`, and add
`AND public.is_real_account()` to the `USING (true)` policies. `volunteers` additionally warrants a
show/club scope rather than any-account visibility. Verify with `pg_policy` after push, then replay
an anonymous session.

**Auto-fixable:** No — `volunteers` needs a scoping decision, not just an anonymity guard.

---

### [MEDIUM] SA-2026-07-29-03: `judge_assignments` exposes judge `fee` and `notes` to anon

- **Canonical severity:** **P2** · **Source severity:** MEDIUM · **Status:** new · **Confidence:** high
- **Category:** 5 Data Exposure
- **Route/object:** `public.judge_assignments` (`fee`, `notes`)

**Evidence — cold anon session:**

```
GET /rest/v1/judge_assignments?select=id,show_id,person_id,fee,notes,status → 200, 5 rows
  fee column returned to anon: true   notes column returned to anon: true
  non-null fees currently: 0
```

```sql
pg_class.relacl        → anon=r/postgres          -- all columns
judge_assignments_select FOR SELECT TO PUBLIC USING (true)   -- no show/club predicate at all
```

**Risk:** judge compensation is confidential between club and judge, and `notes` is unbounded free
text. `USING (true)` means every assignment on the platform, not just published shows. Currently
0 populated fees, so nothing leaks yet — it will the first time a club records one, with no code
change.

**Fix:** `REVOKE SELECT ON public.judge_assignments FROM anon;` then
`GRANT SELECT (id, person_id, show_id, trial_id, class_id, status) TO anon;`. Published judge panels
are public information; fees and notes are not. Consider also narrowing `USING (true)` to
published-show scope, matching `classes_select`.

**Auto-fixable:** Yes — mechanical revoke + allowlist, matching the established `entries` pattern.

---

### [MEDIUM] SA-2026-07-29-04: anon holds a column SELECT grant on `people.email` with no reachable read path

- **Canonical severity:** **P2** (defense-in-depth) · **Source severity:** MEDIUM · **Status:** new
- **Confidence:** high · **Category:** 1 RLS Policy Integrity

**Evidence — `pg_attribute.attacl` (invisible to `pg_class.relacl`):**

```
people.id         → anon=r/postgres
people.first_name → anon=r/postgres
people.last_name  → anon=r/postgres
people.email      → anon=r/postgres        ← PII
```

`people` has **no** PUBLIC or anon SELECT policy, so RLS alone yields nothing:

```
GET /rest/v1/people?select=id,first_name,last_name,email  → 200, 0 rows
GET /rest/v1/people?select=*                              → 401 42501
```

No anon-reachable embed exercises the grant either: `shows→people` and `clubs→people` return
`PGRST200` (no such relationship), `judge_assignments→people` returns `people: NULL`, and
`entries→people!handler_id` is `42501` because `entries.handler_id` carries no anon grant.

**Risk:** this is precisely the `dog_favorites` pattern recorded in CLAUDE.md LESSONS — a table where
"RLS had masked the gap because every policy was `TO authenticated`". A single future PUBLIC-role
SELECT policy on `people`, or one new anon-readable FK into it, turns this into a full email
harvest. The grant is currently doing no work, so it is pure standing risk.

**Fix:** `REVOKE SELECT (id, first_name, last_name, email) ON public.people FROM anon;`. If a
specific embed genuinely needs it, add a `-- RATIONALE:` comment naming that embed and a test that
proves it; migration `20260725180000_anon_people_email_embed_and_public_functions` implies an embed
was intended, but no such path is reachable today.

**Auto-fixable:** Yes — revoke; verify the public show/results pages in a cold session afterwards.

---

### [MEDIUM] SA-2026-07-29-05: CORS preview-origin regex can be satisfied by a third-party `*.vercel.app` project

- **Canonical severity:** **P2** · **Source severity:** MEDIUM · **Status:** new
- **Confidence:** medium (claimability not verified — see below) · **Category:** 2 Edge Function Auth
- **Location:** [`supabase/functions/_shared/http/cors.ts:29-32`](../supabase/functions/_shared/http/cors.ts)

```ts
const MYK9SHOW_ORIGIN_PATTERNS: readonly RegExp[] = [
  /^https:\/\/myk9-platform-myk9show-[a-z0-9-]+\.vercel\.app$/i,
];
```

**Risk:** the pattern matches any `*.vercel.app` host beginning `myk9-platform-myk9show-`. Vercel
`*.vercel.app` subdomains are globally namespaced with no prefix reservation, so a third party who
creates a project named `myk9-platform-myk9show-<anything>` obtains an origin the allowlist accepts.
Every root edge function using `MYK9SHOW_ORIGINS` inherits this.

**Mitigating (caps this at P2, not higher):** `Access-Control-Allow-Credentials` is never set, and
the app authenticates with bearer tokens rather than cookies. An attacker page cannot read a
victim's token from another origin, so it cannot borrow a session — it can only make calls with a
token it already holds. The `stripe-*` functions use their own exact-match `ALLOWED_ORIGINS` list
with no regex, so the money path is unaffected.

**Confidence caveat:** I did not attempt to register a matching Vercel project — that would mean
interacting with a third-party service, outside an audit's remit. The finding rests on Vercel's
documented global `*.vercel.app` namespacing.

**Fix:** drive preview origins from an env-var allowlist, or tighten the pattern to include the team
slug that Vercel appends to real preview deployments
(`/^https:\/\/myk9-platform-myk9show-[a-z0-9]+-<team-slug>\.vercel\.app$/`).

**Auto-fixable:** No — needs the correct Vercel team slug / preview-URL shape as input.

---

### [MEDIUM] SA-2026-07-29-06: `is_show_official()` grants stewards judge-assignment writes and email-log reads

- **Canonical severity:** **P2** · **Source severity:** MEDIUM · **Status:** new · **Confidence:** high
- **Category:** 3 RBAC & Privilege Escalation
- **Route/object:** `is_show_official()`, `judge_assignments_{insert,update,delete}`, `email_log_select`

The platform carries two divergent "show authority" predicates:

```sql
can_manage_show(uuid)  = is_club_admin(club) OR is_trial_secretary(club) OR is_platform_admin()
                         -- no steward, no judge
is_show_official(uuid) = site_admin
                      OR (r.name IN ('secretary','chairman','steward') AND ur.show_id = check_show_id)
                      OR (r.name IN ('secretary','chairman','steward')
                          AND ur.show_id IS NULL AND ur.club_id = shows.club_id)
                         -- includes steward, excludes club_admin
```

The 2026-07-28 RLS consolidation
([`20260728131000_split_showday_manage_read_rls.sql`](../supabase/migrations/20260728131000_split_showday_manage_read_rls.sql))
wired `is_show_official(s.id)` into `judge_assignments_insert`, `_update`, and `_delete`. Combined
with `email_log_select`, which also uses `is_show_official`, a **steward** can:

- create, modify, and delete judge assignments for their show, and
- read `email_log` rows for that show's enrollments.

**Risk:** a steward is a ring helper. Assigning and removing judges is a secretary / club-admin
function with contractual consequences, and email logs carry delivery content for other people's
enrollments. This is over-broad role scope rather than an anonymous-attacker path, hence P2.

**Related, deliberate:** judges appear in **neither** predicate, so `entries_update`
(`can_manage_show`) rejects judge score writes at the table level — the standing gap recorded in
memory as _At-Show Judge Write RLS Gap_. Judge scoring authority lives entirely in the ringside
passcode-claim RPC path. That is a coherent design; it is called out here so the two predicates'
role sets are understood together, not as a separate defect.

**Fix:** split the predicate by intent — add `is_show_office_staff()` (site_admin, secretary,
chairman, club_admin) for administrative writes and email-log reads; keep `is_show_official` for
day-of operational reads where a steward legitimately belongs. Re-point the three
`judge_assignments` write policies and `email_log_select` at the new helper.

**Auto-fixable:** No — role-model design decision.

---

### [MEDIUM] SA-2026-07-29-07: show-branding storage policies read `shows.name` instead of the object path, so the secretary limb is dead

- **Canonical severity:** **P2** (product defect, security-adjacent — fail-closed) · **Source severity:** MEDIUM
- **Status:** new · **Confidence:** high (predicate replayed in SQL) · **Category:** 1 RLS Policy Integrity
- **Location:** [`supabase/migrations/059_club_and_show_branding.sql:53`](../supabase/migrations/059_club_and_show_branding.sql) and its UPDATE / DELETE twins

All three policies contain the same correlated-name bug:

```sql
EXISTS (
  SELECT 1 FROM shows s
  WHERE s.id = ((storage.foldername(s.name))[2])::uuid   -- ← s.name is the SHOW TITLE
    AND is_trial_secretary(s.club_id)
)
```

Inside the subquery, `s.name` resolves to `shows.name` (the show's title), not
`storage.objects.name` (the upload path). The sibling club policy gets this right with
`storage.foldername(objects.name)`.

**Evidence — replayed read-only against the applied database:**

```sql
select count(*) from public.shows s
 where s.id::text = coalesce((storage.foldername(s.name))[2],'00000000-…');
-- 0   ← the secretary limb never matches
-- foldername(name) returns {} for slash-free titles, so [2] is NULL
```

**Impact:**

1. **Availability / correctness:** the secretary limb is unreachable, so show-branding
   upload/update/delete falls through to `OR is_platform_admin()`. Secretaries cannot manage their
   own show branding; only a platform admin can. It fails _closed_, so this is not an escalation.
2. **Latent hard error:** if any show title ever contains `/`, `storage.foldername` returns a
   non-empty array and `[2]::uuid` raises `22P02 invalid input syntax for type uuid`, failing the
   entire storage request. No current show title contains `/` (`names_with_slash = 0`), so this has
   not fired yet. Titles like `Spring Trial 3/4` are entirely plausible.

**Fix:** new migration replacing all three policies, changing `storage.foldername(s.name)` to
`storage.foldername(objects.name)` and moving the extraction out of the correlated subquery:

```sql
AND ( EXISTS ( SELECT 1 FROM public.shows s
               WHERE s.id = ((storage.foldername(objects.name))[2])::uuid
                 AND (SELECT public.is_trial_secretary(s.club_id)) )
      OR (SELECT public.is_platform_admin()) )
```

**Auto-fixable:** No — changes who can write to a storage bucket; wants an explicit review and an
upload smoke test as a secretary.

**Note:** the remaining storage policies are correct. `profiles/` and `dogs/` validate
`(storage.foldername(name))[2] = (SELECT auth.uid())::text` exactly as the checklist requires, and
the `clubs/` and `premium-published` policies use the object path properly.

---

### [LOW] SA-2026-07-29-08: `entries_anon_select_for_tv` has no `deleted_at IS NULL` predicate

- **Canonical severity:** **P3** · **Source severity:** LOW · **Status:** new · **Confidence:** high
- **Category:** 1 RLS Policy Integrity (soft-delete)

```sql
entries_anon_select_for_tv FOR SELECT TO anon USING (
  show_id IN ( SELECT id FROM shows
               WHERE status = ANY (ARRAY['published','upcoming','in_progress','completed'])
                 AND deleted_at IS NULL ) )
-- filters the SHOW's deleted_at, never the ENTRY's
```

**Risk:** soft-deleted entries remain anon-visible in public running orders and results.
`entries.deleted_at` is not in the anon column allowlist, so an anon consumer cannot even detect or
filter them client-side. The checklist requires `deleted_at IS NULL` on SELECT policies for
soft-deletable tables. Cosmetic/data-integrity rather than a disclosure of protected data.

**Fix:** `AND deleted_at IS NULL` in the policy. Confirm `view_public_entry_results` applies the same
predicate.

**Auto-fixable:** Yes.

---

### [LOW] SA-2026-07-29-09: 21 SECURITY DEFINER functions pin `search_path=public` rather than `search_path=''`

- **Canonical severity:** **P3** · **Source severity:** LOW · **Status:** **unchanged — recurrence of
  SA-027** (2026-07-10) · **Confidence:** high · **Runs:** 2 (2026-07-10, 2026-07-29)
- **Category:** 3 RBAC & Privilege Escalation

Affected: `assert_active_waitlist_offer_payment_link`, `check_class_availability`,
`check_login_rate_limit`, `get_admin_user_list` (`public, auth`), `get_my_onboarding_requests`
(`public, pg_catalog`), `handle_entry_scoring_state_change`, `hard_delete_show`,
`promote_waitlist_entry{,_from_cron,_internal}`, `recalculate_class_placements`,
`record_entry_status_history`, `record_login_attempt`, `refresh_class_scoring_state`,
`resolve_class_result_visibility`, `restrict_payment_status_update`,
`restrict_subscription_column_updates`, `soft_delete_{class,dog,show}`,
`update_thread_last_message_at`.

**Not exploitable — verified:**

```sql
select rolname, has_schema_privilege(rolname,'public','CREATE') from pg_roles
 where rolname in ('anon','authenticated','service_role');
-- anon=false  authenticated=false  service_role=false
-- pg_namespace public nspacl → "=U/pg_database_owner" (USAGE only, no CREATE for PUBLIC)
```

No API role can create shadowing objects in `public`, so the classic search-path hijack is closed at
the schema-ACL layer. **Positive:** zero SECURITY DEFINER functions lack an explicit `search_path`
altogether — the hardened idiom is otherwise universal.

**Fix:** convert to `SET search_path = ''` with fully-qualified references, as the newer functions do.
Consistency and depth, not an open hole. Reasonable to accept and close as `deferred` with a reason.

**Auto-fixable:** No — each conversion needs its body fully qualified and retested.

---

### [LOW] SA-2026-07-29-10: 4 of 6 `rls_enabled_no_policy` tables lack the disposition comment their siblings carry

- **Canonical severity:** **P3** · **Source severity:** LOW · **Status:** new · **Confidence:** high
- **Category:** 1 RLS Policy Integrity (documentation)

`login_attempts`, `premium_generation_attempts`, `show_money_locks`, and `show_passcodes` are
RLS-enabled with zero policies and `service_role`-only grants — correct deny-all-by-default, and all
four return `42501` to a cold anon probe. But
[`20260728120000_advisor_grant_regrowth_guard.sql`](../supabase/migrations/20260728120000_advisor_grant_regrowth_guard.sql)
added an explicit `COMMENT ON TABLE … 'advisor rls_enabled_no_policy INFO ACCEPTED 2026-07-28
(MYK9-108)'` disposition for only `stripe_order_refunds` and `waitlist_notification_events`.

**Risk:** none directly. The four undocumented tables will keep resurfacing as unexplained advisor
INFO entries, and a future reader cannot distinguish "deliberately deny-all" from "policy forgotten"
— the exact ambiguity the comments were introduced to remove.

**Fix:** extend the same `COMMENT ON TABLE` disposition to the four remaining tables.

**Auto-fixable:** Yes — comment-only migration.

---

## Rejected during verification

- **"23 `/admin/*` routes are unguarded"** — **rejected.** An initial JSX heuristic counted 26
  `<Route>` against 1 `<ProtectedRoute>` in
  [`routes/adminRoutes.tsx`](../apps/myk9show/src/routes/adminRoutes.tsx). Direct reading shows every
  admin route wraps its element in the `adminGuard()` helper
  (`<ProtectedRoute requiredRole={UserRole.SITE_ADMIN}>`, line 144-146). The single occurrence is the
  helper definition. Coverage is complete; the scan was wrong, not the code. Recorded so a future run
  does not re-raise it.
- **`send-results` uses `app_metadata` for authorization** — **rejected.** The grep hit is a comment
  in [`send-results/authz.ts`](../supabase/functions/send-results/authz.ts) that states the opposite
  intent (_"authorize against the DB role table, not JWT app_metadata claims"_). The function queries
  `user_roles` with an active-and-not-expired filter. Correct.

---

## Categories Checked

| Category                      | Scope examined                                                                                             | Findings | Notes                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| 1 RLS Policy Integrity        | 119 public tables, 13 `storage.objects` policies, 2 buckets, applied `pg_policy` + `relacl` + `attacl`     | 5        | RLS enabled **and forced** on 100% of public tables |
| 2 Edge Function Auth          | 35 functions (23 root + 12 app) + 4 shared helpers                                                         | 1        | every function gated; no wildcard CORS              |
| 3 RBAC & Privilege Escalation | `user_roles`/`roles`/`permissions`/`role_permissions` policies, 5 helper function bodies, 224 advisors     | 3        | privileged-table writes are admin-only              |
| 4 Client Auth Patterns        | route guard coverage across 6 route files, secret grep, dev-flag grep                                      | 0        | `ProtectedRoute` on all gated routes                |
| 5 Data Exposure               | cold anon probe (41 endpoints + 6 embeds), logging/toast grep                                              | 3        | every sensitive table `42501` to anon               |
| 6 Payment Security            | `stripe-webhook`, `stripe-checkout`, `stripe-refund-entry`, `stripe-refund-show`, `stripe-customer-portal` | 0        | see Verified Solid                                  |
| 7 Input Validation            | `dangerouslySetInnerHTML`, redirect validation, param handling                                             | 0        | zero `dangerouslySetInnerHTML` in the app           |

---

## Verified solid (independently re-proved this run)

- **RLS coverage is total.** All 119 `public` base tables report
  `relrowsecurity = true AND relforcerowsecurity = true`. This closes SA-021 by direct measurement,
  not by trusting the migration.
- **Cold anon surface is tight.** 30 of 41 probed endpoints return `401 / 42501`, including
  `user_roles`, `roles`, `permissions`, `role_permissions`, `show_passcodes`, `stripe_customers`,
  `stripe_orders`, `stripe_subscriptions`, `club_stripe_accounts`, `login_attempts`,
  `platform_settings`, `onboarding_requests`, `support_tickets`, `health_records`,
  `exhibitor_profiles`, `show_money_locks`, `ringside_sessions`, and
  `view_authenticated_entry_results`.
- **The `entries` revoke + column-allowlist design holds.** `select=*`, `total_score`,
  `payment_status`, `stripe_payment_intent_id`, `handler_id`, and `deleted_at` all return `42501` to
  anon while the safe allowlist returns rows. The `entries→dogs` embed returns `dogs: NULL` rather
  than leaking or hard-erroring — the embed-grant trap is handled correctly.
- **Edge function authorization is uniform and fail-closed.** All 35 functions carry a real gate:
  JWT via the shared envelope, Stripe signature, Svix signature, or a shared secret.
  `requirePushWebhookSecret` throws `503` when `PUSH_WEBHOOK_SECRET` is unset (fail-closed) and
  compares with `timingSafeEqual` — SA-028 and SA-029 confirmed closed at the source.
- **Stripe.** `constructEventAsync` with separate platform and Connect secrets; subscription
  `price_id` validated against `VALID_PRICE_IDS` (SA-024 closed); entry amounts derived server-side
  from cart rows, never the request body; `isAllowedRedirectUrl` compares `new URL(url).origin`
  against an exact allowlist (no prefix bug); `stripe-refund-entry` evaluates authorization **as the
  caller** via `is_show_secretary` / `is_club_admin` / `is_site_admin` RPCs on an anon-key client
  carrying the caller's `Authorization` header — the correct pattern — under a show money lock with
  per-entry idempotency keys and an operator alert when a refund succeeds but stamping fails.
- **Privileged-table writes.** `user_roles` INSERT/UPDATE/DELETE all require `is_site_admin()`;
  `roles` / `permissions` / `role_permissions` all require `is_platform_admin()`; `stripe_*` writes
  are admin-only with self-scoped reads. No RLS privilege-escalation path found.
- **Client hygiene.** No hardcoded `sk_`/`whsec_`/service-role keys, no secret-shaped `VITE_` vars,
  zero `dangerouslySetInnerHTML`, no PII in `console.*`, no raw `error.details`/`hint`/`code` in
  toasts.
- **Deliberate advisor dispositions.** The 2 ERROR-level `security_definer_view` entries
  (`view_public_entry_results`, `view_authenticated_entry_results`) are the intended architecture —
  owner-run views that `CASE`-null protected columns per the release cascade, documented in
  `20260616120000` and `20260728210000`. Correctly `REVOKE`d from anon where applicable. Not findings.
- **10 anon-executable SECURITY DEFINER functions** are the RLS helper predicates
  (`is_club_admin`, `is_platform_admin`, `get_my_person_id`, …). Anon must hold EXECUTE for
  PUBLIC-role policies to evaluate; all return false/null for anon. Structurally required.

---

## Previous Audit Comparison (vs [2026-07-11](security-audit-2026-07-11.md))

The 2026-07-11 baseline held 1 MEDIUM + 6 LOW. **All 7 are resolved**, and per the lifecycle rule
that a merge is not resolution, each is marked resolved only where a replay or source read confirmed
it this run.

| Baseline ID | Title                                                             | Status       | Closure proof used this run                                                                                            |
| ----------- | ----------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| SA-021      | `FORCE ROW LEVEL SECURITY` missing on 5 tables                    | **resolved** | SQL replay: `relforcerowsecurity = true` on all 119 public tables                                                      |
| SA-023      | `resend-webhook` inline HMAC instead of shared helper             | **resolved** | source: imports `verifyStandardWebhookSignature` from `_shared/standardWebhookSignature.ts`                            |
| SA-024      | `validate-passcode` rate limiter fails OPEN                       | **resolved** | source: limiter gate returns before validation; documented live 401/429/503 proof in the 2026-07-12 remediation record |
| SA-025      | `generate-premium` no per-user rate limit                         | **resolved** | `premium_generation_attempts` exists, RLS-forced, `service_role`-only; `42501` to anon                                 |
| SA-028      | Push webhook secret compared with `!==`                           | **resolved** | source: `pushWebhookAuth.ts` uses `timingSafeEqual`                                                                    |
| SA-029      | Push webhook secret fell back to `SUPABASE_SERVICE_ROLE_KEY`      | **resolved** | source: reads only `PUSH_WEBHOOK_SECRET`, `503` when unset                                                             |
| SA-030      | `getCurrentUserId()` read dev-mock localStorage without DEV guard | **resolved** | grep: no unguarded dev-mock localStorage read remains in `apps/myk9show/src`                                           |

Also confirmed closed from the 2026-07-10 audit: **SA-020** (`send-results` had no role check) —
now gated by `assertSendResultsAuthorization` against `user_roles` with a server-side recipient map
and body-supplied addresses ignored.

Carried forward as recurrence: **SA-027** → SA-2026-07-29-09 (`search_path=public`), second
consecutive appearance.

Still open from the 2026-07-03 remediation set, re-confirmed present:
**role-map disclosure** (`roles` / `permissions` / `role_permissions` remain
`FOR SELECT TO authenticated USING (true)`) — folded into SA-2026-07-29-02, whose anonymous-sign-in
finding makes it materially worse than when first written.

**Net direction:** the previously-open surface is fully remediated. The new findings are not
regressions of prior work — they are older standing grants (`classes`, `judge_assignments`,
`people.email`, storage `059`) that earlier audits had not reached, plus one completeness gap in the
July 12 anonymous-exclusion remediation.

---

## Coverage Gaps (not passes)

1. **Anonymous-session end-to-end replay — blocked.** SA-2026-07-29-02's exploit chain
   (`signInAnonymously()` → read `volunteers` / `activity_log` / `roles`) was **not** executed.
   Completing it requires creating an anonymous `auth.users` row, which is a write that cannot be
   rolled back, and the task mandates read-only verification. Both halves are independently proven —
   the capability (`"anonymous_users": true` from `/auth/v1/settings`) and the policy text (32
   unconditional SELECT policies from `pg_policy`) — so the defect is confirmed; only the single
   composed replay is outstanding.
   **Proof that would close it:** in a disposable environment, `signInAnonymously()`, then
   `GET /rest/v1/volunteers?select=name,email,phone` and confirm rows return.
2. **Authenticated-role probing not performed.** All live probes used the anon key. Per-role reads
   for exhibitor / secretary / judge / steward were reasoned from policy text and helper function
   bodies, not exercised with a signed-in session. A logged-in probe would raise confidence on
   SA-2026-07-29-06 in particular.
3. **`storage.objects` read policies not enumerated.** Both buckets are `public = true`, so object
   reads bypass RLS by design and were not probed for object-level disclosure. Only the 13
   write-path policies were reviewed. Whether `premium-published` and `images` _should_ be public
   buckets was not assessed.
4. **Out of skill scope, not performed:** dependency / supply-chain scanning, git-history secret
   scanning, penetration testing, and load testing.
5. **Vercel subdomain claimability (SA-2026-07-29-05) not empirically confirmed** — deliberately, as
   it would require registering a third-party project.

---

## Linear — batch approved and filed 2026-07-29

Two confirmed, non-duplicate findings met the P0/P1 gate. Batch approval was granted by the user and
both issues were filed against team **MyK9-platform**:

| Finding               | Issue                                                                                                                              | Priority | State |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| SA-2026-07-29-01 (P0) | [MYK9-116](https://linear.app/myk9-platform/issue/MYK9-116/anon-can-read-secret-scent-work-hide-counts-classesnum-hides-has-blank) | Urgent   | Todo  |
| SA-2026-07-29-02 (P1) | [MYK9-117](https://linear.app/myk9-platform/issue/MYK9-117/anonymous-sign-in-reaches-32-unconditional-rls-read-policies-including) | High     | Todo  |

Both are labelled `Bug`, linked to each other, and reference MYK9-93 (the completed anon RLS/grant
sweep that did not reach these tables). Deduplication was performed against open and completed Linear
issues before creation — no existing issue covered either symptom.

The draft text below is retained as the authoritative record of what was filed.

### Draft 1 — P0 · filed as MYK9-116

**Title:** Anon can read secret scent-work hide counts (`classes.num_hides`, `has_blank`) before classes run

**Problem.** `public.classes` grants `anon` table-level SELECT on every column, and `classes_select`
is a PUBLIC-role policy with no column restriction. `num_hides` and `has_blank` are therefore
readable by any unauthenticated client for classes explicitly flagged `hides_known = false`.

**Impact.** Score/result integrity. A competitor can learn the exact hide count and whether an area
is blank before running an Excellent or Master class, using only the public anon key that ships in
the browser bundle. Affected classes' results are invalid. Every authenticated exhibitor has the
same read.

**Evidence.** Cold anon `GET /rest/v1/classes?select=…&hides_known=is.false` → `200` returning
`Exterior Excellent num_hides=2` and `Buried Master num_hides=3 has_blank=true`, both
`status=upcoming`. Applied DB: `pg_class.relacl → anon=r/postgres`; `classes_select FOR SELECT TO
PUBLIC`. Baseline SHA `39ed30dc8`.

**Reproduction.** With the project's publishable anon key and no auth session, request
`/rest/v1/classes?select=id,name,level,hides_known,num_hides,has_blank&hides_known=is.false`.

**Expected.** Anon (and non-official authenticated users) cannot read `num_hides`, `has_blank`, or
`hides_known` for classes where the hide count is undisclosed.

**Acceptance criteria.**

- `REVOKE SELECT ON public.classes FROM anon` plus a `GRANT SELECT (…)` allowlist excluding
  `num_hides`, `has_blank`, `hides_known`.
- Authenticated access to those columns limited to show officials (view or cascade helper).
- Contract test asserting anon receives `42501` for `select=num_hides`.
- Public show / results / TV pages verified unchanged in a cold session.

**Verification.** Post-push: `pg_class.relacl` + `pg_attribute.attacl` for `classes`; replay the
cold anon query and confirm `42501`; run the new contract test.

**Scope.** `supabase/migrations/` (new migration), `public.classes`. No client change expected — no
non-test source reads these columns.

**Suggested priority:** Urgent.

### Draft 2 — P1 · filed as MYK9-117

**Title:** Anonymous sign-in reaches 32 unconditional RLS read policies, including `volunteers` name/email/phone

**Problem.** GoTrue anonymous sign-in is enabled (`/auth/v1/settings → "anonymous_users": true`) and
is load-bearing for passcode ringside access. 32 `public` SELECT policies impose no ownership or
role predicate (`USING (true)` or `auth.uid() IS NOT NULL`), so an anonymous session is treated as a
fully trusted account. The `is_anonymous IS NOT TRUE` guard from migration `20260712160000` was
applied only to `platform_settings` and `sync_conflicts`.

**Impact.** Any internet user can obtain an `authenticated` JWT and read `volunteers`
(`name`, `email`, `phone`, `notes`), `activity_log` (full audit trail), `roles` / `permissions` /
`role_permissions` (complete RBAC map), `offline_scoring`, `trial_checklist_state`,
`show_announcements`, `judge_qualifications`, `organization_agreements`, `performance_metrics`.
Latent today — all listed tables have 0 rows on staging and 0 anonymous users exist — and requires
no code change to become live PII exposure at launch.

**Evidence.** `GET /auth/v1/settings` → `"anonymous_users": true`. `pg_policy` enumeration of 32
matching SELECT policies. `information_schema.columns`: `volunteers` carries `name, email, phone,
notes`. Guard precedent: `20260712160000_exclude_anon_from_platform_settings_sync_conflicts_select.sql`.
Baseline SHA `39ed30dc8`.

**Reproduction (needs a disposable environment — not run, see report Coverage Gaps).**
`signInAnonymously()`, then `GET /rest/v1/volunteers?select=name,email,phone`.

**Expected.** An anonymous (passcode-scoped) session reads only what its stamped
`app_metadata` claim authorizes — never platform-wide rosters, audit logs, or the RBAC model.

**Acceptance criteria.**

- Add `public.is_real_account()` (`auth.uid() IS NOT NULL AND is_anonymous IS NOT TRUE`).
- Replace `auth.uid() IS NOT NULL` and augment `USING (true)` across the 32 policies.
- `volunteers` scoped to the relevant show/club rather than any account.
- Do **not** disable anonymous sign-in — `validate-passcode` depends on it.
- Regression test: passcode ringside access still works end to end.

**Verification.** Post-push `pg_policy` diff; anonymous-session replay confirming `volunteers`,
`activity_log`, and `roles` return zero rows; passcode ringside smoke test.

**Scope.** `supabase/migrations/`, 32 policies across ~15 tables.

**Suggested priority:** High.

### Optional triage (recurring P2) — no draft prepared

- SA-2026-07-29-09 (`search_path=public`, 2nd consecutive run) — reasonable to close as `deferred`
  with the schema-ACL evidence as the accepted-risk rationale.

All other P2/P3 findings are report-only per the lifecycle policy.

---

## Automation memory ledger

```
SA-2026-07-29-01 | P0 | HIGH   | new       | 2026-07-29/2026-07-29 | 1 | MYK9-116 | cold-anon GET classes?hides_known=is.false → num_hides/has_blank returned for unrun Excellent+Master | anon 42501 on select=num_hides after revoke+allowlist
SA-2026-07-29-02 | P1 | HIGH   | new       | 2026-07-29/2026-07-29 | 1 | MYK9-117 | /auth/v1/settings anonymous_users=true + 32 unconditional SELECT policies incl volunteers(name,email,phone) | signInAnonymously then volunteers read returns 0 rows
SA-2026-07-29-03 | P2 | MEDIUM | new       | 2026-07-29/2026-07-29 | 1 | unassigned | cold-anon judge_assignments returns fee+notes columns (0 populated); policy USING(true) + anon=r | anon 42501 on select=fee after revoke+allowlist
SA-2026-07-29-04 | P2 | MEDIUM | new       | 2026-07-29/2026-07-29 | 1 | unassigned | pg_attribute.attacl people.email anon=r with no reachable read path (0 rows, no embed) | attacl shows no anon grant on people after revoke
SA-2026-07-29-05 | P2 | MEDIUM | new       | 2026-07-29/2026-07-29 | 1 | unassigned | cors.ts preview regex matches any myk9-platform-myk9show-*.vercel.app | pattern includes team slug or env allowlist
SA-2026-07-29-06 | P2 | MEDIUM | new       | 2026-07-29/2026-07-29 | 1 | unassigned | is_show_official includes steward; wired to judge_assignments write policies + email_log_select | judge_assignments writes re-pointed at office-staff predicate
SA-2026-07-29-07 | P2 | MEDIUM | new       | 2026-07-29/2026-07-29 | 1 | unassigned | storage 059 show-branding policies use storage.foldername(s.name); SQL replay secretary_limb_matches=0 | secretary upload to images/shows/<id> succeeds post-fix
SA-2026-07-29-08 | P3 | LOW    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | entries_anon_select_for_tv lacks entry-level deleted_at IS NULL | soft-deleted entry absent from cold-anon entries read
SA-2026-07-29-09 | P3 | LOW    | unchanged | 2026-07-10/2026-07-29 | 2 | unassigned | 21 secdef fns search_path=public; not exploitable (CREATE on public false for all API roles) | proconfig search_path='' or documented deferral
SA-2026-07-29-10 | P3 | LOW    | new       | 2026-07-29/2026-07-29 | 1 | unassigned | login_attempts/premium_generation_attempts/show_money_locks/show_passcodes lack advisor disposition COMMENT | COMMENT ON TABLE present for all 6
RESOLVED: SA-021, SA-023, SA-024, SA-025, SA-028, SA-029, SA-030 (2026-07-11 baseline), SA-020 (2026-07-10) — each with replay or source proof recorded above
REJECTED: admin-routes-unguarded (adminGuard helper wraps all 26); send-results-app_metadata (comment match, queries user_roles)
BLOCKED:  anonymous-session composed replay (write required, read-only mandate); authenticated-role live probing; storage object read policies; bucket public=true assessment
```
