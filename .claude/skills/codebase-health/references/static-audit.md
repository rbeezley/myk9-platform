---
name: code-quality-audit
description: Repo-wide static quality audit for myK9 maintainability debt. Use when asked to run a code-quality audit, repeat the June 2026 audit, check static debt drift, inspect one audit dimension, or prepare a launch-milestone quality sweep.
user-invocable: true
argument-hint: [--full | dimension-name]
---

# Code-Quality Audit

Use this skill for static maintainability debt that diff-scoped review misses. Do not use it for security, migration safety, runtime page QA, or UX/IA quality; route those to their dedicated skills.

## Modes

Parse the user request:

- `--full`, `full`, or no dimension: run the full sweep.
- A dimension name: run only that dimension, then verify findings in that dimension.

Dimensions:

1. `oversized-files`
2. `dead-code`
3. `duplication`
4. `replication-bypasses`
5. `type-escapes-schema-drift`
6. `todo-triage`
7. `test-gaps`
8. `config-flag-debt`

## Required Setup

1. Run the worktree start check before writes: `git branch --show-current` and `git rev-parse --git-dir --git-common-dir`.
2. Read `docs/goals/fall-2026-launch-readiness.md`, `docs/INTENT.md`, and `docs/plan-code-quality-audit.md`.
3. Write durable findings under `docs/audits/YYYY-MM-code-quality/`. Do not leave the audit only in chat.
4. Do not mutate shared systems during inventory. PRs, pushes, Supabase, Vercel, Slack, email, and comments need their own approval.

## Sweep Workflow

For each selected dimension:

1. Record exact commands, excluded paths, and tool failures in that dimension doc.
2. File findings with severity, file:line evidence, verification status, and proposed fix.
3. Protect `// INTENT:` behavior. If a finding touches INTENT-backed code, say so explicitly.
4. For UI/workflow findings, answer: "Does this duplicate an existing page? If so, why is duplication justified instead of a link?"
5. Route security, auth/RLS, payment, migration, and runtime-health issues out of this audit with a short pointer.

## Verification

Verify every P1/P2 finding adversarially before implementation:

- Dead code: prove absence across `apps/`, `packages/`, `supabase/functions/`, route registries, re-export barrels, and docs.
- Duplication: prove both copies are the same concern, not intentionally separate.
- Replication bypass: prove the surface needs show-day/offline support.
- Type/schema drift: match actual generated types, migrations, and current DB caveats; do not guess property names.
- Tool uncertainty: if a finder failed or used a fallback, confirm representative samples by an independent method.

Mark findings `confirmed`, `refuted`, or `needs-human`. Keep refuted findings in the docs so future audits do not re-file them.

## Fix Waves

Only implement after the user approves the verified fix list.

1. Wave A: pure deletions.
2. Wave B: consolidations and type canonicalization.
3. Wave C: oversized-file extractions.
4. Wave D: replication reroutes plus targeted tests.

Each wave gets a focused branch/PR, targeted tests, broad verification when risk is high, and tracker updates. Keep waves revertable; do not mix unrelated deletion, behavior, and generated-type work.

## Ratchets

After fix waves land, run:

```bash
pnpm qa:code-quality-ratchet
```

If counts improve, lower the baseline intentionally:

```bash
pnpm qa:code-quality-ratchet:update
```

The ratchet guards mechanical drift only: oversized source-file count, `as any` count, TODO/FIXME/HACK count, and direct Supabase calls in protected replication reroute files. Judgment-heavy dimensions stay in the periodic audit.
