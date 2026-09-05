# Security Audit — 2026-09-05

- **Mode:** Full Audit (`security-audit --full`)
- **Detecting task:** `claude-security-audit` (scheduled, unattended)
- **Source:** claude
- **Baseline SHA:** `e8a410f6eab7696923431d1847de3d6243623ace` (`main`, clean tree, after `git fetch origin main`)
- **Prior Claude/Codex report:** `docs/security-audit-2026-07-31.md` (baseline `1f5ccb8a4`)
- **Checklist:** `.claude/skills/security-audit/references/checklist.md` @ `84e656142`
- **Finding contract:** `quality-finding-lifecycle`
- **Verification target:** applied staging database, project ref `sojmvhhwsjxmfistvzbe`

**Method.** Live-database verification first, source second. Every ACL claim comes from
`pg_class.relacl`, `pg_attribute.attacl`, `pg_policy`, `pg_proc.proacl` and
`has_*_privilege()` against the applied database — not from migration text. Anon behaviour was
replayed in a **cold, unauthenticated session** (anon key only, no bearer token, no cookie).
Edge-function deployment claims are read from the live bundle via `get_edge_function`, not from a
merge or a deploy timestamp. No writes of any kind were made to the shared database, storage, or
Stripe; where proving a claim would have required one, the finding says so and the coverage gap is
recorded rather than papered over.

---

## Summary

### Active findings

| Source severity | Count |
| --- | ---: |
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 2 |
| LOW | 3 |
| INFO | 1 |
| **Total active** | **9** |

| Canonical launch severity | Count |
| --- | ---: |
| P0 | 2 |
| P1 | 2 |
| P2 | 2 |
| P3 | 3 |

### Transition set

| Lifecycle status | Count | Records |
| --- | ---: | --- |
| new | 8 | SA-2026-09-05-01 … -08 |
| unchanged | 1 | SA-027 |
| resolved | 6 | SA-2026-07-31-01, SA-2026-07-29-03, -05, -06, -08, -12, SA-2026-07-30-02 |
| blocked | 1 | SA-2026-07-29-11 |
| rejected (re-confirmed) | 1 | "23 `/admin/*` routes unguarded" |
| superseded | 1 | SA-2026-07-29-07 rejection → reopened as SA-2026-09-05-01 |
| corrected | 1 | SA-2026-07-29-04 rejection premise no longer holds — see SA-2026-09-05-04 |

Auto-fixable: **5 of 9** (SA-2026-09-05-01, -06, -07, -08, and the guard half of -02). The other
four need a policy or product decision.

### At a glance

- **SA-2026-09-05-01 — HIGH / P0, new.** The three `storage.objects` show-branding policies
  authorize against `shows.name`, not the uploaded object path. The subquery is uncorrelated with
  the object, so once any show is named `x/<its own uuid>` — a rename a secretary can perform on
  their own club's show — the caller holds INSERT/UPDATE/DELETE over **every** object under
  `images/shows/**` platform-wide, in a `public = true` bucket. Currently latent (0 of 10 shows
  match). Filed as [MYK9-398](https://linear.app/myk9-platform/issue/MYK9-398).
- **SA-2026-09-05-03 — HIGH / P0, new (availability, not security).** Ringside scoring has been in
  the MYK9-115 `contained` state for **10 days 9 hours**; nothing re-arms the breaker, and every
  ringside write takes the 250 ms backpressure path. Filed as
  [MYK9-400](https://linear.app/myk9-platform/issue/MYK9-400).
- **SA-2026-09-05-02 — HIGH / P1, new.** `cron-health-check` and `cron-process-payouts` fail
  **open** on an unset function secret — `TextEncoder.encode(undefined)` hashes the literal string
  `"undefined"`. Not currently exploitable; `cron-process-payouts` moves money. Filed as
  [MYK9-399](https://linear.app/myk9-platform/issue/MYK9-399).
- **SA-2026-07-31-01 — HIGH / P0, resolved.** All 23 `user_roles` call sites across every edge
  function now go through `applyActiveRoleValidity`, and the deployed `admin-delete-user` v52
  bundle carries `expires_at.gt.now()`. Deployment confirmed by reading the live bundle.

---

## Findings

### [HIGH] SA-2026-09-05-01: Show-branding storage policies authorize against the show's name, not the object path

- **Category:** RLS Policy Integrity (storage path ownership)
- **Canonical severity:** P0 · **Source severity:** HIGH · **Status:** new (supersedes the
  2026-07-29 rejection of SA-2026-07-29-07) · **Confidence:** high
- **Location:** `storage.objects` policies `Secretaries can upload show branding` (INSERT),
  `Secretaries can update show branding` (UPDATE), `Secretaries can delete show branding` (DELETE);
  originating migration `supabase/migrations/059_*` and successors
- **Linear:** [MYK9-398](https://linear.app/myk9-platform/issue/MYK9-398)

**Evidence** — applied policy text, read from `pg_policy` on `sojmvhhwsjxmfistvzbe`, identical
across all three commands:

```
(bucket_id = 'images')
AND ((storage.foldername(name))[1] = 'shows')
AND (
  EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id = ((storage.foldername(s.name))[2])::uuid
      AND is_trial_secretary(s.club_id)
  )
  OR is_platform_admin()
)
```

The unqualified `name` inside the subquery binds to `shows.name` — the inner `FROM` shadows
`storage.objects` — so `storage.foldername()` parses the show's **display name** as a path. The
subquery never references `objects.name`. The only constraint on the object being written is
`(storage.foldername(name))[1] = 'shows'`.

**Current state** (read-only query):

```sql
select count(*) filter (where s.id::text = (storage.foldername(s.name))[2])
from public.shows s;   -- 0 of 10
```

**Risk.** `shows_update` admits `is_trial_secretary(shows.club_id)` with no column restriction, so
a secretary can rename their own club's show to `x/<that show's own uuid>`. The EXISTS then becomes
TRUE for that caller, and because it is a **global** predicate over `shows` rather than a check on
the object path, the caller gains INSERT/UPDATE/DELETE over every object under `images/shows/**`,
including other clubs' branding. The `images` bucket is `public = true`, so planted objects are
world-readable: cross-tenant asset deletion and brand substitution.

**Why the previous audit missed it.** The 2026-07-29 run measured `secretary_limb_matches=0` and
rejected the item as non-security. That number measures the **arming state**, not the mechanism,
and the arming step is a self-service product action.

**Corollary (functional, not security).** With no show matching, secretaries cannot manage show
branding at all today — only `is_platform_admin()` passes.

**Fix.** Correlate on the object path, as the sibling policies in the same bucket already do
(`Club admins can upload club branding` uses `is_club_admin(((storage.foldername(objects.name))[2])::uuid)`;
`Secretaries can upload premium published` uses `is_show_secretary((split_part(objects.name,'.',1))::uuid)`):

```sql
(bucket_id = 'images')
AND ((storage.foldername(objects.name))[1] = 'shows')
AND ( can_manage_show(((storage.foldername(objects.name))[2])::uuid) OR is_platform_admin() )
```

**Auto-fixable:** Yes (new migration; mechanical).

---

### [HIGH] SA-2026-09-05-02: Two cron edge functions authenticate everyone when their secret is unset

- **Category:** Edge Function Auth
- **Canonical severity:** P1 · **Source severity:** HIGH · **Status:** new · **Confidence:** high
- **Location:** `apps/myk9show/supabase/functions/cron-health-check/index.ts:33,46-58`;
  `apps/myk9show/supabase/functions/cron-process-payouts/index.ts:26,455-467`
- **Linear:** [MYK9-399](https://linear.app/myk9-platform/issue/MYK9-399)

**Evidence:**

```ts
const cronSecret = Deno.env.get('HEALTH_CRON_SECRET')!;   // PAYOUT_CRON_SECRET in the payouts fn

async function secretMatches(provided: string | null): Promise<boolean> {
  if (!provided) return false;                            // guards the caller's side only
  ...
  crypto.subtle.digest('SHA-256', enc.encode(cronSecret)) // undefined when the env var is absent
  ...
}
```

`!` is erased at compile time. With the env var absent, `cronSecret` is `undefined`,
`TextEncoder.encode(undefined)` encodes the string `"undefined"`, and any caller sending
`x-function-secret: undefined` authenticates. Both functions deploy `--no-verify-jwt` and run with
the service-role key; `cron-process-payouts` initiates Stripe transfers.

**Not currently exploitable.** Vault holds `health_cron_secret` and `payout_cron_secret`, and the
5-minute `continuous-health-check` cron is authenticating right now — `system_health_snapshots` has
289 rows in the last 24h, newest 1m44s old. The exposure fires whenever the function-side variable
is absent: a rotation, a new environment, a renamed variable. It is silent when it happens.

**Evidence this is an oversight, not a decision.** Three siblings fail closed:
`cron-waitlist-expiration` (`if (!provided || !cronSecret) return false`),
`supabase/functions/_shared/functionSecret.ts` (503 on unset, with the reason in a comment), and
`stripe-webhook` (throws at module load on any missing env var).

**Fix.** Use the shared `requireFunctionSecret`, or at minimum add `|| !cronSecret`.

**Auto-fixable:** Yes (the guard); replacing both copies with the shared helper is the better fix.

---

### [HIGH] SA-2026-09-05-03: Ringside scoring has been contained for 10 days with no auto-recovery

- **Category:** Availability / operational (surfaced incidentally; **not** a security exposure)
- **Canonical severity:** P0 (show-day outage class) · **Source severity:** HIGH · **Status:** new ·
  **Confidence:** high
- **Location:** `public.ringside_containment`; `ringside_update_entry`; MYK9-115 breaker
- **Linear:** [MYK9-400](https://linear.app/myk9-platform/issue/MYK9-400)

**Evidence** — live state at 2026-09-05T08:31Z:

```
state              contained          tripped_at    2026-08-25 23:25:00.915672+00
contained_for      10 days 09:06:07   trip_reason   conflict rate 745/min exceeded threshold 300/min
calibrated         false              backpressure_ms 250
last_sample_at     2026-09-05 08:31:00+00   (the minutely sampler is healthy)
```

The storm ended long ago — the newest health snapshot reads `0 conflicts this window — 0/min over
5 min`. Re-arming is a manual `ringside_containment_rearm()` call and nobody has made it. While
contained, `ringside_update_entry` takes the 250 ms backpressure path for every write and raises
`Ringside scoring contained; retries paused` on the OCC-conflict branch.

The `/admin/health` board has reported `ringside_conflicts: fail` and `overall_status: fail`
throughout, so detection works and the response loop does not — which also means the board has been
red for ten days and is no longer a useful signal for anything else.

**Risk.** Degraded or refused ringside scoring on any show day inside a containment window, with no
time bound. This is the production scoring outage MYK9-115 exists to prevent, arriving through the
mitigation rather than the fault.

**Fix.** Re-arm now (privileged call; not performed by this read-only audit), then give containment
a bounded window — auto-re-arm after N consecutive sub-threshold samples, or a TTL that re-arms and
lets it re-trip if the storm is genuinely still running.

**Auto-fixable:** No (operational action + design decision).

---

### [MEDIUM] SA-2026-09-05-04: `get_show_officials` publishes officials' email to cold anon, stewards included

- **Category:** Data Exposure
- **Canonical severity:** P2 · **Source severity:** MEDIUM · **Status:** new · **Confidence:** high
- **Location:** `public.get_show_officials(uuid)`;
  `supabase/migrations/20260830240000_show_officials_separates_label_from_permission.sql:299-337`;
  `apps/myk9show/src/components/shows/overview/ShowOfficials.tsx:28-37`
- **Linear:** [MYK9-402](https://linear.app/myk9-platform/issue/MYK9-402)

**Evidence** — replayed cold, unauthenticated (anon key only, no session):

```
POST /rest/v1/rpc/get_show_officials  {"p_show_id":"75e078e9-…"}   → HTTP 200
[{"first_name":"Test","last_name":"Chairman","email":"chairman@myk9t.com","role":"chairman"},
 {"first_name":"Test","last_name":"Secretary","email":"secretary@myk9t.com","role":"secretary"}]
```

Show ids are anon-enumerable, so this is harvestable at scale.

**The exposure is deliberate and documented** — the migration states anon keeps EXECUTE so the
public officials card renders, "email included", and the card does render a `mailto:` link.
Publishing the trial secretary's contact address is normal for a premium list. Three things sit
outside that rationale:

1. **Stewards.** `show_officials_role_check` permits `steward`, and the RPC and card treat all three
   roles identically. The same migration says "Only the secretary and chairman arms move to
   show_officials." A ring steward's personal email is not premium-list content.
2. **No consent step**, and the address is the person's *account* email from `people` — a table anon
   cannot otherwise read at all (`people_select` is `TO authenticated`).
3. **Silent re-grant.** The migration comments that "the live database has since lost this grant
   outside of any migration" and restores it. An anon grant that had been removed came back as a
   side effect of a refactor.

**This retires the 2026-07-29 rejection of SA-2026-07-29-04** ("`people.email` anon column grant, no
reachable read path"). There is a reachable path; it is this RPC.

**Fix.** Decide the contact-publication policy explicitly and encode it — withhold email for
`steward`, or authenticate the email column, or use a club-provided contact address. Record the
decision in `docs/security/` alongside the CORS-origin policy.

**Auto-fixable:** No (product/policy decision).

---

### [MEDIUM] SA-2026-09-05-05: `replace_judge_qualifications` is unscoped across clubs and grants a DELETE the table withholds

- **Category:** RBAC & Privilege Escalation
- **Canonical severity:** P2 · **Source severity:** MEDIUM · **Status:** new · **Confidence:** high
- **Location:** `supabase/migrations/20260903150000_fix_judge_qualification_rpc_authorization.sql`
- **Linear:** [MYK9-403](https://linear.app/myk9-platform/issue/MYK9-403)

**Evidence.** The RPC gates on `is_site_admin() OR has_role('secretary')`. `has_role` with a NULL
scope matches any club:

```sql
AND (scope_club_id IS NULL OR ur.club_id = scope_club_id OR ur.club_id IS NULL)
```

It then runs `DELETE FROM public.judge_qualifications WHERE person_id = p_person_id` followed by an
INSERT of the caller's payload. The table's own applied policies split write from destroy:

| Policy | Predicate |
| --- | --- |
| `judge_qualifications_insert` | `has_role('secretary') OR has_role('site_admin')` |
| `judge_qualifications_update` | `has_role('secretary') OR has_role('site_admin')` |
| `judge_qualifications_delete` | `has_role('site_admin')` |

**Risk.** Any secretary of any club can wipe or forge any judge's AKC/UKC credentials
platform-wide. A replace with an empty payload is an unrestricted delete. The migration's own
comment states the intent to keep DELETE site-admin-only, so the widening is unintended.

The cross-club scope on INSERT/UPDATE pre-dates this RPC; what the RPC added is the destructive
half.

**Fix.** Scope to a caller↔subject relationship, or restrict the RPC to site admin, or make it
additive rather than delete-then-insert. Write to `permission_audit_log` either way.

**Auto-fixable:** No (authorization-model decision).

---

### [LOW] SA-2026-09-05-06: `ringside_containment` and `ringside_containment_audit` lack RLS

- **Category:** RLS Policy Integrity · **Canonical:** P3 · **Status:** new
- **Linear:** [MYK9-404](https://linear.app/myk9-platform/issue/MYK9-404)

The only 2 of 131 `public` tables with `relrowsecurity = false` **and**
`relforcerowsecurity = false`. Not reachable — `20260731190000_ringside_containment_state.sql:46-51`
revokes `anon` and `authenticated` and grants only `service_role` ("No client grants by design").
Belt without braces: RLS is the layer that survives an accidental future grant, and the repo-wide
invariant is ENABLE + FORCE on every public table.

Also corrects the record: the 2026-07-31 standing baseline asserted "RLS enabled AND forced on all
119 public tables". There are 131 now and two are exempt. **Auto-fixable:** Yes.

---

### [LOW] SA-2026-09-05-07: `view_public_entry_results` omits class soft-delete

- **Category:** Data Exposure · **Canonical:** P3 · **Status:** new
- **Linear:** [MYK9-404](https://linear.app/myk9-platform/issue/MYK9-404)

Top-level WHERE, sliced from `pg_get_viewdef` (indent-anchored, per the CLAUDE.md false-positive
lesson):

```
where e.deleted_at is null and sh.deleted_at is null
  and sh.status = any (array['published','upcoming','in_progress','completed'])
```

`classes` carries `deleted_at` and `soft_delete_class()` exists, so entries of a soft-deleted class
remain publicly visible with released results. Same shape as the now-closed SA-2026-07-29-08, one
level up. The view is `security_invoker = false` and owned by a `BYPASSRLS` role, so its WHERE is
the only guard — carry `WITH (security_invoker = false)` inline on the replacement and re-assert
`reloptions` after the push. **Auto-fixable:** Yes.

---

### [LOW] SA-2026-09-05-08: One secret gate compares with `!==` instead of `timingSafeEqual`

- **Category:** Edge Function Auth · **Canonical:** P3 · **Status:** new
- **Location:** `supabase/functions/send-confirmation-email/auth.ts:13`
- **Linear:** [MYK9-404](https://linear.app/myk9-platform/issue/MYK9-404)

Every sibling gate uses the shared `timingSafeEqual` (`requireFunctionSecret`,
`requirePushWebhookSecret`, `assertWaitlistInviteSecret`). Not practically exploitable over a
network against a high-entropy secret; it is the one outlier in an otherwise consistent set, and
consistency is what keeps the next copy-paste correct. Its unset-secret 503 is already right.
**Auto-fixable:** Yes.

---

### [INFO] SA-027: 19 `SECURITY DEFINER` functions use `search_path=public`

- **Canonical:** P3 · **Status:** unchanged (5th consecutive run) · **Linear:** MYK9-151 (Backlog)
- **Accepted-risk record:** `docs/security/sa-027-search-path-accepted-risk.md`

Re-verified non-exploitable. The precondition still holds — no client role can create objects to
shadow a `public` name:

```sql
select has_schema_privilege('anon','public','CREATE'),          -- false
       has_schema_privilege('authenticated','public','CREATE'),  -- false
       has_schema_privilege('service_role','public','CREATE');   -- false
```

199 `SECURITY DEFINER` functions total: 180 on `search_path=''`, 19 on `search_path=public`, **0**
with no `search_path` at all.

---

## Resolved this run

Each closed on applied evidence, never on a merge.

| ID | Linear | Closure proof |
| --- | --- | --- |
| SA-2026-07-31-01 | MYK9-145 (Done) | All 23 `from('user_roles')` call sites across every edge function pass through `applyActiveRoleValidity`; the **live deployed** `admin-delete-user` v52 bundle carries `ACTIVE_ROLE_NOT_EXPIRED = 'expires_at.is.null,expires_at.gt.now()'`, read via `get_edge_function`. |
| SA-2026-07-29-03 | MYK9-146 (Done) | `has_column_privilege` is **false** for both `anon` and `authenticated` on `judge_assignments.fee` and `.notes`; cold-anon `select=id,fee,notes` → `42501`. |
| SA-2026-07-29-08 | MYK9-149 (Done) | `entries_anon_select_for_tv` USING now reads `(deleted_at IS NULL) AND (show_id IN …)`. |
| SA-2026-07-29-12 | MYK9-148 (Done) | `reserve_askq_query` raises `real account required` on `is_anonymous`, and serialises the count-then-insert under `pg_advisory_xact_lock(hashtextextended('askq:'||uid))`. |
| SA-2026-07-30-02 | MYK9-132 (Done) | Real scheduled healthy snapshot, full run 2026-09-05T07:00:04Z: `anon_grants: ok` ("19 table grants (1 write), 89 column grants, all on the allowlist"); `applied_acl_grants: ok` ("131 authenticated and 131 service_role table grants, 4 public sequences; no forbidden table privileges or sequence default drift"). |
| SA-2026-07-29-06 | MYK9-147 (Done) | All three `judge_assignments` write policies now gate on `is_show_office_manager(show_id)`, whose body admits only site admin, club admin and trial secretary — steward excluded. `is_show_official` retains its steward arm, documented as MYK9-114 intent. |
| SA-2026-07-29-05 | MYK9-150 (Done) | Resolved as an accepted-risk decision, not a code change: the preview regex `^https://myk9-platform-myk9show-[a-z0-9-]+\.vercel\.app$` remains, now scoped and documented in `supabase/functions/_shared/http/cors.ts:16-19` and `docs/security/cors-origin-policy.md`. |

## Still blocked

| ID | Linear | Why |
| --- | --- | --- |
| SA-2026-07-29-11 | MYK9-125 (Todo) | The authorization half is closed and provable: `generate-premium/authz.ts` rejects `is_anonymous` explicitly and requires `can_manage_show OR is_show_secretary`, failing closed on a check error, evaluated **before** the show fetch and the model call. The stated remaining proof — an authorized paid smoke and an account-wide generation budget decision — still has no evidence. Unchanged from 2026-07-31. |

## Not re-raised

- **SA-2026-07-29-01 / MYK9-127 (hide counts).** Closed per the 2026-08-27 correction in the prior
  report and MYK9-116/127 (both Done). Re-verified incidentally: `get_show_class_hide_counts` is
  `SECURITY DEFINER` with a full manager/steward/assigned-judge/passcode-generation gate, and
  `classes.num_hides`, `has_blank` and `hides_known` carry no anon column grant.
- **"23 `/admin/*` routes unguarded".** Still a false signal — every admin route wraps
  `adminGuard()`. Route diffs since 2026-08-08 add `/secretary/tasks` (wrapped in
  `<ProtectedRoute requiredRole={[SECRETARY, SITE_ADMIN]}>`) and `/sms` + `/fees`, both
  deliberately public with in-file rationale.
- **SA-2026-07-29-04** as a *direct-read* finding: cold-anon `people?select=id,email` returns
  `HTTP 200 []` — the column grant exists but no RLS policy admits `anon`. The rejection of the
  direct-read path stands; the reachable path is SA-2026-09-05-04.
- **SA-2026-07-29-10** (advisor disposition COMMENTs). Cosmetic; the 6 `rls_enabled_no_policy`
  tables are all service-role-only by design.

---

## Categories checked

| Category | Scope examined | Findings |
| --- | --- | --- |
| RLS Policy Integrity | 131 tables, 12 views, all `pg_policy` rows, 15 `storage.objects` policies, 3 buckets, 4 sequences | 3 (SA-…-01, -06, -07) |
| Edge Function Auth | 45 deployed functions (all `verify_jwt: false`), 33 repo + 12 app-level, plus `_shared` gates | 2 (SA-…-02, -08) |
| RBAC & Privilege Escalation | `user_roles`/`roles`/`permissions`/`role_permissions` policies; 199 `SECURITY DEFINER` functions; 60 volatile definer functions granted to `authenticated`; 14 anon-executable definer functions | 2 (SA-…-05, SA-027) |
| Client Auth Patterns | route diffs since 2026-08-08, `ProtectedRoute` coverage, hardcoded-secret grep across `apps/myk9show/src` + `packages` | 0 |
| Data Exposure | `pg_attribute.attacl` (89 anon column grants), 3 owner-run views, 41 cold-anon endpoint probes | 1 (SA-…-04) |
| Payment Security (Stripe) | `stripe-webhook`, `-checkout`, `-customer-portal`, `-connect-onboard`, `-payment-link`, `-refund-entry`, `-refund-show`, `-upgrade-subscription`, `cron-process-payouts` | 1 (SA-…-02, shared with Edge Auth) |
| Input Validation | `dangerouslySetInnerHTML` sites, redirect-URL validation, PostgREST embed probes | 0 |
| *(incidental)* Availability | health board + `ringside_containment` live state | 1 (SA-…-03) |

### Verified good — re-proved this run, not assumed

- **RLS:** enabled and forced on **129 of 131** public tables (the 2 exceptions are SA-…-06). 6
  tables have RLS with no policy, all service-role-only by design.
- **Anon surface:** 19 anon table grants, 89 anon column grants, all on the monitor's allowlist.
  Cold-anon probes returned `42501` for `user_roles`, `judge_qualifications`, `show_officials`,
  `classes.num_hides`, `entries.total_score`, `calendar_feed_tokens`, `trial_packet_snapshots`,
  `show_passcodes`, `view_authenticated_entry_results`.
- **Every table created in the last 30 days** (`calendar_feed_tokens`, `show_eve_nudge_log`,
  `trial_packet_snapshots`, `sms_opt_in_attempts`, `trial_packet_generation_claims`,
  `trial_packet_print_reminders`, `sms_proximity_sends`, `show_officials`) has RLS enabled+forced
  and **zero** anon privileges of any kind — the `ALTER DEFAULT PRIVILEGES` trap did not fire once.
- **PostgREST embeds:** column-level grants are sufficient for embedded relations on the current
  server — cold-anon `shows?select=id,trials(id,classes(id,name))` and
  `entries?select=id,classes!inner(id,name)` both return 200 against tables with **no** table-level
  SELECT. The failure mode in the CLAUDE.md lesson does reproduce in its join-column form:
  `entries?select=id,people(id,email)` returns `42501` because the join column is not granted, and
  it fails the whole request — in the safe direction.
- **Views:** none of the 12 is auto-updatable, so no write can be laundered through an owner-run
  view. The 3 `security_invoker = false` views each carry a real top-level guard;
  `view_authenticated_entry_results` nulls every admin and score column behind
  `can_view_admin` / `can_view_scores`, and `view_authenticated_entry_results_replication` is a
  thin wrapper over it.
- **Sequences:** 4 public sequences; only `registration_confirmation_seq` is granted (USAGE to
  `authenticated`, matching the trigger's `nextval()`); no anon USAGE anywhere.
- **RBAC tables:** `user_roles`, `roles`, `permissions`, `role_permissions` all restrict
  INSERT/UPDATE/DELETE to `is_site_admin()`/`is_platform_admin()`; `user_roles_select` is
  self-or-site-admin.
- **Anonymous sign-in blast radius:** only 16 unconditional `USING (true)` SELECT policies remain
  (down from 32 at the 2026-07-29 baseline), all reference or public data — rules, templates, clubs,
  achievements, armbands, visibility settings, judge assignments. No account, contact or volunteer
  table among them.
- **Stripe:** `stripe-webhook` verifies via `constructEventAsync` with platform→Connect secret
  fallback, 400s on a missing signature, and throws at module load on any missing env var. Entry
  prices are reconciled against authoritative show pricing server-side before the session;
  subscription prices go through a `VALID_PRICE_IDS` allowlist. Every `success_url`/`cancel_url`/
  `return_url` is origin-validated, and `buildRedirectUrl` rejects `//`-prefixed paths. Refund authz
  is evaluated **as the caller** via `is_show_secretary`/`is_club_admin`/`is_site_admin`, capped
  against the entry fee, payout-lock aware, and fails closed on an unreadable payout row. No Stripe
  secret reaches the frontend — only `VITE_STRIPE_PRICE_*`.
- **Ringside write authz:** `ringside_update_entry` separates manager, assigned-judge, steward and
  passcode-claim tiers, applies a per-tier column allowlist (stewards get run-order/check-in only,
  never scoring), enforces passcode-generation currency on claim-only callers, and resolves the
  allowlist **before** any OCC conflict response so an unauthorized caller cannot probe versions.
- **Input validation:** both `dangerouslySetInnerHTML` sites route through DOMPurify
  (`utils/sanitization.tsx`), and `LegalPage` renders a static markdown asset. No hardcoded secret
  in shipped source — every `SUPABASE_SERVICE_ROLE_KEY` reference is a Node-side `process.env` read
  in a test or load harness.

---

## Coverage gaps (gaps, not passes)

1. **Composed anonymous-session replay.** Creating a bare anonymous identity is an un-rollback-able
   auth write. The anonymous blast radius above is derived statically from the policy set, not
   replayed. *(Carried from 2026-07-29 and 2026-07-31.)*
2. **Authenticated-role live probing.** No signed-in session was established, so every
   `authenticated`-role claim rests on policy and ACL inspection rather than a live request.
3. **The SA-2026-09-05-01 exploit path was not executed.** Renaming a show and writing to storage
   are both shared-system writes. The mechanism is proved from the applied policy text; the
   end-to-end escalation is not.
4. **SA-2026-09-05-02's unset-secret case was not probed.** Sending `x-function-secret: undefined`
   to `cron-health-check` would have written a snapshot row if the finding were live, and to
   `cron-process-payouts` would have moved money. Neither was attempted. The secret being present
   today was established indirectly, from cron success.
5. **MYK9-145's own closure bar was not met.** The issue demands a disposable-deployment
   assign→expire→deny replay. This run proved the code contract and the deployed artifact. The
   issue is already Done and was not reopened, but the live expiry replay remains unrun.
6. **Behavioural SQL tests have never executed locally** (no container runtime on this host). CI is
   always their first real run.
7. **`images` / `premium-published` are `public = true` buckets.** Whether user profile and dog
   photos should be world-readable by URL is a product decision that has still not been recorded.
   *(Carried from 2026-07-31.)*

## Notes on process

- **Label taxonomy.** The task specified Linear labels `p0`/`p1`, `source:claude`,
  `audit:security`. None exists in this workspace, whose established convention (used by MYK9-145,
  -146, -149 and every prior audit issue) is the `Claude` and `Bug` labels plus the priority field.
  Rather than mint four divergent labels unattended, findings were filed as `Claude` + `Bug` with
  priority Urgent (P0) and High (P1). Worth settling one way or the other before the next run.
- **Linear writes:** all 7 succeeded. Nothing is unfiled.

## Previous audit comparison

Against `docs/security-audit-2026-07-31.md` (baseline `1f5ccb8a4`): of its 10 active findings, 6 are
resolved on applied proof, 1 (SA-027) is unchanged and non-exploitable, 1 (SA-2026-07-29-11) is
still blocked on the same missing evidence, 1 (SA-2026-07-29-01) was closed by the 2026-08-27
correction, and 1 rejected candidate (SA-2026-07-29-07) is **reopened at higher severity** as
SA-2026-09-05-01 after re-reading the mechanism rather than the arming state. Eight findings are
new. Net direction is good: the anon surface narrowed measurably, the edge role-validity contract is
now uniform and deployed, and the ACL monitor produced its first real healthy snapshot.

## Finding ledger

```text
SA-2026-09-05-01 | P0 | HIGH   | new       | 2026-09-05/2026-09-05 | 1 | MYK9-398 | storage show-branding policies test shows.name, not objects.name; uncorrelated EXISTS ⇒ blanket images/shows/** write once a show is renamed x/<own uuid>; 0/10 shows armed today | secretary denied 42501 on another club's prefix, before AND after the rename
SA-2026-09-05-02 | P1 | HIGH   | new       | 2026-09-05/2026-09-05 | 1 | MYK9-399 | cron-health-check + cron-process-payouts hash Deno.env.get(...)! with no null guard; encode(undefined)=="undefined" ⇒ open on unset secret; secrets set today (289 snapshots/24h) | unit test with getEnv->undefined returns non-2xx and no side effect, mutation-checked
SA-2026-09-05-03 | P0 | HIGH   | new       | 2026-09-05/2026-09-05 | 1 | MYK9-400 | ringside_containment state=contained for 10d09h since 2026-08-25T23:25Z; 0 conflicts/min; 250ms backpressure on every write; no auto-rearm | live state=armed + ringside_conflicts ok, plus a test proving unaided recovery
SA-2026-09-05-04 | P2 | MEDIUM | new       | 2026-09-05/2026-09-05 | 1 | MYK9-402 | cold-anon rpc/get_show_officials returned chairman+secretary names and emails, HTTP 200; steward role eligible and outside the migration's stated rationale | cold-anon call showing the agreed projection, plus a contract test on the anon column set
SA-2026-09-05-05 | P2 | MEDIUM | new       | 2026-09-05/2026-09-05 | 1 | MYK9-403 | replace_judge_qualifications gates on unscoped has_role('secretary') and DELETEs, while judge_qualifications_delete is site_admin-only | rolled-back psql: club-A secretary denied for an unrelated judge; authorized caller still succeeds
SA-2026-09-05-06 | P3 | LOW    | new       | 2026-09-05/2026-09-05 | 1 | MYK9-404 | ringside_containment + _audit are the only 2 of 131 public tables without ENABLE/FORCE RLS; no client grants so unreachable | relrowsecurity and relforcerowsecurity true on both, sampler still writing
SA-2026-09-05-07 | P3 | LOW    | new       | 2026-09-05/2026-09-05 | 1 | MYK9-404 | view_public_entry_results top-level WHERE omits classes.deleted_at IS NULL; owner-run view, its WHERE is the only guard | cold-anon read excludes a soft-deleted class; reloptions still security_invoker=false after push
SA-2026-09-05-08 | P3 | LOW    | new       | 2026-09-05/2026-09-05 | 1 | MYK9-404 | send-confirmation-email/auth.ts:13 uses !== where every sibling gate uses the shared timingSafeEqual | source uses timingSafeEqual
SA-027           | P3 | INFO   | unchanged | 2026-07-10/2026-09-05 | 6 | MYK9-151 | 19 of 199 secdef fns on search_path=public; CREATE on schema public false for anon/authenticated/service_role | empty search_path, or the accepted-risk doc kept current
SA-2026-07-29-11 | P1 | HIGH   | blocked   | 2026-07-29/2026-09-05 | 4 | MYK9-125 | authz half proven closed (anonymous rejected, manager predicates, fail-closed, pre-cost); paid smoke + account budget still unevidenced | authorized paid smoke + role denial matrix + account-wide budget decision
RESOLVED: SA-2026-07-31-01 (MYK9-145), SA-2026-07-29-03 (MYK9-146), SA-2026-07-29-05 (MYK9-150),
          SA-2026-07-29-06 (MYK9-147), SA-2026-07-29-08 (MYK9-149), SA-2026-07-29-12 (MYK9-148),
          SA-2026-07-30-02 (MYK9-132)
SUPERSEDED: SA-2026-07-29-07 rejection -> SA-2026-09-05-01
CORRECTED:  SA-2026-07-29-04 rejection premise -> reachable via SA-2026-09-05-04
REJECTED (re-confirmed): "23 /admin/* routes unguarded"
```
