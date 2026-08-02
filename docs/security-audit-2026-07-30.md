# Security Audit — 2026-07-30

- **Mode:** Full Audit (`/security-audit --full`)
- **Detecting task:** `daily-security-audit` / `nightly-full-security-audit`
- **Source:** Codex, with an independent `/codex:review`
- **Baseline SHA:** `18e560c6cf74f5ae50de7cc34d5b3ef0e28874bc` (`main` = `origin/main`; clean before this report)
- **Prior audit baseline:** `58bd0b91d5f15e5d2d1d0f5ac3c398ade8558e56`
- **Checklist:** `.agents/skills/security-audit/references/checklist.md` (`sha256:4a1258e1963db8be`)
- **Finding contract:** `quality-finding-lifecycle`

**Method:** static source audit. The prior report's applied-database evidence was reconciled, but
live HTTP/database probes were not repeated because the security-audit skill excludes runtime
testing. The final read-only fetch confirmed `main` and `origin/main` at the baseline above.

## Summary

| Source severity | Count |
| --- | ---: |
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 4 |
| LOW | 2 |
| INFO | 2 |
| **Total current ledger** | **12** |

| Canonical launch severity | Count |
| --- | ---: |
| P0 | 2 |
| P1 | 2 |
| P2 | 5 |
| P3 | 3 |

| Lifecycle transition | Count | Meaning |
| --- | ---: | --- |
| new | 2 | SA-2026-07-30-01 and SA-2026-07-30-02 |
| unchanged | 9 | Reconfirmed findings/informational records |
| resolved | 0 | No finding was closed from code alone |
| duplicate | 1 | Historical alias SA-2026-07-29-09 remains canonical SA-027 |
| rejected | 3 | Prior candidates -04, -07, and -10 |
| blocked | 1 | SA-2026-07-29-13 has a source fix but lacks applied exploit-path closure proof |

Auto-fixable: **4 of 12** (SA-2026-07-29-03, SA-2026-07-29-08,
SA-2026-07-29-13, and SA-2026-07-30-02). **8 require a design or policy decision.**

Classification counts: security/data exposure **5**; authorization/integrity **2**; AI cost abuse
**2**; security monitoring **1**; informational hardening **2**.

### CRITICAL/HIGH at a glance

- **SA-2026-07-29-01 — HIGH/P0:** ordinary authenticated competitors and anonymous passcode
  sessions can still read and cache undisclosed scent-work hide configuration. Cold anon is now
  protected, with applied proof. Independently **confirmed**. Existing references:
  [MYK9-116](https://linear.app/myk9-platform/issue/MYK9-116) (Done, cold-anon leg),
  [MYK9-127](https://linear.app/myk9-platform/issue/MYK9-127) (Todo), and
  [MYK9-128](https://linear.app/myk9-platform/issue/MYK9-128) (Backlog).
- **SA-2026-07-29-02 — HIGH/P1:** a self-service anonymous Auth user receives the
  `authenticated` database role and reaches unconditional reads including volunteer PII and audit
  data. Independently **confirmed**. Existing issue:
  [MYK9-117](https://linear.app/myk9-platform/issue/MYK9-117).
- **SA-2026-07-29-11 — HIGH/P1:** any authenticated identity, including an anonymous Auth user,
  can invoke paid premium generation for every public-status show without a manager role.
  Independently **confirmed**. Existing issue:
  [MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125).
- **SA-2026-07-30-01 — HIGH/P0:** a manager of one club can exploit idempotent UUID conflicts in
  `create_show_with_children` to insert trials/classes/judge assignments into another club's show.
  Independently **confirmed**. No existing issue; one Linear-ready draft awaits approval.

## Findings

### [HIGH] SA-2026-07-29-01: Authenticated and passcode competitors receive secret hide configuration

- **Classification/status:** score-integrity security exposure; **unchanged, partially remediated**
- **Canonical/source severity:** **P0 / HIGH**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-30; **3**
- **Affected role/workflow:** ordinary authenticated exhibitor and account-less ringside passcode
  user; scent-work preparation and scoring
- **Route/object/files:** `public.classes`;
  `supabase/migrations/20260730140000_anon_classes_hide_column_allowlist.sql:32-37,50-112`;
  `supabase/migrations/20260730220000_codify_pre_rule_table_grants.sql:106-173`;
  `apps/myk9show/src/pages/ringsideAnonSession.ts:47-75,104-123`;
  `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts:117-128,233-238,426-488`
- **Existing references:** MYK9-116, MYK9-127, MYK9-128; prior audit
- **Independent review:** **confirmed HIGH/P0; cold-anon leg fixed, broader finding open**

**Observed evidence.** Migration `20260730140000` correctly replaced cold anon's table-wide grant
with a 52-column allowlist that omits `num_hides`, `has_blank`, and `hides_known`. The MYK9-116
completion comment records applied ACL proof and cold-anon `42501` responses. The same migration
explicitly preserves authenticated table-wide SELECT, and `20260730220000` reaffirms full
authenticated CRUD on `classes`. Supabase anonymous sign-in also produces the PostgreSQL
`authenticated` role. After the passcode claim is stamped, the client syncs each trial's classes;
the replication query selects `*`, maps `num_hides` to `hideCount`, and persists it in IndexedDB.

**Attack path.** Sign in with any ordinary account, or enter an exhibitor/ringside passcode to mint
an anonymous Auth session. Query `classes` for a public class's hide columns or inspect the
replication cache. No judge assignment or office role is required.

**Expected vs observed.** Competitors must not receive undisclosed search configuration. Cold anon
is now denied, but authenticated identities and passcode sessions retain the complete class row.

**Impact/confidence:** decisive pre-run score/result integrity advantage; **high confidence**.
PR #1535 increased offline persistence but did not create the original read eligibility.

**Next action:** implement the official-gated/offline-capable design in MYK9-127 and MYK9-128, and
repair the applied ACL detector in SA-2026-07-30-02. **Auto-fixable: No.**

**Closure proof:** applied cold-anon denial is already recorded. An ordinary exhibitor and an
exhibitor passcode must also be denied; authorized judge/steward scoring must pass online and
offline; leaving/signing out of a show must remove protected cached fields.

### [HIGH] SA-2026-07-29-02: Anonymous Auth users reach unconditional authenticated reads

- **Classification/status:** cross-tenant data exposure; **unchanged**
- **Canonical/source severity:** **P1 / HIGH**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-30; **3**
- **Affected role/workflow:** any internet user; account-less ringside session
- **Route/object/files:** Supabase anonymous sign-in;
  `apps/myk9show/src/pages/ringsideAnonSession.ts:47-75`;
  `supabase/migrations/095_volunteer_scheduling.sql:32-45`;
  `supabase/migrations/20260730220000_codify_pre_rule_table_grants.sql:101-250`
- **Existing references:** MYK9-117; related MYK9-93 and MYK9-22
- **Independent review:** **confirmed HIGH/P1**

**Observed evidence.** Anonymous sign-in is load-bearing for passcode ringside access and gives the
session the database `authenticated` role. The current grants deliberately expose authenticated
reads across many tables, while surviving policies such as the volunteer policies use
`USING (true)` and do not reject `is_anonymous=true`. `volunteers` includes name, email, phone, and
notes; `activity_log` contains actor IDs/names and metadata. No general real-account predicate was
added in the current delta.

**Attack path.** Obtain a bare anonymous Auth JWT, then query an affected PostgREST table. CAPTCHA
can increase request effort but does not change the database role. The composed replay remains
blocked because it would create persistent external Auth state.

**Expected vs observed.** A bare anonymous identity should have no account-wide reads; a stamped
ringside identity should receive only claim-scoped show data. The database currently treats both as
ordinary authenticated users for unconditional policies.

**Impact/confidence:** populated volunteer PII, audit metadata, and platform-wide operational data
become internet-readable; **high confidence**, with end-to-end replay still required.

**Next action:** add a reusable real-account predicate to unconditional authenticated reads and
separately show/club-scope volunteers. Do not disable anonymous sign-in. **Auto-fixable: No.**

**Closure proof:** in a disposable environment, a bare anonymous session must receive zero rows or
`42501` from volunteers/activity/RBAC catalogs while a valid stamped passcode session still passes
the complete ringside read/write flow.

### [HIGH] SA-2026-07-29-11: `generate-premium` mistakes public visibility for manager authorization

- **Classification/status:** authorization bypass and AI cost abuse; **unchanged**
- **Canonical/source severity:** **P1 / HIGH**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-30; **2**
- **Affected role/workflow:** anonymous Auth user or ordinary authenticated user; premium generation
- **Route/object/files:** `supabase/functions/generate-premium/index.ts:17-75,149-183`;
  `supabase/functions/generate-premium/premiumRateLimit.ts:3-106`;
  `supabase/migrations/108_tv_display_anon_access.sql:24-37`;
  `supabase/migrations/20260712120000_premium_generation_throttle.sql`
- **Existing references:** MYK9-125; related resolved SA-025
- **Independent review:** **confirmed HIGH/P1**

**Observed evidence.** The endpoint accepts every valid JWT. Its authorization comment assumes the
`shows` SELECT returns a row only for managers, but the final show policy intentionally returns
public-status shows. The function then invokes Sonnet. The atomic limiter allows five attempts per
`user.id + show_id`; it does not establish role authorization or an account-wide cost ceiling.
No edge-function source changed since the prior audit.

**Attack path.** Obtain any authenticated JWT, enumerate intended-public show IDs, and POST each to
`generate-premium`. Each show permits a new per-identity quota; rotating anonymous sessions also
rotates the identity key.

**Expected vs observed.** Premium generation is an office operation and must reject unauthorized
callers before rate-limit accounting or model invocation. A public show row currently acts as the
authorization decision.

**Impact/confidence:** externally triggerable paid model spend and resource consumption; **high
confidence**. No protected tenant data was found in the response.

**Next action:** enforce an explicit server-side show-manager predicate, reject anonymous
identities, and add an account-wide cost ceiling. **Auto-fixable: No.**

**Closure proof:** anonymous and authenticated non-manager callers receive 403 before the
limiter/model; secretary/club-admin/site-admin calls pass; a cross-show quota test enforces the
chosen account-wide ceiling.

### [HIGH] SA-2026-07-30-01: Show creation RPC accepts cross-tenant UUID conflicts

- **Classification/status:** cross-tenant authorization bypass and show-data integrity; **new**
- **Canonical/source severity:** **P0 / HIGH**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-30; 2026-07-30; **1**
- **Affected role/workflow:** club admin or trial secretary for any club; another club's show setup
- **Route/object/files:** `public.create_show_with_children`;
  `supabase/migrations/20260730230000_create_show_with_children_num_hides.sql:31-78,91-195`;
  `apps/myk9show/src/pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts:120-190,259-287`;
  `apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts:52-78`
- **Existing references:** none found in QA, prior audits, or Linear
- **Independent review:** **confirmed HIGH/P0**

**Observed evidence.** The SECURITY DEFINER RPC authorizes only the caller-supplied
`p_show.club_id`. It inserts the caller-supplied show UUID with `ON CONFLICT (id) DO NOTHING` and
does not verify that a conflicting row belongs to that club. It repeats the no-op conflict behavior
for trials, then unconditionally appends every supplied trial UUID to `v_inserted_trial_ids`.
Classes whose `trial_id` appears in that array are inserted with definer rights. The normal wizard
generates random UUIDs, but an attacker can call the granted RPC directly with arbitrary JSON.
Public show/trial UUIDs are intentionally enumerable.

**Attack path.**

1. Hold an active club-admin or trial-secretary role for Club A.
2. Enumerate a public show or trial UUID belonging to Club B.
3. Call `create_show_with_children` with `p_show.club_id = Club A` and `p_show.id = Club B's show`.
4. Supply new trials for that show, or supply a conflicting victim trial UUID. The no-op conflicts
   are treated as successful membership in the request.
5. Insert attacker-chosen classes and class-level judge assignments under Club B's hierarchy.

**Expected vs observed.** Every existing or new show/trial/class in the atomic graph must belong to
the authorized club and request show. UUID collisions should be either a verified same-tenant
idempotent replay or a fail-closed error.

**Impact/confidence:** cross-tenant schedule, class, judge-panel, paperwork, and result-integrity
corruption; **high confidence**. The flaw predates the current redefinition, so it is newly detected
rather than introduced by PR #1535.

**Next action:** validate the existing show's `club_id` after the insert attempt; for each trial,
require a successful insert or verify the existing trial belongs to `v_show_id`; reject any
cross-tenant/conflicting child before class insertion. Preserve only explicitly verified same-graph
idempotency. **Auto-fixable: No** because retry/collision semantics need an explicit decision.

**Closure proof:** a behavioral SQL/direct-RPC test must prove a Club A manager receives `42501` or
an equivalent fail-closed response and creates zero rows when supplying Club B show/trial UUIDs.
A same-club exact idempotent retry and a normal new-show transaction must still succeed.

### [MEDIUM] SA-2026-07-29-03: Public judge assignments expose `fee` and `notes`

- **Classification/status:** confidential data exposure; **unchanged**
- **Canonical/source severity:** **P2 / MEDIUM**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-30; **3**
- **Affected role/workflow:** cold anon; judge contracting and public show details
- **Route/object/files:** `public.judge_assignments`;
  `supabase/migrations/006_rls_policies.sql:269`;
  `supabase/migrations/20260730220000_codify_pre_rule_table_grants.sql:331-351`
- **Existing references:** none
- **Independent review:** **confirmed MEDIUM/P2**

The policy intentionally publishes the judge panel, but table-level anon SELECT also publishes
`fee` and unrestricted `notes`. Prior applied proof reached both columns; current fees were null, so
exploitation requires a club to populate them.

**Attack path:** cold-anon REST SELECT of `judge_assignments?select=show_id,person_id,fee,notes`.
**Expected:** public identity/schedule fields only. **Impact/confidence:** compensation or internal
notes become public; **high confidence**.

**Next action:** replace table SELECT with a safe public column allowlist. **Auto-fixable: Yes.**

**Closure proof:** cold anon receives `42501` for `fee`/`notes`, while the public judge panel renders
from allowlisted fields.

### [MEDIUM] SA-2026-07-29-06: `is_show_official()` gives stewards office-administration authority

- **Classification/status:** role-scope authorization flaw; **unchanged**
- **Canonical/source severity:** **P2 / MEDIUM**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-30; **3**
- **Affected role/workflow:** active account steward; show administration
- **Route/object/files:** `supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql:49-101`;
  `supabase/migrations/20260728131000_split_showday_manage_read_rls.sql:5-70`;
  `docs/INTENT.md:55-59,189-231`
- **Existing references:** none
- **Independent review:** **confirmed MEDIUM/P2**

`is_show_official()` includes active, unexpired stewards. Policies use it to let the caller
insert/update/delete judge assignments and insert/update/select enrollments. Migration 163 says the
enrollment policies support secretaries and club admins entering mail submissions; steward product
intent is ring flow. Anonymous passcode claims do not satisfy this helper—the principal is a
persisted steward role.

**Attack path:** an active show/club-scoped steward submits direct PostgREST writes to
judge assignments or enrollments for that show. RLS accepts them through `is_show_official()`.

**Expected vs observed:** stewards manage check-in/run order; office staff manage contracts and
enrollments. **Impact/confidence:** show-scoped entry and judge-panel integrity; **high confidence**.

**Next action:** split office-management and show-day predicates, then repoint policies by intent.
**Auto-fixable: No.**

**Closure proof:** a real steward token fails judge-assignment/enrollment mutations and office-data
reads while ringside operations pass; secretary, club admin, and site admin paths pass.

### [MEDIUM] SA-2026-07-29-12: AskQ accepts disposable anonymous identities and has a racy quota

- **Classification/status:** AI cost abuse; **unchanged**
- **Canonical/source severity:** **P2 / MEDIUM**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-30; **2**
- **Affected role/workflow:** anonymous Auth user; AskQ rules/help queries
- **Route/object/files:** `supabase/functions/ask-myk9show/index.ts:92-198,301-398`;
  atomic precedent `supabase/migrations/20260724180000_reserve_operator_support_query.sql`
- **Existing references:** related MYK9-22 and MYK9-26; no duplicate issue found
- **Independent review:** **confirmed MEDIUM/P2**

AskQ accepts any `auth.getUser()` result without rejecting `is_anonymous`. A user with no person row
gets the free quota. Identity rotation resets the quota. For one identity, the endpoint counts and
then inserts a provisional row in separate operations; parallel requests can observe the same
count, and insertion errors are ignored. Operator support already uses an atomic reservation RPC.

**Attack path:** rotate anonymous Auth sessions and send rules/help questions; burst concurrent
requests before provisional rows become visible.

**Expected vs observed:** paid AI access needs an accountable identity and atomic reservation.
**Impact/confidence:** model spend/resource consumption; **high confidence**. AskQ show tools were
separately traced and fail closed to a verified relationship.

**Next action:** reject bare anonymous users or bind access to a durable entitlement, then reserve
quota atomically. **Auto-fixable: No.**

**Closure proof:** anonymous JWTs are rejected before logging/model calls; parallel requests at the
limit allow exactly the remaining slots; authenticated AskQ and verified show scoping still pass.

### [MEDIUM] SA-2026-07-29-13: RBAC lookup remediation awaits applied exploit-path proof

- **Classification/status:** cross-user authorization metadata disclosure; **blocked**
- **Canonical/source severity:** **P2 / MEDIUM**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-29; **1**
- **Affected role/workflow:** any authenticated account; RBAC access-context lookup
- **Route/object/files:** `supabase/migrations/20260730110000_restrict_rbac_access_lookups.sql:7-314`;
  `supabase/tests/rbac_access_lookup_authorization_test.sql`
- **Existing references:** MYK9-114 is performance-only and not a duplicate
- **Independent review:** **source remediation confirmed; closure blocked**

The prior vulnerable functions accepted arbitrary `user_id` values under SECURITY DEFINER.
Migration `20260730110000` now routes all four RPCs through
`private.can_inspect_rbac_user`, permits only self or site-admin inspection, and raises `42501`.
The source contract test passed and a behavioral SQL test covers self, cross-user denial, and admin
inspection. The applied behavioral test was not run during this static audit.

**Expected vs current source:** non-admin callers resolve only their own access context; current
source implements that rule. **Impact/confidence:** prior cross-user role/scope reconnaissance is
blocked in source; **high confidence in source, incomplete closure confidence**.

**Next action:** run the behavioral SQL test against a disposable/current applied database.
**Auto-fixable: Yes** (the source fix is already present).

**Closure proof:** an exhibitor calling each RPC with another user's UUID receives `42501`; self and
site-admin inspection pass. Only then may this finding transition to resolved.

### [LOW] SA-2026-07-29-08: Public entries policy omits entry-level soft delete

- **Classification/status:** stale public data exposure; **unchanged**
- **Canonical/source severity:** **P3 / LOW**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-30; **3**
- **Affected role/workflow:** cold anon; TV/running-order reads
- **Route/object/files:** `supabase/migrations/108_tv_display_anon_access.sql:12-21`
- **Existing references:** none
- **Independent review:** **confirmed LOW/P3**

`entries_anon_select_for_tv` checks the show's `deleted_at`, not the entry's. A soft-deleted entry
in a public-status show remains reachable through the safe column allowlist, exposing stale
identity/scheduling data but no protected payment/score columns.

**Next action:** add `entries.deleted_at IS NULL`. **Auto-fixable: Yes.**

**Closure proof:** a soft-deleted entry is absent from cold-anon REST, public views, TV display, and
replication-backed public reads.

### [LOW] SA-2026-07-30-02: Applied ACL monitor accepts the obsolete `classes` grant

- **Classification/status:** security-monitoring false assurance; **new**
- **Canonical/source severity:** **P2 / LOW**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-30; 2026-07-30; **1**
- **Affected role/workflow:** site operator; daily applied-database ACL drift detection
- **Route/object/files:**
  `apps/myk9show/supabase/functions/_shared/anonGrantChecks.ts:46-112`;
  `apps/myk9show/supabase/functions/_shared/anonGrantTestFixtures.ts:1-62`;
  `apps/myk9show/supabase/functions/_shared/anonGrantChecks.test.ts:7-15`;
  `supabase/migrations/20260730140000_anon_classes_hide_column_allowlist.sql:46-112`
- **Existing references:** related MYK9-93 and MYK9-116; no dedicated issue found
- **Independent review:** **standards axis confirmed LOW/P2; spec axis confirmed the defect but
  recommended attaching it to SA-2026-07-29-01**

**Observed evidence.** The migration replaces table-wide anon `classes` SELECT with 52 column
grants. The applied-ACL detector still expects `classes: 'r'` in `ANON_TABLE_ALLOWLIST` and has no
`classes` entry in `ANON_COLUMN_ALLOWLIST`. Its fixture and positive test encode that stale state,
expecting 21 table grants and 23 column grants. The test passes because implementation and fixture
are wrong in the same way.

**Attack/operational path.** Precondition: a later migration, restore, unsafe default privilege, or
shared-system change regrows the old table-wide `classes` SELECT and removes the 52 column grants.
That is the exact P0 hide-secret exposure state, yet `anonGrantsCheck` can return `ok`. Conversely,
the current secure ACL produces a failure. An operator can therefore receive false assurance during
a recurrence and fail to act before cold anon reads protected hide columns.

**Expected vs observed.** The health check should accept only the current column allowlist and
reject any table-level `classes` grant. It currently does the reverse.

**Impact/confidence:** delayed or missed detection of a recurrence of SA-2026-07-29-01; **high
confidence** in the monitor behavior, but no current ACL exposure is created by this defect alone.

**Next action:** remove `classes` from the table allowlist, add the exact 52 columns to the column
allowlist/fixture, update the count assertions, and add a negative table-grant regression.
**Auto-fixable: Yes.**

**Closure proof:** the current secure fixture (20 table grants, 75 column grants) returns `ok`; a
fixture with table-level `classes` SELECT returns `fail`; after deployment, an applied health
snapshot reports the current ACL healthy.

### [INFO] SA-2026-07-29-05: Preview CORS regex is broad but no victim path exists

- **Classification/status:** informational hardening; **unchanged**
- **Canonical/source severity:** **P3 / INFO**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-29; 2026-07-30; **3**
- **Location:** `supabase/functions/_shared/http/cors.ts:29-47`
- **Existing references:** none
- **Independent review:** **INFO/P3; no exploit path**

The regex accepts matching myK9Show Vercel preview origins. No function enables credentialed
cookies, and protected calls require bearer tokens an attacker origin cannot read. CORS does not
constrain server-side callers. No unauthorized data/capability path was established.

**Next action/closure:** optionally replace the regex with an environment-provided exact origin
allowlist and contract test. **Auto-fixable: No** without the deployment-origin policy.

### [INFO] SA-027: SECURITY DEFINER functions use `search_path=public`

- **Classification/status:** informational hardening; **unchanged**
- **Canonical/source severity:** **P3 / INFO**
- **Baseline / first seen / last seen / consecutive runs:** `18e560c6c`; 2026-07-10; 2026-07-30; **4**
- **Alias:** SA-2026-07-29-09 is **duplicate** of this canonical ID
- **Existing references:** prior audit
- **Independent review:** **duplicate confirmed; INFO/P3**

The prior audit identified 21 surviving final SECURITY DEFINER function definitions using
`search_path=public`. Applied evidence showed API roles lack `CREATE` on `public`, so they cannot
place a shadow object and no attacker path exists. No current change altered that schema-ACL
dependency.

**Next action/closure:** document the accepted dependency or fully qualify each body and use
`search_path=''`, with focused tests. **Auto-fixable: No.**

## Candidate dispositions

| Candidate | Status | Evidence |
| --- | --- | --- |
| SA-2026-07-29-04 (`people.email`) | **rejected** | The grant is a documented PostgREST embed dependency; people row RLS returns no cold-anon rows. No current disclosure path. |
| SA-2026-07-29-07 (branding storage predicate) | **rejected as security** | The ambiguous inner `name` binding fails closed. It remains product correctness, not unauthorized access. |
| SA-2026-07-29-09 | **duplicate** | Reuse canonical SA-027. |
| SA-2026-07-29-10 (advisor comments) | **rejected** | The required deny-all rationale comments exist in current migrations. |

## Categories checked

| Category | Scope examined | Findings | Incomplete/blocked |
| --- | --- | ---: | --- |
| RLS Policy Integrity | 441 migration files inventoried; final policy/grant/helper delta read; repository FORCE-RLS and grant-decision contracts replayed | 01, 02, 03, 08, 2026-07-30-02 | Applied database not re-queried |
| Edge Function Auth | all 35 `index.ts` entrypoints inventoried; no entrypoint changed since prior baseline; complete implicated functions/shared helpers read | 11, 12; INFO 05 | No live model/anonymous invocation |
| RBAC & Privilege Escalation | roles/permissions/user_roles policies; final helper bodies; current remediation and behavioral SQL test | 06, 13, 2026-07-30-01; INFO SA-027 | Applied RBAC behavior not replayed |
| Client Auth Patterns | auth lifecycle, anonymous-session flow, 15 route files, route guards, current RBAC/replication delta | 01, 02 | Static only |
| Data Exposure | AskQ scope, grants/policies, public/replication reads, logging/error and storage upload paths | 01, 02, 03, 08, 13 | Public bucket objects not inventoried |
| Payment Security | 9 Stripe/refund/payout entrypoints, money locks, withdrawal snapshots, and focused contracts; no source delta | 0 | No paid/refund/payout smoke |
| Input Validation | request/UUID/redirect validation, HTML sinks, URL params, forms, and image/storage path policies | 0 | Static only |

### Focus areas with no additional concrete finding

- **AskQ tenant data:** JWT verification precedes service-role work; show context is accepted only
  after an active show role or owned-dog entry; tools receive the verified scope. The finding is
  identity/quota cost abuse, not tenant disclosure.
- **Anonymous passcode claims (PRs #951-954):** the edge function stamps service-controlled
  `app_metadata`; claim-aware views/RPCs recheck show, role, and generation; judge/steward mutation
  fields are explicit. The broad authenticated-read problem is SA-2026-07-29-02, and class-secret
  caching is SA-2026-07-29-01.
- **Multi-registry support (PRs #1040-1056 and current UKC HD changes):** current changes alter
  registry catalog/title/scoring semantics only. No registry value enters an authorization
  predicate or widens tenant scope.
- **Withdrawal snapshots/refunds:** amounts remain server-authoritative; webhook snapshot stamping
  resolves policy server-side; a missing snapshot forces manual handling; refund endpoints
  authorize office roles and recheck payout state under the show money lock.
- **Stripe/payout:** signatures use platform/Connect secrets; redirect and price inputs are
  allowlisted; records are livemode-scoped; payout cron uses its secret, locks money state,
  recomputes amounts, and reconciles transfer groups.
- **Replication boundaries:** show-day reads/writes remain on claim-aware views/RPCs. The current
  subscription fanout change does not alter query authorization. Protected class-row replication is
  already captured by SA-2026-07-29-01.
- **Storage/input:** upload MIME/size checks and storage path ownership are enforced. Public image
  read is intentional; no unauthorized write path was established.

## Verification

- **30 test files / 304 tests passed** in 4.1 seconds across FORCE RLS, migration grant decisions,
  anon column grants, class readers/replication, RBAC source authorization, show-creation source
  contracts, passcode claims/revocation/OCC, AskQ show scope, premium throttling, Stripe
  checkout/webhook/refund/payment-link/livemode paths, withdrawal policy, payout ledger, and payout
  settlement.
- The stale applied-ACL monitor's own **12 tests pass only against its stale fixture**; independent
  review confirmed SA-2026-07-30-02 rather than treating those tests as proof of the current ACL.
- The independent `/codex:review` spec axis separately ran **4 files / 21 tests** and confirmed the
  new cross-tenant RPC path and the listed transitions.
- `main` and `origin/main` both resolved to the baseline after a final fetch.

## Previous audit comparison

Current `main` adds the cold-anon class allowlist, RBAC self/admin lookup restriction, explicit
table grants, class hide-count replication, and registry/title corrections. No edge entrypoint,
Stripe/refund/payout source, or AskQ/passcode authorization source changed.

| Prior tracked item | Transition |
| --- | --- |
| SA-2026-07-29-01 | **unchanged / partial:** cold anon passed closure proof; authenticated and passcode legs remain and now have MYK9-127/128 |
| SA-2026-07-29-02, -03, -05, -06, -08 | **unchanged**, independently confirmed |
| SA-027 | **unchanged**; alias -09 remains duplicate |
| SA-2026-07-29-11, -12 | **unchanged** after a second consecutive confirmed run |
| SA-2026-07-29-13 | **blocked:** source remediation confirmed; applied behavioral closure not run |
| SA-2026-07-30-01, -02 | **new**, independently confirmed |
| Prior -04, -07, -10 | **rejected** for the prior reasons |

Historical closures SA-020, SA-021, SA-023, SA-024, SA-025, SA-028, SA-029, and SA-030 retain their
prior resolved status and prior replay proof. They were not re-resolved from code inspection.

## Independent `/codex:review` disposition

| Item | Verdict |
| --- | --- |
| 01 | confirmed HIGH/P0; cold-anon remediation valid but incomplete for authenticated/passcode |
| 02 | confirmed HIGH/P1 |
| 03 | confirmed MEDIUM/P2 |
| 05 | INFO/P3; no victim-token path |
| 06 | confirmed MEDIUM/P2 |
| 08 | confirmed LOW/P3 |
| SA-027 | duplicate/accepted-dependency INFO/P3 |
| 11 | confirmed HIGH/P1 |
| 12 | confirmed MEDIUM/P2 |
| 13 | source fix confirmed; closure blocked |
| 2026-07-30-01 | confirmed HIGH/P0 |
| 2026-07-30-02 | confirmed monitor defect LOW/P2 by standards axis; spec axis recommended attachment to 01 |

The independent review also rejected an additional security regression in the registry/title delta
and found no contradictory payment, passcode-claim-write, or replication authorization path.

## Coverage gaps (not passes)

1. **No applied database/HTTP replay.** This static audit reconciled the prior applied evidence but
   did not measure deployment drift.
2. **No composed anonymous-session exploit replay.** Creating an Auth identity is an external write.
3. **No real exhibitor/secretary/judge/steward token matrix.** This blocks full proof for 01, 02, and
   06.
4. **RBAC behavioral SQL not executed.** This is why 13 is blocked rather than resolved.
5. **No cross-tenant `create_show_with_children` exploit replay.** Source and dependency evidence
   establish the path; a disposable database is required for closure.
6. **Public storage objects were not fetched or inventoried.**
7. **Out of skill scope:** dependency/supply-chain, git-history secret scanning, penetration, and
   load testing.

## Linear reconciliation and approval gate

No Linear issue was created, updated, or closed during this audit.

| Finding | Existing issue | Current state |
| --- | --- | --- |
| SA-2026-07-29-01 | [MYK9-116](https://linear.app/myk9-platform/issue/MYK9-116) | Done for cold-anon scope, with applied proof |
| SA-2026-07-29-01 | [MYK9-127](https://linear.app/myk9-platform/issue/MYK9-127) | Todo / High |
| SA-2026-07-29-01 | [MYK9-128](https://linear.app/myk9-platform/issue/MYK9-128) | Backlog / High |
| SA-2026-07-29-02 | [MYK9-117](https://linear.app/myk9-platform/issue/MYK9-117) | Todo / High |
| SA-2026-07-29-11 | [MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125) | Todo / High |
| SA-2026-07-30-01 | none | Draft below awaits batch approval |

SA-2026-07-30-02 is P2/LOW and remains report-only. It is related to completed MYK9-93 and
MYK9-116 but is not a duplicate of either remediation.

### Linear-ready draft awaiting approval — SA-2026-07-30-01

**Title:** Prevent cross-tenant children in `create_show_with_children`

**Problem.** The authenticated SECURITY DEFINER show-creation RPC authorizes `p_show.club_id` but
does not verify ownership when caller-supplied show or trial UUIDs conflict. `ON CONFLICT DO
NOTHING` is treated as a successful idempotent member of the request graph.

**Attack path and evidence.** A manager of Club A enumerates a public Club B show/trial UUID, calls
the RPC with Club A as the authorized club and the victim UUIDs, then inserts trials/classes and
class-level judge assignments under the victim hierarchy. Evidence:
`20260730230000_create_show_with_children_num_hides.sql:58-78,91-195`.

**Expected secure behavior.** Every existing/new node must belong to the authorized club and request
show. Cross-tenant or mismatched UUID conflicts fail closed and roll back the transaction.

**Impact / severity.** Cross-tenant show setup, judge-panel, paperwork, score/result integrity;
**HIGH source / P0 canonical**.

**Likely root cause.** Idempotent retry behavior uses `ON CONFLICT DO NOTHING` without validating
that a conflicting object is the same authorized graph.

**Recommended approach.**

1. After the show insert attempt, fetch/lock the row and require `club_id = v_club_id`.
2. For each trial, require a fresh insert or verify the existing trial belongs to `v_show_id`.
3. Append only verified trial IDs; reject mismatched class/trial/show references before inserts.
4. Decide and document whether same-tenant retries compare the full immutable payload or only graph
   ownership.

**Acceptance criteria.**

- A Club A manager cannot add or associate any trial, class, or judge assignment with Club B UUIDs.
- A mismatched conflict fails and rolls back all rows from the RPC.
- An exact same-club retry remains idempotent according to the documented rule.
- Normal new-show creation and passcode generation remain functional.
- The function keeps explicit authenticated/anon execute decisions and empty `search_path`.

**Regression proof.** Behavioral SQL tests with two clubs and role tokens: cross-club show conflict,
cross-club trial conflict, mixed valid/invalid child rollback, same-club exact retry, and normal
creation. A direct PostgREST RPC probe in a disposable environment must return denial and leave zero
victim-tenant rows.

**Relevant files/reports.**

- `supabase/migrations/20260730230000_create_show_with_children_num_hides.sql`
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts`
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts`
- `docs/security-audit-2026-07-30.md`

## Finding ledger

```text
SA-2026-07-29-01 | P0 | HIGH   | unchanged | 2026-07-29/2026-07-30 | 3 | MYK9-116/127/128 | authenticated/passcode users read and cache hide secrets; cold anon closed | exhibitor/passcode denial + authorized offline scoring + cache purge
SA-2026-07-29-02 | P1 | HIGH   | unchanged | 2026-07-29/2026-07-30 | 3 | MYK9-117 | bare anonymous Auth inherits unconditional authenticated reads | disposable anonymous denial + stamped ringside regression
SA-2026-07-29-03 | P2 | MEDIUM | unchanged | 2026-07-29/2026-07-30 | 3 | unassigned | public judge_assignments includes fee/notes | protected-column 42501 + public panel regression
SA-2026-07-29-05 | P3 | INFO   | unchanged | 2026-07-29/2026-07-30 | 3 | unassigned | broad preview CORS regex without victim-token path | exact-origin contract or accepted rationale
SA-2026-07-29-06 | P2 | MEDIUM | unchanged | 2026-07-29/2026-07-30 | 3 | unassigned | active steward can mutate judge assignments/enrollments | steward denial + ringside/office role matrix
SA-2026-07-29-08 | P3 | LOW    | unchanged | 2026-07-29/2026-07-30 | 3 | unassigned | anon entries policy omits entry.deleted_at | soft-deleted entry absent across public paths
SA-027            | P3 | INFO   | unchanged | 2026-07-10/2026-07-30 | 4 | unassigned | public search_path not exploitable under current schema ACL | empty-path conversion or accepted-risk documentation
SA-2026-07-29-11 | P1 | HIGH   | unchanged | 2026-07-29/2026-07-30 | 2 | MYK9-125 | any authenticated user invokes paid generation across public shows | manager role matrix + cross-show quota proof
SA-2026-07-29-12 | P2 | MEDIUM | unchanged | 2026-07-29/2026-07-30 | 2 | unassigned | AskQ accepts disposable anon identities and count/insert races | anonymous denial + atomic concurrency proof
SA-2026-07-29-13 | P2 | MEDIUM | blocked   | 2026-07-29/2026-07-29 | 1 | unassigned | source now self/site-admin gates all four RBAC RPCs | applied behavioral SQL: cross-user 42501, self/admin success
SA-2026-07-30-01 | P0 | HIGH   | new       | 2026-07-30/2026-07-30 | 1 | approval pending | definer RPC treats cross-tenant show/trial UUID conflicts as idempotent | two-club exploit denial + rollback + same-club retry
SA-2026-07-30-02 | P2 | LOW    | new       | 2026-07-30/2026-07-30 | 1 | report-only | applied ACL monitor accepts obsolete table-wide classes grant | secure fixture ok + old table grant fail + applied health snapshot
REJECTED: SA-2026-07-29-04, SA-2026-07-29-07 (as security), SA-2026-07-29-10
DUPLICATE: SA-2026-07-29-09 -> SA-027
```
