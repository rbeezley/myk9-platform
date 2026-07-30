# Security Audit — 2026-07-29

- **Mode:** Full Audit (`/security-audit --full`)
- **Detecting task:** `daily-security-audit` / `nightly-full-security-audit`
- **Source:** Codex, with an independent `/codex:review`
- **Baseline SHA:** `58bd0b91d5f15e5d2d1d0f5ac3c398ade8558e56` (`main` = `origin/main`; clean before this report)
- **Prior same-day baseline:** `39ed30dc803a016563768945c5fc672ea4311af2`
- **Checklist:** `.agents/skills/security-audit/references/checklist.md` (`sha256:4a1258e1963db8be`)
- **Finding contract:** `quality-finding-lifecycle`

**Method:** static source audit. The same-day prior report's read-only database evidence was reconciled,
but live HTTP/database probes were not repeated because the security-audit skill excludes runtime testing.

## Summary

| Source severity | Count |
| --- | ---: |
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 4 |
| LOW | 1 |
| INFO | 2 |
| **Total current ledger** | **10** |

| Canonical launch severity | Count |
| --- | ---: |
| P0 | 1 |
| P1 | 2 |
| P2 | 4 |
| P3 | 3 |

| Lifecycle transition | Count | Meaning |
| --- | ---: | --- |
| new | 3 | SA-2026-07-29-11 through -13 |
| unchanged | 7 | Reconfirmed findings/informational records |
| resolved | 0 | No finding was closed from code alone |
| duplicate | 1 | SA-2026-07-29-09 is the prior alias for canonical SA-027 |
| rejected | 3 | SA-2026-07-29-04, -07, and -10 |
| blocked | 0 findings | Five coverage gaps are recorded separately |

Auto-fixable: **3 of 10** (SA-2026-07-29-03, SA-2026-07-29-08, and
SA-2026-07-29-13). **7 require a design or policy decision.**

Classification counts: security/data exposure **4**; authorization/integrity **2**; AI cost abuse
**2**; informational hardening **2**.

### CRITICAL/HIGH at a glance

- **SA-2026-07-29-01 — HIGH/P0:** cold anon can read undisclosed scent-work hide counts and blank
  flags before a class runs. Independently **confirmed**. Existing issue:
  [MYK9-116](https://linear.app/myk9-platform/issue/MYK9-116).
- **SA-2026-07-29-02 — HIGH/P1:** a self-service anonymous Auth user receives the
  `authenticated` database role and reaches unconditional reads including volunteer PII and audit
  data. Independently **confirmed**. Existing issue:
  [MYK9-117](https://linear.app/myk9-platform/issue/MYK9-117).
- **SA-2026-07-29-11 — HIGH/P1:** any authenticated identity, including an anonymous Auth user,
  can invoke paid premium generation for every public-status show without a manager role.
  Independently **confirmed**. Issue:
  [MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125).

## Findings

### [HIGH] SA-2026-07-29-01: Anon reads secret hide counts and blank flags for unrun classes

- **Classification/status:** security exposure; **unchanged**
- **Canonical/source severity:** **P0 / HIGH**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **2**
- **Affected role/workflow:** unauthenticated competitor; scent-work class preparation and scoring
- **Route/object/files:** `public.classes`; migration
  `supabase/migrations/108_tv_display_anon_access.sql:50-66`;
  `supabase/migrations/002_shows_and_events.sql:161-163`;
  `supabase/migrations/033_add_class_rule_columns.sql:7-10`
- **Existing references:** MYK9-116; prior version of this report
- **Independent review:** **confirmed HIGH/P0**

**Observed evidence.** The final `classes_select` policy exposes every non-deleted class belonging
to a public-status show. The applied-database proof recorded by the prior same-day audit showed
`anon` table-level SELECT and returned populated `num_hides` and `has_blank` values for upcoming
classes whose `hides_known` value was false. No current-main change touches the policy or grants.

**Attack path.** With the browser-shipped anon key and no account or passcode, request
`classes?select=id,name,hides_known,num_hides,has_blank&hides_known=is.false`. The response reveals
the exact count and whether the area is blank before the competitor runs.

**Expected vs observed.** Competitors must not receive undisclosed search configuration; the base
table returns it because RLS controls rows, not sensitive columns.

**Impact/confidence:** decisive score/result integrity advantage; **high confidence**. Client code
does not need these columns, so this is surplus public privilege.

**Next action:** decide which ringside roles may read the fields and add a column allowlist or
claim-aware view. **Auto-fixable: No.**

**Closure proof:** a cold-anon query for `num_hides` must fail or return no protected fields; an
exhibitor account must also be denied before release; authorized judge/steward workflows and public
show pages must pass regression tests.

### [HIGH] SA-2026-07-29-02: Anonymous Auth users reach unconditional authenticated reads

- **Classification/status:** cross-tenant data exposure; **unchanged**
- **Canonical/source severity:** **P1 / HIGH**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **2**
- **Affected role/workflow:** any internet user; account-less ringside session
- **Route/object/files:** Supabase anonymous sign-in;
  `apps/myk9show/src/pages/ringsideAnonSession.ts:47-75`;
  `supabase/migrations/20260712160000_exclude_anon_from_platform_settings_sync_conflicts_select.sql`;
  `supabase/migrations/20260727130000_rls_initplan_wrap_auth_calls.sql:74-78`; unconditional policies
  on volunteers, activity logs, RBAC catalogs, scoring/checklist, announcements, and reference tables
- **Existing references:** MYK9-117; MYK9-93; MYK9-22
- **Independent review:** **confirmed HIGH/P1**

**Observed evidence.** Anonymous sign-in is load-bearing for passcode ringside access and gives the
session the PostgreSQL `authenticated` role. Thirty-two SELECT policies catalogued in the prior
same-day audit use `USING (true)` or `auth.uid() IS NOT NULL`; most do not exclude
`is_anonymous=true`. `volunteers` includes name, email, phone, and notes; `activity_log` includes
actor IDs/names and metadata. The repository already has the correct `is_anonymous IS NOT TRUE`
pattern, but only on two tables.

**Attack path.** Obtain an anonymous Auth JWT (a CAPTCHA may increase effort but does not change the
database role), then query an affected REST table. The composed replay was not run because it would
create a persistent `auth.users` row; both authorization halves are present in source and the Auth
setting was verified by the prior same-day audit.

**Expected vs observed.** An anonymous ringside identity should read only data authorized by its
server-stamped `(kind, show_id, ringside_role, passcode_generation)` claim. A bare anonymous identity
instead inherits broad account reads.

**Impact/confidence:** volunteer PII, audit metadata, and platform-wide operational data become
internet-readable as rows are populated; **high confidence**, with the end-to-end replay blocked.

**Next action:** add a reusable real-account predicate, apply it to every unconditional
authenticated read, and separately show/club-scope volunteers. Do not disable anonymous sign-in.
**Auto-fixable: No.**

**Closure proof:** in a disposable environment, a bare anonymous session must receive zero rows or
`42501` from volunteers/activity/RBAC catalogs while a valid stamped passcode session still passes
the complete ringside read/write flow.

### [HIGH] SA-2026-07-29-11: `generate-premium` mistakes public show visibility for manager authorization

- **Classification/status:** authorization bypass and AI cost abuse; **new**
- **Canonical/source severity:** **P1 / HIGH**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **1**
- **Affected role/workflow:** anonymous Auth user or ordinary authenticated user; premium generation
- **Route/object/files:** `supabase/functions/generate-premium/index.ts:17-75,149-183`;
  `supabase/functions/generate-premium/premiumRateLimit.ts:3-58`;
  `supabase/migrations/20260606204100_include_show_scoped_secretary_drafts.sql:10-23`;
  `supabase/migrations/20260712120000_premium_generation_throttle.sql:38-108`
- **Existing references:** [MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125);
  related resolved SA-025 and MYK9-22
- **Independent review:** **confirmed HIGH/P1**

**Observed evidence.** The function accepts every valid JWT. Its authorization comment says the
`shows` SELECT returns a row only for a site admin, club admin, or secretary, but the current
`shows_select` policy deliberately returns every published/upcoming/in-progress/completed show to
everyone. The function then invokes Sonnet. Its limiter allows five attempts per `user.id + show_id`
per 15 minutes, so switching among public show IDs bypasses a user-wide ceiling even before changing
accounts. Anonymous Auth session rotation also resets the identity key.

**Attack path.**

1. Obtain any authenticated JWT, including a self-service anonymous one.
2. Enumerate public show IDs through the intended public `shows_select` policy.
3. POST each ID to `generate-premium`; each show permits five paid generations per identity.
4. Rotate public shows and, if desired, anonymous sessions to continue.

No club/show role, subscription, entry, or passcode is required. Template RLS may return no template,
but the paid model call still runs.

**Expected vs observed.** Premium generation is an office/manager operation and unauthorized callers
must be rejected before rate-limit accounting or Anthropic. The endpoint currently treats row
visibility as management authority.

**Impact/confidence:** externally triggerable model spend and resource consumption; no protected
tenant data was found in the returned show payload; **high confidence**.

**Next action:** reject anonymous identities, use an explicit server-side show-manager predicate,
and add an account-wide cost ceiling in addition to the per-show limiter. **Auto-fixable: No.**

**Closure proof:** edge tests must prove anonymous and authenticated non-manager callers receive
403 before the limiter/model call; authorized secretary/club-admin/site-admin calls must work; a
cross-show quota test must enforce the chosen account-wide ceiling.

### [MEDIUM] SA-2026-07-29-03: Public judge assignments expose `fee` and `notes`

- **Classification/status:** confidential data exposure; **unchanged**
- **Canonical/source severity:** **P2 / MEDIUM**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **2**
- **Affected role/workflow:** cold anon; judge contracting and public show details
- **Route/object/files:** `public.judge_assignments`; migration
  `supabase/migrations/006_rls_policies.sql:269`;
  policy rationale in `supabase/migrations/20260725150000_anon_tighten_permissive_selects.sql:80-81`
- **Existing references:** none
- **Independent review:** **confirmed MEDIUM/P2**

The policy intentionally publishes who judges which ring, but table-level anon SELECT also publishes
the confidential `fee` and unrestricted `notes` columns. The prior applied-database query returned
those columns; current fees were null, so exploitation requires a club to populate them.

**Attack path:** cold-anon REST SELECT of `judge_assignments?select=show_id,person_id,fee,notes`.
**Expected:** public judge identity/schedule only. **Impact:** judge compensation or internal notes
become public. **Confidence:** high.

**Next action:** revoke table SELECT and grant a safe public column allowlist. **Auto-fixable: Yes.**

**Closure proof:** cold anon receives `42501` for `fee`/`notes`, while the public judge panel still
renders from allowlisted fields.

### [MEDIUM] SA-2026-07-29-06: `is_show_official()` gives stewards office-administration authority

- **Classification/status:** role-scope authorization flaw; **unchanged, scope broadened**
- **Canonical/source severity:** **P2 / MEDIUM**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **2**
- **Affected role/workflow:** active account steward; show administration
- **Route/object/files:** `supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql:49-101`;
  `supabase/migrations/20260728131000_split_showday_manage_read_rls.sql:5-70`;
  `supabase/migrations/130_rename_registrations_to_enrollments.sql:39-49`;
  `docs/INTENT.md:55-59,189-231`
- **Existing references:** none
- **Independent review:** **confirmed MEDIUM/P2**, and confirmed enrollment access in addition to the
  prior judge-assignment/email-log scope

`is_show_official()` explicitly includes active, unexpired stewards. Policies use it to let the
caller insert/update/delete judge assignments, read show email logs, and insert/update/select
enrollments. Migration 163 says the enrollment policies exist so secretaries and club admins can
enter mail submissions, yet the helper also admits stewards. The product intent confines stewards to
ring flow. Anonymous passcode claims do not satisfy this helper; the affected principal is a
persisted steward role.

**Attack path:** an authenticated active show/club-scoped steward submits direct PostgREST writes to
judge assignments or enrollments for that show. RLS accepts them through `is_show_official()`.

**Expected vs observed:** stewards manage run order/check-in; office staff manage contracts,
enrollments, and communications. **Impact:** show-scoped entry and judge-panel integrity plus
operational-data access. **Confidence:** high.

**Next action:** split office-management and show-day-read predicates, then repoint each policy by
intent. **Auto-fixable: No.**

**Closure proof:** a real steward token must fail judge-assignment and enrollment mutations and
email-log reads, while ringside run-order/check-in remains functional; secretary, club admin, and
site admin paths must pass.

### [MEDIUM] SA-2026-07-29-12: AskQ accepts disposable anonymous identities and has a racy quota

- **Classification/status:** AI cost abuse; **new**
- **Canonical/source severity:** **P2 / MEDIUM**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **1**
- **Affected role/workflow:** anonymous Auth user; AskQ rules/help queries
- **Route/object/files:** `supabase/functions/ask-myk9show/index.ts:41,93-199,309-398`;
  atomic precedent `supabase/migrations/20260724180000_reserve_operator_support_query.sql:15-96`
- **Existing references:** related MYK9-22 and MYK9-26; no duplicate Linear issue found
- **Independent review:** **confirmed MEDIUM/P2**

AskQ accepts any `auth.getUser()` result without rejecting `is_anonymous`. An anonymous user has no
person row, so it receives the free quota of 10 model calls per day. Rotating anonymous identities
resets that quota. For one identity, the implementation counts rows and then inserts a provisional
row in separate operations; concurrent requests can observe the same count, and insert errors are
ignored. The operator-support endpoint already uses an advisory-lock reservation RPC, proving the
atomic pattern is available.

**Attack path:** obtain/rotate anonymous Auth sessions, send rules/help questions that need no show
relationship, and burst parallel requests before provisional rows become visible.

**Expected vs observed:** paid AI access should require an accountable identity and an atomic quota.
**Impact:** model spend and resource consumption. AskQ show-data tools were separately traced and
fail closed to a verified show relationship, so no tenant-data exposure was found. **Confidence:** high.

**Next action:** reject bare anonymous users or bind AI access to a durable entitlement, then reserve
quota atomically. **Auto-fixable: No.**

**Closure proof:** anonymous JWTs must be rejected before logging/model calls; parallel requests at
the limit must allow exactly the remaining slots; ordinary authenticated AskQ and verified show
scoping must still pass.

### [MEDIUM] SA-2026-07-29-13: RBAC SECURITY DEFINER RPCs disclose arbitrary users' access context

- **Classification/status:** cross-user authorization metadata disclosure; **new**
- **Canonical/source severity:** **P2 / MEDIUM**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **1**
- **Affected role/workflow:** any authenticated account, including anonymous Auth; RBAC lookup
- **Route/object/files:** `supabase/migrations/20260729160000_optimize_rbac_auth_lookup.sql:18-271`;
  `apps/myk9show/src/services/rbac/PermissionChecker.ts:103-223`;
  `apps/myk9show/src/context/useRbacLifecycle.ts:73-168`
- **Existing references:** MYK9-114 covers performance only and is not a duplicate
- **Independent review:** **confirmed MEDIUM/P2**

Four SECURITY DEFINER functions—`get_user_permissions`, `user_has_permission`, `get_user_roles`,
and `get_effective_permissions`—accept a caller-supplied `user_id`, bypass table RLS, and grant
EXECUTE to `authenticated`. None requires `user_id = auth.uid()` or a site-admin exception.
`get_user_roles` returns role and show/club scope, granter UUID, grant time, expiry, and activity.

**Attack path.** A normal user can obtain an auth UUID from their own role's `granted_by` value or,
when populated, the broadly readable `activity_log.actor_id`. Calling the four RPCs with that UUID
reveals the target's roles, scopes, and effective permissions. Anonymous Auth users can use the same
RPCs when they obtain a target UUID.

**Expected vs observed:** non-admin callers should resolve only their own access context. **Impact:**
cross-user and cross-tenant authorization reconnaissance; no role write or server-side privilege
escalation was found because mutations retain independent admin RLS. **Confidence:** high.

**Next action:** enforce self-or-site-admin inside every function and keep the existing fail-closed
client behavior. **Auto-fixable: Yes.**

**Closure proof:** an exhibitor calling each RPC with another user's UUID must receive `42501`;
self-lookups and approved admin inspection must pass; role mutation policies must remain admin-only.

### [LOW] SA-2026-07-29-08: Public entries policy omits entry-level soft delete

- **Classification/status:** stale public data exposure; **unchanged**
- **Canonical/source severity:** **P3 / LOW**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **2**
- **Affected role/workflow:** cold anon; TV/running-order reads
- **Route/object/files:** `supabase/migrations/108_tv_display_anon_access.sql:12-21`
- **Existing references:** none
- **Independent review:** **confirmed LOW/P3**

`entries_anon_select_for_tv` checks the show's `deleted_at`, not the entry's. A soft-deleted entry in
a public-status show remains reachable through the safe anon column allowlist, exposing stale
identity/scheduling data but not protected payment/score columns.

**Next action:** add `entries.deleted_at IS NULL`. **Auto-fixable: Yes.**

**Closure proof:** a soft-deleted entry must be absent from cold-anon REST, public views, TV display,
and replication-backed public reads.

### [INFO] SA-2026-07-29-05: Preview CORS regex is broad but no victim attack path exists

- **Classification/status:** informational hardening; **unchanged, downgraded MEDIUM → INFO**
- **Canonical/source severity:** **P3 / INFO**
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-29; 2026-07-29; **2**
- **Location:** `supabase/functions/_shared/http/cors.ts:29-47`
- **Independent review:** **downgraded to INFO/P3**

The regex accepts any matching `myk9-platform-myk9show-*.vercel.app` origin. No function enables
credentialed cookies, and protected calls require bearer tokens an attacker origin cannot read.
Server-side callers are not constrained by CORS. No unauthorized data/capability path was
established, so this is not a vulnerability.

**Next action:** optionally replace the regex with environment-provided exact preview origins.
**Auto-fixable: No** without the deployment-origin policy. Closure is an allowlist contract test.

### [INFO] SA-027: SECURITY DEFINER functions use `search_path=public`

- **Classification/status:** informational hardening; **unchanged**
- **Canonical/source severity:** **P3 / INFO** (downgraded from LOW)
- **Baseline / first seen / last seen / runs:** `58bd0b91d`; 2026-07-10; 2026-07-29; **3**
- **Alias:** SA-2026-07-29-09 is **duplicate** of this canonical ID
- **Independent review:** **duplicate confirmed; INFO/P3**

Twenty-one SECURITY DEFINER functions pin `search_path=public` instead of the repository's newer
empty-path idiom. The same-day applied-database evidence showed `anon`, `authenticated`, and
`service_role` lack `CREATE` on `public`; therefore they cannot place a shadowing object and no
exploit path exists. Keep as accepted consistency hardening, not an open vulnerability.

**Next action/closure:** either document the accepted schema-ACL dependency or fully qualify each
body and set `search_path=''`, with focused tests. **Auto-fixable: No.**

## Rejected and duplicate transitions

| Prior ID/candidate | Current status | Evidence |
| --- | --- | --- |
| SA-2026-07-29-04 (`people.email` anon column grant) | **rejected** | Migration `20260725180000` explicitly limits the grant to public embeds; `people_select` remains `TO authenticated`, so direct/embed rows are null. Revocation previously broke the public show route. No current email disclosure path. |
| SA-2026-07-29-07 (show-branding storage predicate) | **rejected as security** | The unqualified `name` binds to the inner show title, making the secretary limb fail closed. This remains a P2 product/correctness defect, not unauthorized access, and belongs outside the security ledger. |
| SA-2026-07-29-09 | **duplicate** | Reuse canonical SA-027. |
| SA-2026-07-29-10 (missing advisor comments) | **rejected** | Current source already comments all six no-policy tables in migrations `20260712130000`, `20260712170000`, and `20260728120000`. A live mismatch would be deployment drift, not missing source. |
| Anonymous session → RBAC RPC chain | **duplicate attack leg** | Covered by SA-2026-07-29-02 (bare anonymous role) and SA-2026-07-29-13 (arbitrary-user RPCs), not a third defect. |
| Admin routes unguarded | **rejected, retained** | `adminGuard()` wraps the routes in `ProtectedRoute`. |
| `send-results` trusts `app_metadata` | **rejected, retained** | Authorization queries active/unexpired `user_roles`; the grep hit was a comment. |

## Categories Checked

| Category | Scope examined | Findings | Incomplete/blocked |
| --- | --- | ---: | --- |
| RLS Policy Integrity | 429 migration files inventoried; final policies/grants/helpers and prior 119-table applied proof reconciled | 01, 02, 03, 08 | Applied DB not re-queried |
| Edge Function Auth | all 35 `index.ts` entrypoints inventoried; complete implicated functions/shared helpers read | 11, 12; INFO 05 | No live model/anonymous invocation |
| RBAC & Privilege Escalation | roles/permissions/user_roles policies; final helper bodies; client callers; current-main RBAC delta | 06, 13; INFO SA-027 | No role-token live replay |
| Client Auth Patterns | auth lifecycle, anonymous-session flow, 15 route files, current Auth/RBAC delta | 02 | Static only |
| Data Exposure | AskQ service-role tools and scope helper; grants/policies; public/replication paths; error/logging sinks | 01, 02, 03, 08, 13 | Public bucket object inventory not replayed |
| Payment Security | 9 Stripe/refund/payout entrypoints plus shared locks/calculators and withdrawal snapshots | 0 | No paid/refund/payout smoke |
| Input Validation | request parsing, UUID/redirect validation, HTML sinks, uploads/forms/params inventory | 0 | Static only |

### Focus areas with no concrete finding

- **AskQ tenant data:** caller JWT is verified; requested show context is accepted only after an
  active show role or owned-dog entry check; every service-role tool applies `showScope`, which
  fails closed to an impossible UUID. The only AskQ finding is quota/cost abuse.
- **Anonymous passcode claims (PRs #951-954):** `validate-passcode` stamps server-derived
  `app_metadata` only onto anonymous users; generation is atomic and revocable; the ringside view
  and `ringside_update_entry` recheck show, role, and generation. Judge/steward field write lists are
  explicit and cross-show claims fail closed.
- **Judge writes:** assigned judges and passcode judges use the scoped ringside RPC. The separate
  steward-account overreach is SA-2026-07-29-06.
- **Multi-registry support (PRs #1040-1056):** registry helpers, generated catalogs, mapper chains,
  premium ordering, move-ups, landing/email surfaces, and current trial `registry_id` consumers were
  traced. No registry value crossed an authorization boundary or widened tenant scope.
- **Withdrawal snapshots/refunds:** checkout/payment-link amounts remain server authoritative;
  webhook snapshot stamping resolves policy server-side; a missing snapshot forces manual handling;
  refund endpoints authorize the caller as secretary/club admin/site admin and recheck payout state
  under the show money lock.
- **Stripe/payout:** webhook signatures use the correct platform/Connect secrets; price IDs and
  redirect origins are allowlisted; customer/Connect records are livemode-scoped; payout cron uses a
  constant-time secret check, recomputes amounts under a money lock, and reconciles Stripe transfers
  by `transfer_group` before sending. No concrete payment manipulation path was found.
- **Replication boundaries:** core ringside reads/writes stay on the claim-aware view/RPC and
  replication layer. No direct client PostgREST bypass of the score-write whitelist was found.

## Verification

Focused static-contract verification passed:

- **16 test files / 110 tests passed** across RBAC lookup, premium throttling, passcode claim
  revocation, withdrawal-policy snapshots/refunds, AskQ show scope, Stripe checkout/payment links,
  livemode separation, capacity, and webhook entry reconciliation.
- `git diff --check` and the final docs status check are recorded after report generation.

## Previous Audit Comparison

The prior contents of this report audited baseline `39ed30dc8`. Current `main` adds the RBAC
optimization in PR #1522 and the prior report commit. The only security-relevant code delta is the
RBAC client/RPC rewrite; its arbitrary-user behavior is SA-2026-07-29-13. No RLS table, Stripe,
ringside, AskQ, or registry authorization source changed between baselines.

| Prior tracked item | Transition |
| --- | --- |
| SA-2026-07-29-01, -02, -03, -06, -08 | **unchanged**, independently confirmed |
| SA-2026-07-29-05 | **unchanged**, downgraded to INFO |
| SA-2026-07-29-04, -07, -10 | **rejected** for the reasons above |
| SA-2026-07-29-09 | **duplicate** of unchanged canonical SA-027 |
| SA-2026-07-29-11, -12, -13 | **new**, independently confirmed |

Historical closures SA-020, SA-021, SA-023, SA-024, SA-025, SA-028, SA-029, and SA-030 retain their
prior resolved status and prior replay proof. They were not marked resolved again from source
inspection. SA-025 remains resolved: the premium limiter exists and is atomic; SA-2026-07-29-11 is
the distinct authorization/identity-key bypass around its intended threat model.

## Independent `/codex:review` disposition

| Item | Verdict |
| --- | --- |
| 01 | confirmed HIGH/P0 |
| 02 | confirmed HIGH/P1 |
| 03 | confirmed MEDIUM/P2 |
| 04 | rejected: no reachable disclosure; documented embed dependency |
| 05 | downgraded INFO/P3 |
| 06 | confirmed MEDIUM/P2; broadened to enrollments |
| 07 | confirmed fail-closed product defect; rejected as security |
| 08 | confirmed LOW/P3 |
| 09 | duplicate SA-027; INFO/P3 |
| 10 | rejected: comments already exist |
| 11 | confirmed HIGH/P1 |
| 12 | confirmed MEDIUM/P2 |
| 13 | confirmed MEDIUM/P2 |

The independent review also confirmed AskQ's tenant scope, ringside claim/write boundaries, and
Stripe refund/withdrawal/payout source paths had no concrete contradictory authorization path.

## Coverage Gaps (not passes)

1. **Applied database and HTTP probes were not rerun.** Static audit is the security skill's scope.
   The prior same-day live proof was reconciled, and the current code delta adds no table/policy, but
   deployment drift remains unmeasured.
2. **No composed anonymous-session exploit replay.** Creating an anonymous Auth row is an external
   write. Use a disposable environment to close SA-2026-07-29-02 and the AI-session legs.
3. **No real exhibitor/secretary/judge/steward token matrix.** SA-2026-07-29-06 and -13 are proven
   from final policy/function bodies, not live role tokens.
4. **Public storage objects were not inventoried or fetched.** Bucket-publicity intent remains
   outside this static source proof.
5. **Out of skill scope:** dependency/supply-chain scanning, git-history secret scanning,
   penetration testing, and load testing.

**Highest-value follow-up:** run a disposable-environment replay covering anonymous users and the
complete role-token matrix.

## Linear reconciliation and approval gate

Read-only Linear reconciliation found:

| Finding | Issue | Priority/state |
| --- | --- | --- |
| SA-2026-07-29-01 | [MYK9-116](https://linear.app/myk9-platform/issue/MYK9-116) | Urgent / Todo |
| SA-2026-07-29-02 | [MYK9-117](https://linear.app/myk9-platform/issue/MYK9-117) | High / Todo |
| SA-2026-07-29-11 | [MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125) | High / Todo |

After batch approval on 2026-07-30, one issue was created for the only new HIGH finding:
[MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125). No other issue or comment was created
or modified.

### Approved Linear issue — SA-2026-07-29-11

**Title:** Require show-manager authorization before paid premium generation

**Problem.** `generate-premium` treats a successful `shows` SELECT as authorization, but
`shows_select` intentionally exposes every public-status show. Any authenticated or anonymous Auth
identity can therefore invoke the paid Anthropic path without a club/show role.

**Attack path and evidence.** Obtain any JWT; enumerate public show IDs; POST each ID to
`generate-premium`. Source: `supabase/functions/generate-premium/index.ts:17-75,149-183`;
`supabase/migrations/20260606204100_include_show_scoped_secretary_drafts.sql:10-23`. The limiter is
five attempts per user/show/15 minutes, so show rotation and anonymous-session rotation bypass an
account-wide budget.

**Expected secure behavior.** Anonymous and ordinary authenticated users are rejected before
limiter accounting or Anthropic. Only the approved show-management roles can generate.

**Impact/severity.** Externally triggerable model spend and resource abuse; HIGH/P1. No protected
tenant-data disclosure was found.

**Likely root cause.** An inline authorization assumption drifted from the deliberately public
`shows_select` policy; the limiter was designed for trusted callers and scopes only user + show.

**Recommended approach.** Reject `user.is_anonymous`, authorize with an explicit current-user
show-manager helper (site admin, club admin, secretary per product decision), and add an
account-wide cost ceiling.

**Acceptance criteria.**

- Anonymous Auth and authenticated non-manager calls return 403.
- Denied calls do not invoke the limiter or Anthropic.
- Authorized secretary/club-admin/site-admin calls still generate.
- Per-account quota cannot be multiplied by switching public shows.
- Public show browsing remains unchanged.
- Add edge/source contract tests for each role and model-call non-invocation.

**Regression proof.** Disposable-role replay for anonymous, exhibitor, secretary, club admin, and
site admin; parallel/cross-show quota test; one operator-approved authorized staging generation only
if paid smoke is desired.

**Relevant references.** This report; resolved SA-025;
`supabase/functions/generate-premium/index.ts`;
`supabase/functions/generate-premium/premiumRateLimit.ts`;
`supabase/migrations/20260712120000_premium_generation_throttle.sql`;
MYK9-22 and MYK9-117 (related anonymous-identity controls, not duplicates).

**Suggested Linear priority:** High.

**Approval status:** approved and created as
[MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125) on 2026-07-30.

## Finding ledger

```text
SA-2026-07-29-01 | P0 | HIGH   | unchanged | 2026-07-29/2026-07-29 | 2 | MYK9-116 | anon reads populated num_hides/has_blank where hides_known=false | cold-anon and exhibitor protected-field denial plus authorized ringside regression
SA-2026-07-29-02 | P1 | HIGH   | unchanged | 2026-07-29/2026-07-29 | 2 | MYK9-117 | anonymous Auth receives authenticated DB role across unconditional reads | disposable anonymous replay returns zero/42501 while stamped ringside passes
SA-2026-07-29-03 | P2 | MEDIUM | unchanged | 2026-07-29/2026-07-29 | 2 | unassigned | public judge_assignments includes fee/notes | protected-column 42501 plus public panel regression
SA-2026-07-29-05 | P3 | INFO   | unchanged | 2026-07-29/2026-07-29 | 2 | unassigned | broad preview CORS regex, no victim-token path | exact-origin policy contract or accepted rationale
SA-2026-07-29-06 | P2 | MEDIUM | unchanged | 2026-07-29/2026-07-29 | 2 | unassigned | active steward can mutate judge assignments/enrollments and read email logs | steward denied office operations while ringside flow passes
SA-2026-07-29-08 | P3 | LOW    | unchanged | 2026-07-29/2026-07-29 | 2 | unassigned | anon entries policy omits entry.deleted_at | soft-deleted entry absent across REST/views/TV/replication
SA-027            | P3 | INFO   | unchanged | 2026-07-10/2026-07-29 | 3 | unassigned | search_path=public not exploitable under current schema ACL | empty-path conversion tests or accepted-risk documentation
SA-2026-07-29-11 | P1 | HIGH   | new       | 2026-07-29/2026-07-29 | 1 | MYK9-125 | any Auth user invokes paid generation across public shows | role matrix 403/success plus cross-show quota proof
SA-2026-07-29-12 | P2 | MEDIUM | new       | 2026-07-29/2026-07-29 | 1 | unassigned | AskQ accepts disposable anon identities and count/insert races | anonymous denial and atomic concurrency proof
SA-2026-07-29-13 | P2 | MEDIUM | new       | 2026-07-29/2026-07-29 | 1 | unassigned | arbitrary-user SECURITY DEFINER RBAC lookups | non-admin cross-user 42501, self/admin success
REJECTED: SA-2026-07-29-04, SA-2026-07-29-07 (as security), SA-2026-07-29-10
DUPLICATE: SA-2026-07-29-09 -> SA-027
HISTORICAL RESOLVED: SA-020, SA-021, SA-023, SA-024, SA-025, SA-028, SA-029, SA-030
```
