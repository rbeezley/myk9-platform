# Security Audit — 2026-07-31

- **Mode:** Full Audit (`/security-audit --full`)
- **Detecting task:** `daily-security-audit` / `nightly-full-security-audit`
- **Source:** Codex, with an independent `/codex:review`
- **Baseline SHA:** `1f5ccb8a46a66009a3dfceb1eac71edc52264a51` (`main` = `origin/main` after fetch)
- **Prior audit baseline:** `18e560c6cf74f5ae50de7cc34d5b3ef0e28874bc`
- **Checklist:** `.agents/skills/security-audit/references/checklist.md` (`sha256:4a1258e1963db8be8d0935ee5df2cf4953db0f62d5b372d8e165f182efa77666`)
- **Finding contract:** `quality-finding-lifecycle`

**Method:** static source audit plus reconciliation of existing applied-behavior evidence in CI,
merged PRs, Linear, the 2026-07-30 report, automation memory, and `docs/qa/findings.md`. The audit
did not create live identities, alter the shared database, invoke paid services, or replay destructive
Edge capabilities. Existing closure evidence is identified explicitly; no item is resolved from code
inspection alone.

## Summary

### Active findings

| Source severity | Count |
| --- | ---: |
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 3 |
| LOW | 2 |
| INFO | 2 |
| **Total active** | **10** |

| Canonical launch severity | Count |
| --- | ---: |
| P0 | 2 |
| P1 | 1 |
| P2 | 4 |
| P3 | 3 |

### This run's complete transition set

The transition set contains **13** tracked records: source severities HIGH 5, MEDIUM 4, LOW 2,
and INFO 2. Three are resolved transitions and are therefore excluded from the active table above.

| Lifecycle status | Count | Records |
| --- | ---: | --- |
| new | 1 | SA-2026-07-31-01 |
| unchanged | 7 | SA-2026-07-29-01, -03, -05, -06, -08, -12, and SA-027 |
| resolved | 3 | SA-2026-07-29-02, SA-2026-07-29-13, SA-2026-07-30-01 |
| blocked | 2 | SA-2026-07-29-11 and SA-2026-07-30-02 |
| duplicate | 1 historical alias | SA-2026-07-29-09 -> SA-027 |
| rejected | 3 historical candidates | SA-2026-07-29-04, -07 as security, and -10 |

Auto-fixable: **4 of 10 active findings** (SA-2026-07-29-03, SA-2026-07-29-08,
SA-2026-07-30-02, and SA-2026-07-31-01). **6 require a design, policy, or accepted-risk
decision.**

### CRITICAL/HIGH at a glance

- **SA-2026-07-31-01 — HIGH/P0, new:** expired or revoked RBAC assignments retain privileged
  service-role Edge capabilities and notification content, including arbitrary recovery-link
  generation and hard deletion. Independently **confirmed**. No duplicate issue found;
  [MYK9-145](https://linear.app/myk9-platform/issue/MYK9-145) was created after batch approval.
- **SA-2026-07-29-01 — HIGH/P0, unchanged/partially remediated:** wire reads now withhold the
  judge-set hide count, but the shared IndexedDB cache survives role changes, anonymous leave, and
  sign-out. Independently **confirmed**. Existing references: MYK9-116 (Done),
  [MYK9-127](https://linear.app/myk9-platform/issue/MYK9-127) (Todo), and duplicate MYK9-128.
- **SA-2026-07-29-11 — HIGH/P1, blocked:** deployed source now denies anonymous and non-manager
  premium generation before cost, but the authorized paid smoke and the accepted account-wide
  quota decision remain incomplete. Independently **confirmed as blocked**. Existing issue:
  [MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125) (Todo).
- **SA-2026-07-29-02 — HIGH/P1, resolved:** applied behavior now denies bare anonymous sessions
  account-wide/RBAC/volunteer reads while preserving public ringside dependencies. Independently
  **confirmed resolved**. [MYK9-117](https://linear.app/myk9-platform/issue/MYK9-117) is Done.
- **SA-2026-07-30-01 — HIGH/P0, resolved:** locked ownership guards plus fresh-database and
  applied exploit-path tests deny all three cross-tenant UUID-conflict paths. Independently
  **confirmed resolved**. [MYK9-130](https://linear.app/myk9-platform/issue/MYK9-130) is Done.

## Findings

### [HIGH] SA-2026-07-31-01: Edge role checks ignore expiration and revocation

- **Classification/status:** privilege persistence, account takeover, destructive administration,
  cross-tenant messaging, and notification data exposure; **new**
- **Canonical/source severity:** **P0 / HIGH**
- **First seen / last seen / consecutive runs:** 2026-07-31 / 2026-07-31 / **1**
- **Baseline:** `1f5ccb8a4`
- **Affected principals:** expired site admin; expired club admin/secretary; revoked or expired
  secretary with a retained push subscription
- **Confidence:** **high**
- **Existing reference:** [MYK9-145](https://linear.app/myk9-platform/issue/MYK9-145) (Todo;
  created after audit approval)
- **Independent review:** **confirmed HIGH/P0; one root cause and one finding**

**Observed evidence.** Role expiration is a supported product path:
`apps/myk9show/src/components/admin/permissions/UserRoleAssignmentDialog.tsx:57-65` captures an
expiration and `apps/myk9show/src/services/rbac/RoleManager.ts:224-234` persists it. The canonical
`is_site_admin()` helper requires both `is_active` and `expires_at > now()`
(`supabase/migrations/156_denormalize_auth_user_id_into_user_roles.sql:106-120`). The shared HTTP
envelope validates a bearer token but then supplies a service-role client, making each handler's
explicit role check the authorization boundary
(`supabase/functions/_shared/http/handler.ts:17-24,73-103`).

The following service-role paths check `is_active` but omit `expires_at`:

- `admin-generate-reset-link` authorizes at
  `supabase/functions/admin-generate-reset-link/generateResetLinkHandler.ts:25-49`, creates a
  recovery credential at `:58-67`, and returns the action link at `:71-74`.
- `admin-delete-user` authorizes at
  `supabase/functions/admin-delete-user/deleteUserHandler.ts:22-47`, hard-deletes the person and
  cascading data at `:58-83`, then deletes the Auth identity at `:85-95`.
- `admin-invite-user` authorizes at
  `supabase/functions/admin-invite-user/inviteUserHandler.ts:81-115` and generates invite or
  magic-link credentials at `:257-304`.
- Expired scoped roles remain senders in
  `supabase/functions/send-registration-email/index.ts:170-211`,
  `supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts:303-337`, and
  `supabase/functions/send-targeted-message/targeted-message-handler.ts:283-320`.
- `push-trigger-support-message` sends support message bodies to site-admin assignments selected
  only by `is_active` (`supabase/functions/push-trigger-support-message/index.ts:102-113,180-225`).

`push-trigger-chat-message` is weaker still: its secretary/platform-admin fanout checks neither
`is_active` nor `expires_at` (`supabase/functions/push-trigger-chat-message/index.ts:48-75`) and
puts the first 100 characters of the exhibitor's message into a push payload (`:123-148`). A fully
revoked former secretary can therefore continue receiving previews.

Positive controls show the intended contract: `send-email/authz.ts:150-166` and
`send-results/authz.ts:114-130` apply the shared unexpired-role filter.

**Concrete attack path.** Give a site admin a temporary role, allow `expires_at` to pass while its
`is_active` flag and Auth account remain. The former admin can use any valid account JWT to call
`admin-generate-reset-link` for a target email and receive a single-use recovery URL, call
`admin-delete-user` for another person ID, or mint invitations. A former show official can invoke
the three service-role messaging handlers against the old show. A revoked/expired former secretary
with a registered push subscription receives new exhibitor or support message previews without
calling anything.

**Expected vs observed.** Every authorization and privileged fanout must require a currently active,
unexpired role. The affected paths implement inconsistent subsets of that contract.

**Impact:** arbitrary account recovery/account takeover, irreversible data deletion, unauthorized
identity creation, cross-tenant operational messages, and post-revocation message disclosure.

**Next action:** centralize active/unexpired role filtering for service-role handlers; add the filter
to all caller checks and recipient fanouts above; treat `platform_admin` compatibility intentionally;
fail closed on query errors. **Auto-fixable: Yes.**

**Closure proof:** unit tests and a disposable/deployed role matrix must show expired and
`is_active=false` site-admin/secretary assignments receive 403 and no side effects from every
privileged handler, receive no chat/support pushes or emails, and cannot recover/delete/invite an
account. Null-expiry and future-expiry authorized roles must retain each intended capability.

### [HIGH] SA-2026-07-29-01: Secret hide counts survive in the shared offline cache

- **Classification/status:** score-integrity data exposure; **unchanged, partially remediated**
- **Canonical/source severity:** **P0 / HIGH**
- **First seen / last seen / consecutive runs:** 2026-07-29 / 2026-07-31 / **4**
- **Baseline:** `1f5ccb8a4`
- **Affected principal:** later exhibitor/bare session on a browser that previously held official
  access; shared-device role transition
- **Confidence:** **high**
- **Existing references:** MYK9-116, MYK9-127, duplicate MYK9-128
- **Independent review:** **confirmed unchanged; wire remediation valid, cache limb open**

**Observed evidence.** Migrations `20260731160000` and `20260731170000` revoke authenticated access
to `classes.num_hides` and expose it through a manager/steward/assigned-judge/current-passcode RPC
(`supabase/migrations/20260731160000_add_show_class_hide_counts_rpc.sql:47-137`; authenticated
column grant at
`supabase/migrations/20260731170000_gate_class_hide_counts_from_competitors.sql:73-88`). The class replicator now uses
that RPC and merges the result into offline rows
(`apps/myk9show/src/services/replication/ReplicatedClassesTable.ts:439-506`). Applied evidence in
MYK9-127 shows exhibitor column and predicate probes denied while intended officials pass.

The protected value is still deliberately persisted for offline scoring. All users share the
single `myK9_Replication` IndexedDB name (`packages/replication/src/constants.ts:8-17`). Anonymous
leave only signs out (`apps/myk9show/src/pages/ringsideAnonSession.ts:128-138`), and account sign-out
clears appearance state but not replication state (`apps/myk9show/src/hooks/useAuth.ts:270-283`).
Class sync is incremental by `updated_at`
(`apps/myk9show/src/services/replication/ReplicatedClassesTable.ts:439-450`); a role loss does
not update the class, so the old row need not be fetched and nulled. The generic engine keeps the
shared replica until a later full sync and does no class stale-row cleanup
(`packages/replication/src/syncReplicatedTable.ts:153-190,305-333`). Offline use can retain it
indefinitely.

**Attack path.** An official/passcode judge syncs the show, leaving `hideCount` in IndexedDB. The
role expires, the user leaves/signs out, or another user takes the shared device. The later
competitor inspects the offline cache before a clearing full sync and learns the judge-set count.

**Expected vs observed.** Wire denials are now correct, but leaving a protected role must remove
protected cached fields without sacrificing authorized offline scoring.

**Impact:** decisive pre-run scent-work advantage; **high confidence**.

**Next action:** finish MYK9-127's offline and cache lifecycle acceptance. **Auto-fixable: No**;
user-scoped replicas versus field-specific purge is a show-day reliability decision.

**Closure proof:** exhibitor and exhibitor-passcode wire denials; authorized judge/steward online
and network-disabled scoring; a shared-browser role-transition test proving protected fields are
removed on leave, revocation, expiry, and sign-out.

### [HIGH] SA-2026-07-29-11: Premium authorization fix awaits complete closure proof

- **Classification/status:** authorization bypass and AI cost abuse; **blocked**
- **Canonical/source severity:** **P1 / HIGH**
- **First seen / last seen / consecutive runs:** 2026-07-29 / 2026-07-31 / **3**
- **Baseline:** `1f5ccb8a4`
- **Affected workflow:** premium generation
- **Confidence:** **high in the source fix; incomplete closure confidence**
- **Existing reference:** MYK9-125 (Todo)
- **Independent review:** **confirmed blocked, not resolved**

**Observed evidence.** `generate-premium` now runs `resolvePremiumGenerationAuthorization` before
show fetch, limiter, or model (`supabase/functions/generate-premium/index.ts:18-69,185-203`). The
helper rejects anonymous users, calls the established manager predicates, and fails closed
(`supabase/functions/generate-premium/authz.ts:50-90`). Unit tests and deployed probes recorded in
MYK9-125 show anonymous/exhibitor denial and manager predicate success.

**Original attack path now closed in source/deployment:** enumerate public show IDs with an
anonymous or ordinary account and trigger paid generation. Denied callers now stop before cost.

**Why blocked:** the accepted closure criteria also require a successful authorized paid call and
an explicit account-wide ceiling decision. The limiter remains per `user + show`
(`supabase/functions/generate-premium/premiumRateLimit.ts:12-30`), and the authorized paid smoke
was not performed. The issue is Todo.

**Next action/closure proof:** one approved real secretary/club-admin/site-admin generation succeeds;
anonymous, exhibitor, judge, and predicate-error paths return 403 before limiter/model; record and
test the chosen cross-show account budget. **Auto-fixable: No.**

### [HIGH] SA-2026-07-29-02: Anonymous account-wide reads are denied

- **Classification/status:** cross-tenant/account-wide data exposure; **resolved**
- **Canonical/source severity:** **P1 / HIGH**
- **First seen / resolved:** 2026-07-29 / 2026-07-31
- **Baseline:** `1f5ccb8a4`
- **Existing reference:** MYK9-117 (Done)
- **Independent review:** **confirmed resolved**

Migration
`supabase/migrations/20260731180000_exclude_anonymous_sessions_from_account_reads.sql:48-165`
adds the
invoker `is_real_account()` guard to RBAC catalogs, volunteers, operational data, activity log,
announcements, and checklist reads while preserving intentionally public/ringside tables.
MYK9-117 and PR #1546 record the pre-fix exploit (volunteer PII and RBAC rows), applied post-fix
anonymous zero-row/denial proof, positive public show/rulebook reads, real-account access, and
show-manager roster access. The registered behavioral test also passes on a clean migrated database.

**Former attack path:** mint a bare anonymous Auth identity and query unconditional authenticated
policies. **Closure proof satisfied:** both the denial and positive ringside dependencies were tested
against applied behavior. Reopen if a bare anonymous identity reaches protected account-wide data.

### [HIGH] SA-2026-07-30-01: Cross-tenant show-creation UUID conflicts are denied

- **Classification/status:** cross-tenant authorization/integrity; **resolved**
- **Canonical/source severity:** **P0 / HIGH**
- **First seen / resolved:** 2026-07-30 / 2026-07-31
- **Baseline:** `1f5ccb8a4`
- **Existing reference:** MYK9-130 (Done)
- **Independent review:** **confirmed resolved**

Migrations `20260731120000_create_show_with_children_tenant_guard.sql` and
`supabase/migrations/20260731140000_create_show_with_children_lock_owner_reads.sql:137-151,178-190,233-246`
verify and
lock existing show/trial/class ownership before treating UUID conflicts as idempotent. The
behavioral test covers all three cross-tenant ID paths, victim-row immutability, rollback, and a
same-tenant retry. PRs #1540/#1541 record an applied rolled-back pass and fresh local migrated CI
pass; the test is now exhaustively registered.

**Former attack path:** a Club A manager supplied Club B show/trial/class UUIDs to the definer RPC
and attached children after `ON CONFLICT DO NOTHING`. **Closure proof satisfied.** Reopen if any
cross-tenant conflict creates/changes a victim row or unlocked ownership regression appears.

### [MEDIUM] SA-2026-07-29-03: Public judge assignments expose `fee` and `notes`

- **Status/severity:** **unchanged; P2 / MEDIUM**
- **First seen / last seen / consecutive runs:** 2026-07-29 / 2026-07-31 / **4**
- **Confidence:** high
- **Reference:** [MYK9-146](https://linear.app/myk9-platform/issue/MYK9-146) (Todo)
- **Independent review:** confirmed

The public policy remains `USING (true)`
(`supabase/migrations/006_rls_policies.sql:265-270`) and anon retains table-level SELECT
(`supabase/migrations/20260730220000_codify_pre_rule_table_grants.sql:331-351`). A cold-anon REST
caller can select
`fee` and unrestricted `notes`; exploitation requires a club to populate them.

**Expected/impact:** only judge identity and schedule should be public; compensation/internal notes
may leak. **Next action:** column allowlist. **Auto-fixable: Yes.** **Closure proof:** anon receives
`42501` for fee/notes and the public judge panel still renders.

### [MEDIUM] SA-2026-07-29-06: Stewards inherit office-administration authority

- **Status/severity:** **unchanged; P2 / MEDIUM**
- **First seen / last seen / consecutive runs:** 2026-07-29 / 2026-07-31 / **4**
- **Confidence:** high
- **Reference:** [MYK9-147](https://linear.app/myk9-platform/issue/MYK9-147) (Todo)
- **Independent review:** confirmed

`is_show_official()` includes active, unexpired stewards
(`supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql:49-75`). It authorizes
enrollment writes at `:79-101` and judge-assignment insert/update/delete at
`supabase/migrations/20260728131000_split_showday_manage_read_rls.sql:5-70`. A current steward can
therefore submit
direct show-scoped office mutations. Anonymous passcode claims do not satisfy this helper.

**Expected/impact:** steward intent is ring flow, while secretary/admin manages enrollment and judge
contracts; current policies allow integrity changes. **Next action:** split office and show-day
predicates. **Auto-fixable: No.** **Closure proof:** real steward denial plus positive ringside and
secretary/admin role matrix.

### [MEDIUM] SA-2026-07-29-12: AskQ accepts disposable anonymous identities and a racy quota

- **Status/severity:** **unchanged; P2 / MEDIUM**
- **First seen / last seen / consecutive runs:** 2026-07-29 / 2026-07-31 / **3**
- **Confidence:** high
- **References:** [MYK9-148](https://linear.app/myk9-platform/issue/MYK9-148) (Todo); related
  MYK9-22/MYK9-26
- **Independent review:** confirmed

AskQ accepts any `auth.getUser()` result without rejecting `user.is_anonymous`
(`supabase/functions/ask-myk9show/index.ts:92-117`). It counts rows then inserts a provisional log
in separate operations and ignores the insert error (`:148-200`). Disposable identities reset the
free quota; concurrent requests can observe the same count. Tenant context itself fails closed: a
show is attached only after an unexpired role or owned-dog entry (`:273-306`), and tools receive
only that verified context.

**Attack path/impact:** rotate anonymous identities and burst calls before provisional rows become
visible to consume paid model capacity. **Next action:** reject anonymous identities and use an
atomic reservation RPC. **Auto-fixable: No.** **Closure proof:** anonymous denial before model plus
concurrency test proving only the configured number of reservations succeeds.

### [MEDIUM] SA-2026-07-29-13: Cross-user RBAC lookup is denied

- **Status/severity:** **resolved; P2 / MEDIUM**
- **First seen / resolved:** 2026-07-29 / 2026-07-31
- **Confidence:** high
- **References:** no dedicated Linear issue; closure is recorded in PR #1540 CI
- **Independent review:** confirmed resolved

Migration
`supabase/migrations/20260730110000_restrict_rbac_access_lookups.sql:10-29,31-55,95-112,159-181,209-230`
gates all four definer RPCs to self or site-admin inspection. The behavioral test proves self,
cross-user `42501`, and site-admin access for all four. PR #1540 registered every dormant SQL test;
its fresh Supabase CI job passed all 12 then-current files, including this test. Subsequent current
CI SQL jobs are green.

**Former attack path:** an exhibitor supplied another Auth UUID to enumerate roles, scopes, and
permissions. **Closure proof satisfied.** Reopen on any non-self/non-admin success.

### [LOW] SA-2026-07-29-08: Public entries policy omits entry soft delete

- **Status/severity:** **unchanged; P3 / LOW**
- **First seen / last seen / consecutive runs:** 2026-07-29 / 2026-07-31 / **4**
- **Confidence:** high
- **Reference:** [MYK9-149](https://linear.app/myk9-platform/issue/MYK9-149) (Todo)
- **Independent review:** confirmed

`entries_anon_select_for_tv` checks only the parent show's `deleted_at`
(`supabase/migrations/108_tv_display_anon_access.sql:12-21`). A soft-deleted entry in a public show
remains reachable through the safe column grant.

**Impact:** stale identity/scheduling data, not payment/score fields. **Next action:** add
`entries.deleted_at IS NULL`. **Auto-fixable: Yes.** **Closure proof:** soft-deleted entries are
absent from REST, TV, public views, and public replication.

### [LOW] SA-2026-07-30-02: ACL monitor awaits its first real healthy snapshot

- **Status/severity:** **blocked; P2 / LOW**
- **First seen / last seen / consecutive runs:** 2026-07-30 / 2026-07-31 / **2**
- **Confidence:** high in source; final scheduled evidence pending
- **Existing reference:** [MYK9-132](https://linear.app/myk9-platform/issue/MYK9-132) (Todo)
- **Independent review:** confirmed blocked

The source now correctly excludes `classes` from table grants and requires its 52-column allowlist
(`apps/myk9show/supabase/functions/_shared/anonGrantChecks.ts:46-172`), with an independent fixture
and negative table-grant regression. Live applied ACL facts passed when fed to the deployed checker.
MYK9-132 intentionally remains open until the next actual scheduled `system_health_snapshot` row
reports healthy; that row did not exist at reconciliation time.

**Former operational path:** the monitor accepted the obsolete table grant and could miss a
recurrence of hide-secret exposure. **Next action:** observe the next scheduled snapshot.
**Auto-fixable: Yes** (source is already fixed). **Closure proof:** a real scheduled healthy
snapshot plus the old table-grant negative test.

### [INFO] SA-2026-07-29-05: Preview CORS regex has no victim-token path

- **Status/severity:** **unchanged; P3 / INFO**
- **First seen / last seen / consecutive runs:** 2026-07-29 / 2026-07-31 / **4**
- **Confidence:** medium-high
- **Independent review:** no exploit path
- **Reference:** [MYK9-150](https://linear.app/myk9-platform/issue/MYK9-150) (Backlog)

The preview regex remains broad (`supabase/functions/_shared/http/cors.ts:29-47`), but protected
functions require bearer tokens an attacker origin cannot read, no credentialed cookies are used,
and CORS does not constrain direct server callers. Keep as accepted hardening information unless a
credential-bearing browser path emerges. Closure is an exact deployment-origin contract or an
explicit accepted-risk note. **Auto-fixable: No without origin policy.**

### [INFO] SA-027: SECURITY DEFINER functions use `search_path=public`

- **Status/severity:** **unchanged; P3 / INFO**
- **First seen / last seen / consecutive runs:** 2026-07-10 / 2026-07-31 / **5**
- **Alias:** SA-2026-07-29-09 is duplicate
- **Confidence:** high
- **Independent review:** accepted dependency; no exploit path
- **Reference:** [MYK9-151](https://linear.app/myk9-platform/issue/MYK9-151) (Backlog)

Surviving definer definitions still use `search_path=public`, but prior applied evidence showed API
roles cannot `CREATE` in `public`; no attacker-controlled shadow object can be placed. No current
change alters that ACL dependency. Closure is empty-path/qualified conversion or accepted-risk
documentation. **Auto-fixable: No.**

## Candidate dispositions

| Candidate | Status | Evidence |
| --- | --- | --- |
| SA-2026-07-31-01 | **new/confirmed** | Complete role model, envelope, side-effect, and fanout paths establish expired/revoked privilege retention. |
| SA-2026-07-29-04 (`people.email`) | **rejected** | Documented PostgREST embed dependency; people RLS returns no cold-anon rows. |
| SA-2026-07-29-07 (branding storage predicate) | **rejected as security** | Ambiguous binding fails closed; product correctness only. |
| SA-2026-07-29-09 | **duplicate** | Canonical SA-027. |
| SA-2026-07-29-10 (advisor comments) | **rejected** | Required deny-all rationale comments exist. |
| Expired secretary/chairman contact in generated premium | **not promoted** | Authorized managers may receive stale presentation data; it is not a caller authorization decision and no additional unauthorized path was established. |

## Categories checked

| Category | Scope examined | Findings | Incomplete/blocked |
| --- | --- | ---: | --- |
| RLS Policy Integrity | 446 migrations; final grants/policies/helpers; FORCE-RLS, migration-grant, anon-grant, and behavioral registry contracts | 01, 02, 03, 08, 13, 30-01, 30-02 | No new live catalog query |
| Edge Function Auth | all 36 entrypoints inventoried; complete shared envelope and implicated handlers/dependencies read; all changed entrypoints reviewed | 11, 12, 31-01; INFO 05 | No destructive/paid live invocation |
| RBAC & Privilege Escalation | roles, permissions, role_permissions, user_roles, expiry model, helpers, definer RPCs, direct service-role queries | 06, 13, 30-01, 31-01; INFO SA-027 | Expired-role endpoint matrix not replayed |
| Client Auth Patterns | Auth lifecycle, anonymous session, route guards, passcode claims/revocation, 13 route files | 01, 02 | Static/shared-browser only |
| Data Exposure & Replication | AskQ tenant scope/tools; 16-table offline database; class RPC/enrichment; support/chat fanout; storage/input scans | 01, 02, 03, 08, 12, 31-01 | Public bucket objects not fetched |
| Payment Security | 12 app Edge entrypoints including checkout, Connect, portal, payment link, entry/show refund, subscription, webhook, waitlist cron, and payout cron; locks, livemode, snapshots, signatures | 0 | No paid/refund/payout smoke |
| Multi-registry | registry migrations/helpers and 41 matched catalog/title/scoring files; authorization-coupling search | 0 | Static only |
| Input Validation | UUIDs, same-origin redirects, HTML escaping/sinks, upload validation, webhook secrets/signatures, URL params | 0 | Static only |

### Focus areas with no additional concrete finding

- **AskQ tenant data:** role/owned-entry verification precedes service-role show context and tools;
  only identity rotation and the non-atomic quota remain SA-2026-07-29-12.
- **Anonymous passcode claims (PRs #951-954):** service-controlled `app_metadata`, show/role/generation
  checks, and explicit mutation fields remain fail-closed. Broad account reads are resolved in 02;
  protected offline residue remains 01.
- **Multi-registry (PRs #1040-1056):** registry values drive catalog/title/scoring semantics, not
  tenant or role predicates. No cross-registry authorization bypass was established.
- **Withdrawal snapshots/refunds:** server-resolved snapshots, money locks, payout-state checks, and
  manual fallback remain intact.
- **Stripe/payout:** webhook signatures use the proper platform/Connect secret, inputs and redirects
  are allowlisted, authoritative fees are server-side, records are livemode-scoped, and payout cron
  uses a dedicated secret and transfer-group reconciliation.
- **Storage/input:** upload MIME/size and write-path ownership controls remain; public image read is
  intentional. No unauthorized write path was established.
- **Support triage:** the new external scheduled workflow uses its configured gateway and controlled
  enums; no database/service-role exposure or prompt-to-command path was found.

## Verification

- **77 app test files / 600 tests passed**: complete `src/test/database`, class replication, and
  anonymous ringside-session tests.
- **50 shared/AskQ/Stripe test files / 465 tests passed**: payment/refund/payout/withdrawal helpers,
  webhook dispatch/signatures, applied ACL checker, system health, AskQ scope/routing, and shared
  HTTP auth.
- **11 pure Edge/harness files / 121 tests passed**: admin user handlers, premium auth/limiter,
  send-email/results authorization, passcode CORS/rate gate, and behavioral SQL registry.
- **Total focused pass:** **138 files / 1,186 tests**. An initial root-config invocation could not
  resolve the app `@` alias before collecting `ReplicatedClassesTable`; the same file passed under
  the app's required Vitest config.
- Existing applied/fresh-database exploit proof was reconciled from PRs #1540, #1541, #1546,
  #1548 and Linear. No new shared-system write was performed.

## Previous audit comparison

The delta from `18e560c6c` to `1f5ccb8a4` is 87 files (+10,389/-1,747) and includes the tenant
guard/locking, behavioral SQL registration, hide-count gating, anonymous-read scoping, premium
authorization, admin invitations, and support triage.

| Prior tracked item | Transition |
| --- | --- |
| SA-2026-07-29-01 | **unchanged/partial:** wire/predicate denials proved; shared cache lifecycle remains exploitable |
| SA-2026-07-29-02 | **resolved:** applied negative and positive anonymous-session proof |
| SA-2026-07-29-03, -05, -06, -08, -12, SA-027 | **unchanged** |
| SA-2026-07-29-11 | **blocked:** unauthorized path closed; full accepted closure proof incomplete |
| SA-2026-07-29-13 | **resolved:** registered fresh-database behavioral SQL proof |
| SA-2026-07-30-01 | **resolved:** locked guards and exploit-path proof |
| SA-2026-07-30-02 | **blocked:** source/live-fact check fixed; real scheduled snapshot pending |
| SA-2026-07-31-01 | **new:** expired/revoked roles retain Edge capabilities and fanout |

Historical closures SA-020, SA-021, SA-023, SA-024, SA-025, SA-028, SA-029, and SA-030 retain
their prior status and proof. They were not re-resolved from inspection.

## Independent `/codex:review` disposition

| Item | Verdict |
| --- | --- |
| 2026-07-31-01 | confirmed new HIGH/P0; umbrella finding covers caller gates and recipient fanout |
| 2026-07-29-01 | confirmed unchanged HIGH/P0; shared IndexedDB residue survives the wire fix |
| 2026-07-29-02 | confirmed resolved HIGH/P1 with source plus applied proof |
| 2026-07-29-03 | confirmed unchanged MEDIUM/P2 |
| 2026-07-29-05 | INFO/P3; no victim-token path |
| 2026-07-29-06 | confirmed unchanged MEDIUM/P2 |
| 2026-07-29-08 | confirmed unchanged LOW/P3 |
| SA-027 | duplicate/accepted-dependency INFO/P3 |
| 2026-07-29-11 | confirmed blocked HIGH/P1; unauthorized path closed, proof incomplete |
| 2026-07-29-12 | confirmed unchanged MEDIUM/P2 |
| 2026-07-29-13 | confirmed resolved MEDIUM/P2 with behavioral proof |
| 2026-07-30-01 | confirmed resolved HIGH/P0 with exploit-path proof |
| 2026-07-30-02 | confirmed blocked LOW/P2 pending the scheduled snapshot |

The independent review did not perform runtime mutations and found no contradictory payment,
multi-registry, passcode-claim, or AskQ tenant-scope path.

## Coverage gaps (not passes)

1. **No new live database/HTTP mutation.** Existing applied evidence was reconciled; this audit did
   not create an Auth identity, role fixture, or database row.
2. **No expired/revoked-role Edge replay.** Direct recovery/delete/invite tests require a disposable
   account/function target and are the closure gate for SA-2026-07-31-01.
3. **No shared-browser cache exploit replay.** The persistence path is established in source, but a
   real offline role-transition test remains MYK9-127's gate.
4. **No real exhibitor/secretary/judge/steward end-to-end token matrix.** Existing applied SQL proof
   covers narrower policy/RPC decisions.
5. **No authorized paid premium smoke or account-wide quota decision.** SA-2026-07-29-11 remains
   blocked.
6. **No real post-fix scheduled ACL snapshot yet.** SA-2026-07-30-02 remains blocked.
7. **Public storage objects were not fetched or inventoried.**
8. **Out of skill scope:** dependency/supply-chain, git-history secret scanning, penetration, and
   load testing.

## Linear reconciliation and approval outcome

No Linear issue was created, updated, or closed during the read-only audit. On 2026-08-01, the user
approved issue creation for every active finding without a dedicated issue. Seven issues were
created; no existing issue was modified or closed.

| Finding | Existing issue | Current state |
| --- | --- | --- |
| SA-2026-07-29-01 | [MYK9-116](https://linear.app/myk9-platform/issue/MYK9-116) | Done for cold-anon scope |
| SA-2026-07-29-01 | [MYK9-127](https://linear.app/myk9-platform/issue/MYK9-127) | Todo; offline/cache proof remains |
| SA-2026-07-29-01 | MYK9-128 | Duplicate of MYK9-127 |
| SA-2026-07-29-02 | [MYK9-117](https://linear.app/myk9-platform/issue/MYK9-117) | Done |
| SA-2026-07-29-03 | [MYK9-146](https://linear.app/myk9-platform/issue/MYK9-146) | Todo |
| SA-2026-07-29-05 | [MYK9-150](https://linear.app/myk9-platform/issue/MYK9-150) | Backlog; hardening/accepted-risk decision |
| SA-2026-07-29-06 | [MYK9-147](https://linear.app/myk9-platform/issue/MYK9-147) | Todo |
| SA-2026-07-29-08 | [MYK9-149](https://linear.app/myk9-platform/issue/MYK9-149) | Todo |
| SA-2026-07-29-11 | [MYK9-125](https://linear.app/myk9-platform/issue/MYK9-125) | Todo |
| SA-2026-07-29-12 | [MYK9-148](https://linear.app/myk9-platform/issue/MYK9-148) | Todo |
| SA-027 | [MYK9-151](https://linear.app/myk9-platform/issue/MYK9-151) | Backlog; hardening/accepted-risk decision |
| SA-2026-07-30-01 | [MYK9-130](https://linear.app/myk9-platform/issue/MYK9-130) | Done |
| SA-2026-07-30-02 | [MYK9-132](https://linear.app/myk9-platform/issue/MYK9-132) | Todo, awaiting snapshot |
| SA-2026-07-31-01 | [MYK9-145](https://linear.app/myk9-platform/issue/MYK9-145) | Todo |

### Approved Linear draft — SA-2026-07-31-01 / MYK9-145

**Title:** Reject expired and revoked roles in privileged Edge paths

**Problem.** Service-role Edge handlers and notification fanouts reimplement role validity
inconsistently. Several caller gates require only `is_active`; chat fanout requires neither
`is_active` nor a future/null `expires_at`. Role expiration and revocation therefore do not remove
all privileged capabilities or sensitive message delivery.

**Attack path and evidence.** A site-admin assignment expires while the user's Auth account remains.
The former admin calls `admin-generate-reset-link` for a target email and receives the recovery URL,
hard-deletes another account, or mints invitations. Expired scoped staff can send lifecycle,
registration, or targeted messages for a former show. Revoked/expired secretaries with a retained
push subscription receive exhibitor chat previews, and expired site admins receive support previews.
Evidence: the handler/fanout paths cited in SA-2026-07-31-01 above; canonical expiry enforcement in
`supabase/migrations/156_denormalize_auth_user_id_into_user_roles.sql:106-120`.

**Expected secure behavior.** A role authorizes or receives privileged material only when
`is_active = true AND (expires_at IS NULL OR expires_at > now())`, with the intended scope. Revoked
or expired roles fail closed immediately.

**Impact / severity.** Account takeover, irreversible account/data deletion, identity creation,
cross-tenant messaging, and post-revocation data disclosure; **HIGH source / P0 canonical**.

**Likely root cause.** Multiple service-role handlers and fanout queries duplicate only part of the
RBAC validity contract instead of sharing one active/unexpired predicate.

**Recommended approach.** Introduce a shared Edge role-validity query/helper; migrate every caller
gate and role-derived recipient query; preserve scope matching; decide `platform_admin` compatibility
explicitly; make lookup errors fail closed. Use `send-email/authz.ts`/`send-results/authz.ts` as
positive patterns.

**Acceptance criteria.**

- Expired and inactive site admins cannot generate recovery links, hard-delete users, or invite.
- Expired/inactive show or club staff cannot send registration, lifecycle, or targeted messages.
- Expired/inactive staff receive no chat, support, announcement, or other role-derived content.
- Null-expiry and future-expiry authorized users retain only their intended scoped capabilities.
- All role-derived Edge queries use the shared current-role contract or document why they do not.
- Query failures never authorize a caller or silently include a recipient.

**Regression proof.** Unit tests for `expires_at < now`, `expires_at = now`, `is_active=false`, null
expiry, future expiry, and database error across each handler/fanout. In a disposable deployed
environment, assign a temporary role, prove the allowed path, expire/revoke it, then prove 403/no
side effect/no push or email. Confirm an unexpired current role still succeeds.

**Relevant files/reports.**

- `supabase/functions/_shared/http/handler.ts`
- `supabase/functions/admin-delete-user/deleteUserHandler.ts`
- `supabase/functions/admin-generate-reset-link/generateResetLinkHandler.ts`
- `supabase/functions/admin-invite-user/inviteUserHandler.ts`
- `supabase/functions/send-registration-email/index.ts`
- `supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts`
- `supabase/functions/send-targeted-message/targeted-message-handler.ts`
- `supabase/functions/push-trigger-chat-message/index.ts`
- `supabase/functions/push-trigger-support-message/index.ts`
- `docs/security-audit-2026-07-31.md`

**Approval outcome:** approved and created as
[MYK9-145](https://linear.app/myk9-platform/issue/MYK9-145) on 2026-08-01.

## Finding ledger

```text
SA-2026-07-29-01 | P0 | HIGH   | unchanged | 2026-07-29/2026-07-31 | 4 | MYK9-116/127; MYK9-128 dup | protected wire read closed; shared IndexedDB residue remains | role-transition cache purge + authorized offline scoring
SA-2026-07-29-02 | P1 | HIGH   | resolved  | 2026-07-29/2026-07-31 | 4 | MYK9-117 Done | bare anonymous account-wide reads denied | reopen on applied protected-table read
SA-2026-07-29-03 | P2 | MEDIUM | unchanged | 2026-07-29/2026-07-31 | 4 | MYK9-146 Todo | public judge_assignments exposes fee/notes | protected-column denial + public panel regression
SA-2026-07-29-05 | P3 | INFO   | unchanged | 2026-07-29/2026-07-31 | 4 | MYK9-150 Backlog | broad preview CORS without victim-token path | exact-origin contract or accepted rationale
SA-2026-07-29-06 | P2 | MEDIUM | unchanged | 2026-07-29/2026-07-31 | 4 | MYK9-147 Todo | steward inherits judge/enrollment office writes | steward denial + positive ringside/office matrix
SA-2026-07-29-08 | P3 | LOW    | unchanged | 2026-07-29/2026-07-31 | 4 | MYK9-149 Todo | public entry policy omits entry.deleted_at | deleted entry absent across public paths
SA-027            | P3 | INFO   | unchanged | 2026-07-10/2026-07-31 | 5 | MYK9-151 Backlog | public search_path non-exploitable under schema ACL | empty path or accepted-risk documentation
SA-2026-07-29-11 | P1 | HIGH   | blocked   | 2026-07-29/2026-07-31 | 3 | MYK9-125 Todo | unauthorized paid path closed; accepted proof incomplete | authorized paid smoke + role denials + account budget
SA-2026-07-29-12 | P2 | MEDIUM | unchanged | 2026-07-29/2026-07-31 | 3 | MYK9-148 Todo | AskQ accepts disposable anon and count/insert race | anonymous denial + atomic concurrency proof
SA-2026-07-29-13 | P2 | MEDIUM | resolved  | 2026-07-29/2026-07-31 | 2 | PR #1540 | self/site-admin gate proven on fresh migrated DB | reopen on cross-user non-admin success
SA-2026-07-30-01 | P0 | HIGH   | resolved  | 2026-07-30/2026-07-31 | 2 | MYK9-130 Done | locked tenant ownership and exploit proof | reopen on cross-tenant conflict side effect
SA-2026-07-30-02 | P2 | LOW    | blocked   | 2026-07-30/2026-07-31 | 2 | MYK9-132 Todo | checker fixed; scheduled snapshot pending | real scheduled healthy snapshot
SA-2026-07-31-01 | P0 | HIGH   | new       | 2026-07-31/2026-07-31 | 1 | MYK9-145 Todo | expired/revoked roles retain Edge capabilities/fanout | expired+inactive denial/no-side-effect matrix
REJECTED: SA-2026-07-29-04, SA-2026-07-29-07 (as security), SA-2026-07-29-10
DUPLICATE: SA-2026-07-29-09 -> SA-027
```
