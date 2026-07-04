# Security Audit Remediation — July 2026

> **Status:** Active

> **Executing these plans in a new session?** Start with
> [`EXECUTION-HANDOFF.md`](EXECUTION-HANDOFF.md) — execution order, model tier +
> post-merge deploy action per plan, the SA-006 STOP condition, and the rules of
> the road.

Remediation plans for the full security audit run on 2026-07-03 against commit
`28a72d23f`. The audit report (evidence, risk, per-finding fix guidance, severity
math) is the source of truth: [`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md).
This folder turns those 17 findings into **executable, assertion-first plans**.

**Audit result:** 0 CRITICAL, 0 HIGH, 8 MEDIUM, 9 LOW. No P0/P1 — nothing is
exploitable-now given RLS holds (independently confirmed for the core surface).
The Stripe money path and the RBAC role-table mutations came back **clean**.

## How to execute (rules of the road)

- **Assertion-first** (per `CLAUDE.md` → Testing): for every value/authz-sensitive
  fix, write the failing test that pins the wrong behavior, run it **red**, then
  fix to green. The red→green transition is the proof — not typecheck, not
  inspection. Each plan names its test file and the exact assertion.
- **One PR per plan** (parallelize by _file set_, not by logical feature — repo
  convention). The mechanical batch is the exception: each of its 9 items is its
  own atomic `security: SA-NNN …` commit, but they may ride in one or a few PRs
  grouped by file type (migrations vs. edge fns vs. client).
- **RLS fixes → new migration files, never edit an applied migration.** Run the
  `migration-auditor` subagent before any `supabase db push`. **Merge is not
  deploy** — pushing migrations and redeploying edge functions are separate,
  confirmation-gated steps (Auto-Mode shared-system rule).
- **Codex second opinion ON** for the RLS/edge-fn plans (auth, RBAC, scoping) —
  independent failure modes matter here.

## Verification gates (every plan)

| Purpose          | Command                                                         |
| ---------------- | --------------------------------------------------------------- |
| Typecheck        | `pnpm typecheck`                                                |
| Lint             | `pnpm lint`                                                     |
| App tests        | `cd apps/myk9show && pnpm test`                                 |
| One file         | `cd apps/myk9show && npx vitest run <path>`                     |
| Migration safety | `migration-auditor` subagent, then `supabase db push --dry-run` |

## Plans — execution order & status

Suggested order: close the one cross-tenant tampering vector first (SA-001, in the
mechanical batch), then the scoping-RLS and email-authz design plans, then the
disclosure/hardening tail.

**Tracking moved to OpenSpec** (`openspec/changes/`) as of 2026-07-03 for the five
design-decision plans below — each has a `proposal.md`/`design.md`/`specs/`/`tasks.md`
seeded from its plan doc, apply-ready (`openspec validate` clean). Run
`pnpm exec openspec status --change <name>` for live per-task progress instead of
relying on this table; use `/opsx:apply` (or the `openspec-apply-change` skill) to
execute.

| Plan                                                       | Findings                                                                     | Severity      | Effort | Auto-fix | Status                                                                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [remediation-mechanical.md](remediation-mechanical.md)     | SA-001, 003, 009, 010, 012, 014, 015, 016, 017                               | MED×2 + LOW×7 | S each | Yes      | **DONE** — [#1099](https://github.com/rbeezley/myk9-platform/pull/1099), merged 2026-07-03 (`a5356a74a`)                                                         |
| [plan-scoping-rls.md](plan-scoping-rls.md)                 | SA-002 (promo_codes), SA-007 (trial_judge_supplies)                          | MEDIUM×2      | M      | No       | **DONE + DEPLOYED** — [#1109](https://github.com/rbeezley/myk9-platform/pull/1109) (squash `2be73d70`), pushed + verified live 2026-07-03; Codex caught 3 findings (all fixed); change archived |
| [plan-email-fn-authz.md](plan-email-fn-authz.md)           | SA-004 (send-email), SA-005 (send-auth-email), SA-013 (send-waitlist-invite) | MED×2 + LOW   | M      | No       | IN PROGRESS — code/tests in `codex/security-email-fn-authz`; deploy/env/dashboard steps remain confirmation-gated in `openspec/changes/security-email-fn-authz/` |
| [plan-role-map-disclosure.md](plan-role-map-disclosure.md) | SA-006 (user_roles/permission_audit_log SELECT)                              | MEDIUM        | M      | No       | **DONE + DEPLOYED** — [#1118](https://github.com/rbeezley/myk9-platform/pull/1118) (squash `daeea4d1b`), pushed + verified live 2026-07-04 (pg_policies/pg_proc). Mig `20260703180000` scopes the 5 SELECT policies (user_roles→self-or-admin, audit_log→admin-only, catalog→authenticated) + `get_show_officials`/`get_club_show_manager_ids` SECURITY DEFINER RPCs; 3 client reads repointed. Codex 2nd opinion waived (rate-limited); migration-auditor + manual review clean. |
| [plan-people-overfetch.md](plan-people-overfetch.md)       | SA-008 (`select('*')` on people at login)                                    | MEDIUM        | M      | No       | TODO — `openspec/changes/security-people-overfetch/`                                                                                                             |
| [plan-passcode-throttle.md](plan-passcode-throttle.md)     | SA-011 (`upsert_ringside_session` no throttle)                               | LOW           | S–M    | No       | TODO — `openspec/changes/security-passcode-throttle/`                                                                                                            |

## Reconciliation with in-flight work (read before executing)

- **UX walk remediation** ([`../plan-ux-walk-remediation-2026-07.md`](../plan-ux-walk-remediation-2026-07.md))
  touches client UI only (formatters, shell/nav) and states it expects **no DB
  migrations or edge-function deploys**. The security RLS/edge-fn plans here are a
  **disjoint file set** — safe to run in parallel. The one client-side overlap risk
  is SA-010 (friendly-error mapper) and SA-008 (people over-fetch): coordinate with
  Phase 5 copy work if it lands first, but neither collides with an open Phase 2/3
  package as of `28a72d23f`.
- **Bug audit** ([`../improve-audit-2026-07/README.md`](../improve-audit-2026-07/README.md))
  — SA-011 and SA-016 match its documented "direction" items; execute them **here**
  and mark the bug-audit direction list as covered. Do **not** re-litigate its
  REJECTED ledger (webhook `.every()`, cart-overflow refund, idempotency keys,
  `ringside_update_entry` empty-payload OCC, quota eviction, INSERT 23505).
- **Ringside passcode Phase C review** ([`../security-review-2026-06-24-ringside-passcode-phase-c.md`](../security-review-2026-06-24-ringside-passcode-phase-c.md))
  — its 2 deferred LOWs (anon-user persistence, no claim TTL) are Phase-E ops
  items, out of scope here. This audit re-confirmed the claim tier is forge-proof.

## What this remediation does NOT cover

- Runtime/live-cold-session verification of anon passcode paths — pair with
  `qa-feature` / `audit-pages` before launch.
- Dependency/supply-chain and git-history secret scans (other skills own these).
