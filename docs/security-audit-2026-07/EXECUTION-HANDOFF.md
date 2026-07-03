# Handoff — Execute the July 2026 security-audit remediation

> **Status:** Active
> *(Archive alongside this folder's README once all 6 plans are DONE/closed.)*

**Date:** 2026-07-03
**From:** the `security-audit --full` session (static read-only audit; report +
plans landed on `main` @ `5c3cf3863`, audit pinned at `28a72d23f`).
**To:** the implementing session(s). Mixed model tiers — see the table. Keep a
strong model on **review** for every RLS/edge-fn PR regardless of who writes it.

---

## What this is

A full static security audit ([`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md))
produced this folder: a [README index](README.md) plus **6 executor-ready
plans** covering **17 findings** (0 CRITICAL, 0 HIGH, 8 MEDIUM, 9 LOW; no P0/P1).
Nothing is exploitable-now *given RLS holds* — which the audit independently
confirmed for the core surface. So this is **hardening before a first-club
launch**, not incident response. Fix in the order below; the one finding that
lets a non-manager tamper with another show's data (SA-001) goes first.

## Read first (in order)

1. [`README.md`](README.md) — findings→plan table, verification gates, and the
   **reconciliation section** (what NOT to re-litigate: the bug-audit REJECTED
   ledger, the Phase-C deferred LOWs).
2. [`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md) — the
   report: per-finding evidence (`file:line`), risk, and fix guidance. **Source
   of truth** for what each SA-NNN actually is.
3. `CLAUDE.md` (repo root) — worktree/commit/migration conventions + the **Auto
   Mode shared-system rules** (migrations & deploys are confirmation-gated).
4. For any UX-facing copy (SA-010 friendly errors): `docs/INTENT.md`.

## Branch-state reality (read before you clone)

- The plans exist on **`origin/main` @ `5c3cf3863`**, not on any feature branch
  yet. Start each plan from a **fresh worktree off `main`** so you have them:
  `git worktree add … origin/main && bash scripts/bootstrap-worktree.sh`.
- At handoff, the primary checkout's local `main` was **diverged** (a concurrent
  agent's uncommitted move-up WIP + a stale ref). Do **not** work the remediation
  in that checkout — spin your own worktree. This is why the audit docs were
  pushed via an isolated worktree, not from the primary tree.

## Execution order, model tier, deploy action & status

| Plan | Order | Model | Post-merge deploy (confirm first) | Status |
|------|-------|-------|-----------------------------------|--------|
| [remediation-mechanical.md](remediation-mechanical.md) → **SA-001** (scoring-fn `REVOKE`) | **DO FIRST** | Sonnet OK; **strong review** | **new migration → `supabase db push`** | TODO |
| [remediation-mechanical.md](remediation-mechanical.md) → SA-003 (push-trigger secret) | 2 | Sonnet OK | **deploy `push-trigger-scoring` + `push-trigger-class-status`** *and* update the DB triggers to send the secret | TODO |
| [remediation-mechanical.md](remediation-mechanical.md) → SA-017 (FORCE RLS sweep, ~16 tables) | with SA-001 | Sonnet OK; **strong review** | **new migration → `supabase db push`** | TODO |
| [remediation-mechanical.md](remediation-mechanical.md) → SA-012 (fail-closed secret) | 2 | Sonnet OK | **deploy `send-confirmation-email`** | TODO |
| [remediation-mechanical.md](remediation-mechanical.md) → SA-009/010/014/015/016 (client hardening) | anytime | Sonnet OK | client-only (ships via Vercel on merge) | TODO |
| [plan-scoping-rls.md](plan-scoping-rls.md) — SA-002, SA-007 | 3 | **Strong** + Codex | **new migration → `supabase db push`** | TODO |
| [plan-email-fn-authz.md](plan-email-fn-authz.md) — SA-004, SA-005, SA-013 | 3 | **Strong** + Codex | **deploy the 3 fns**; SA-005 also needs the auth-hook `whsec_…` secret provisioned in the dashboard | TODO |
| [plan-role-map-disclosure.md](plan-role-map-disclosure.md) — SA-006 | 4 | **Strong** + Codex | **new migration → `supabase db push`** | TODO |
| [plan-people-overfetch.md](plan-people-overfetch.md) — SA-008 | 4 | Sonnet OK; strong review | client-only | TODO |
| [plan-passcode-throttle.md](plan-passcode-throttle.md) — SA-011 | 5 | **Strong** + Codex | **new migration → `supabase db push`** (or route through the rate-limited edge fn) | TODO |

**Why the model split:** the mechanical batch is known-pattern work (a `REVOKE`,
a `FORCE RLS` sweep, an `escapeHtml`, a friendly-error wrapper) — execution-tier
models run it without loss, but keep a **strong reviewer** on the two migrations
(a bad `REVOKE`/`FORCE` can break a live path). The design plans require a real
decision — *which* scope predicate, *who* may send which email, *whether* the
role-map read is safe to restrict without breaking the RBAC UI — so keep those on
a strong model **and** run Codex for the independent failure mode.

**The one true STOP condition — SA-006:** restricting `user_roles` SELECT can
break any frontend that reads the full role map. The plan's first step is to
**prove which client read paths depend on it** before writing the migration. If
you can't prove it, stop and surface — do not ship a policy that blank-500s the
admin UI.

## Rules of the road

- **Work in a git worktree, never the primary checkout.** After creating one:
  `bash scripts/bootstrap-worktree.sh` (deps, env, package builds).
- **One PR per plan** (parallelize by *file set*, not logical feature). The
  mechanical batch is the exception: each SA-NNN is its own atomic
  `security: SA-NNN …` commit, groupable into a few PRs by file type
  (migrations vs. edge fns vs. client) so disjoint file sets don't collide.
- **Assertion-first** (`CLAUDE.md` → Testing): write the failing test that pins
  the wrong behavior, run it **red**, then fix to green. For RLS that means a
  policy test proving the *unauthorized* caller is denied and the *authorized*
  one passes. The red→green transition is the proof — not typecheck, not a read.
- **RLS fixes → new migration files, never edit an applied one.** Run the
  `migration-auditor` subagent before any push; QUERY the target table/policy's
  final state first (later migrations supersede earlier ones).
- **Merge is not deploy.** `supabase db push` and `functions deploy` are
  **separate, human-confirmed** steps (Auto Mode shared-system rule). The
  docs-only-direct-to-main exception does **NOT** apply to any of this code.
- **Codex second opinion ON** for every RLS/edge-fn/RBAC plan.
- Each plan flips its own row (here and in [`README.md`](README.md)) to DONE when
  its PR merges **and** its deploy step has run.

## Do NOT re-audit (settled)

- The **bug-audit REJECTED ledger** (`../improve-audit-2026-07/README.md`):
  webhook `.every()`, cart-overflow refund, auto-refund idempotency key, cart
  email re-send latch, `ringside_update_entry` empty-payload OCC, quota eviction,
  INSERT 23505 — all vetted as non-issues.
- The **Stripe money path** — the audit read every Stripe fn and found it clean
  (signatures, server-side pricing, refund caps, portal scoping). Don't reopen it
  without new evidence.
- The **ringside passcode claim tier** — verified forge-proof; never widens the
  admin/PII columns. SA-011 is only about the *unthrottled direct RPC*, not the
  claim design.

## Out of scope for this remediation (separate follow-ons)

- **Live cold-session verification** of the anon passcode/ringside paths — a
  static read can't substitute. Pair with `qa-feature` / `audit-pages` before
  launch. This is the highest-value gap the static audit could not close.
- **Dependency/supply-chain scan** (`code-review-extensions` / `npm audit`) and
  **git-history secret scan** (trufflehog) — neither is covered by a working-tree
  static read.
