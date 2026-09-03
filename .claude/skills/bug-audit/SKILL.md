---
name: bug-audit
description: "Use when asked to hunt for bugs, dead code, logic errors, broken buttons or links across the codebase, to re-run the whole-repo defect sweep, or to audit one area for correctness defects and file them as Linear issues. Distinct from codebase-health (maintainability debt) and security-audit (security posture)."
user-invocable: true
argument-hint: "[scope-name | --resume | --scopes]"
---

# Bug Audit

A whole-repo hunt for **correctness** defects — bugs, logic errors, broken navigation, dead code —
verified against source and filed as Linear issues. Not a maintainability review (that is
`codebase-health`) and not a security posture review (that is `security-audit`), though it reports
security smells it walks into.

**Core principle: one reviewer at a time, matched to the right model, writing findings to disk as
it goes.** The audit is expensive; the failure modes are all about budget and duplication, not
about finding too little.

## Budget discipline — read this before dispatching anything

The 2026-09-01 run established these the hard way.

**Never fan out.** Ten parallel reviewers consumed **73% of a 5-hour usage window in five minutes
and produced nothing** — every one was rate-limited before writing a single finding. Run scopes
**sequentially**, one agent at a time, `run_in_background: false`.

**Reviewers must not spawn sub-agents.** Several did on the first attempt and multiplied the burn.
The brief forbids it; keep that line.

**Reviewers write findings to disk incrementally**, one at a time as each is verified. A reviewer
killed mid-scope then leaves its verified work behind — see *Resuming an interrupted reviewer* below.

**Budget per scope:** roughly 200k–350k subagent tokens, 8–35 minutes. Ten scopes is most of a
window. Ask which scopes matter before running all ten.

## Model tiering — the point of the exercise

Match the model to the *kind* of thinking the scope needs. Fable/Opus on a grep-and-count scope is
waste; Sonnet on a money-math scope misses things.

| Model | Use for | Why |
| --- | --- | --- |
| **Sonnet** | routing and navigation, dead-export verification, allowlist/registry drift | Mechanical: resolve a target against a table, count importers. Little judgment, high volume. Measured: ~200k tokens, 7.5 min, 6 real findings on the routing sweep. |
| **Fable / Opus** | show-day + registration logic, money and fees, hooks/state, services, packages, edge functions + migrations | Multi-file reasoning, and the judgment call that actually matters here: *is this a defect or a deliberate decision?* Sonnet is likelier to report intent as a bug. |

Pass the model explicitly on the `Agent` call. If the window is tight, run the Sonnet scopes first —
they are cheap and their findings are the least likely to be wrong.

## Resuming an interrupted reviewer

Reviewers get rate-limited, and the window resets. Never restart the scope — its verified findings
are already on disk.

1. **Check what survived** before deciding anything:
   `grep -c '^### F' {{SCRATCH}}/findings-<scope>.md`
2. **Try `SendMessage` first** — if the id resolves, the agent keeps its context and does not re-read
   what it already read. A failed send tells you it is gone; that is the test, so do not deliberate:
   `SendMessage(to: "<agentId>", message: "The limit has reset. Continue from where you stopped.
   Your findings file already holds F1..F<n> — do not re-verify those, continue numbering from
   F<n+1>, and cover the directories your Coverage section does not yet list.")`
3. **If it is gone** (session restarted, id lost), spawn a fresh agent with the same brief plus:
   "Your findings file ALREADY EXISTS with findings from an interrupted run. Read it first, keep
   those findings, spot-check each against the code, continue the numbering, and cover only what its
   Coverage section does not list." If the file has no Coverage section — killed before writing one —
   tell it to re-cover the whole scope, skipping only files the existing findings already cite.
4. **Confirm it resumed rather than restarted** — the finding count should climb from where it was,
   not reset to F1.

A resumed reviewer that silently re-verifies everything costs as much as a restart. Check the
numbering.

## Scopes

Run whichever the user asks for; default to the launch-critical four. `--scopes` lists them.

| # | Scope | Model | Weight toward |
| --- | --- | --- | --- |
| 1 | routing, navigation, links, buttons (repo-wide) | Sonnet | unresolvable targets, param-shape mismatch, deep-link params nobody reads, registry-vs-route drift |
| 2 | `features/` show-day + registration | Fable | offline correctness, run-queue ordering, status strings vs DB CHECK, wizard validation |
| 3 | `hooks/`, `context/`, `providers/`, `store/` | Fable | queryKey omissions, `enabled:` gates rendered as zero, persisted auth-derived state |
| 4 | `services/`, `utils/`, `lib/` | Fable | ignored `{ error }` results, column names vs generated types, date/timezone, money |
| 5 | `pages/` | Fable | handlers that don't match their label, unmounted pages, stale invalidations |
| 6 | `components/` show-ops | Fable | entry status transitions, placement math, report projections dropping fields |
| 7 | `components/` rest | Fable | money paths, dead shared primitives, client-only gates |
| 8 | `features/` rest | Fable | fee arithmetic, PDF field mapping, registry-helper bypasses, unmounted feature dirs |
| 9 | `packages/*` | Fable | replication watermarks/conflicts, ringside authz, scoring math, dead exports |
| 10 | edge functions + 40 newest migrations | Fable | webhook idempotency, cron auth, anon GRANTs, `security_invoker`, definer filters |

## Procedure

1. **Pre-flight.** Read `references/preflight.md`. It covers the checks that make the difference
   between filing a real issue and duplicating someone's in-flight work.
2. **Write the brief.** Copy `references/reviewer-brief.md` into the scratchpad. Update its
   "known-deliberate" list first — a stale list wastes a whole scope re-reporting settled decisions.
3. **Seed the do-not-report list from prior runs, not just this one.** Every scope has likely been
   swept before, so pull the existing issues for it first
   (`list_issues(..., includeArchived: true)`, plus `get_issue` on any id you are unsure of) and put
   them in the brief's "do NOT report" section as `file:line — MYK9-nnn` lines. A reviewer that does
   not know a defect is already filed will find it again and describe it convincingly, and you will
   spend the verification budget re-deriving something already on the board.
4. **Run one scope.** `Agent` with the brief path, the scope's file list, its weights, the model
   from the table, `run_in_background: false`, and that do-not-report list.
5. **Verify before filing.** Never file from a reviewer's summary. Open the findings file, re-read
   the cited lines yourself, and confirm the failure scenario. Reviewers do produce plausible
   findings that do not survive a look at the code.
6. **Reconcile.** Search **each** of symptom, file path, and route separately — not by title, and
   not one axis and done; the same defect gets filed under wording you will not guess. Every search
   passes `includeArchived: true`; closed issues auto-archive on a 30-day window here, so a default
   query reads shipped work as never-seen. **An empty result means "new" only if all three axes came
   back empty with that flag set** — otherwise the status is `blocked`, not `new`, and you search
   again properly.
7. **File.** Follow `quality-finding-lifecycle` for severity and evidence. Group dead code into
   **one issue per scope** with a per-symbol grep-count table; thirty separate dead-code issues is
   noise. Match each finding against the known list before opening anything: **still open** → comment
   only if you have something new, otherwise say nothing; **closed but genuinely reproducing** →
   comment on the original as a recurrence and ask for a reopen, never a fresh id; **closed and not
   reproducible** → say nothing. A scope that returns only already-known findings is a good result —
   report it and file nothing.
8. **Record.** Update the audit ledger memory with one line per issue, and stamp what was and was
   not covered. A skipped scope is a coverage gap, not a pass.

## Red flags

- About to launch more than one reviewer → **stop.** That is the failure this skill exists to prevent.
- Reviewer summary is convincing and you have not opened the file → **stop.** Verify first.
- `list_issues` without `includeArchived: true` during reconciliation → the empty result is meaningless.
- About to file thirty dead-code issues → group them per scope.
- About to file without having pulled the scope's existing issues → you are about to duplicate.
- About to fix a finding without checking open PRs by file → you may be duplicating in-flight work.

## Common mistakes

| Mistake | What happens |
| --- | --- |
| Parallel reviewers | Window exhausted in minutes, zero findings written |
| Fable on the routing scope | Same six findings, several times the cost |
| Restarting a rate-limited reviewer | Discards verified findings already on disk; resume instead |
| Filing from the summary | Findings that do not survive reading the code |
| Stale known-deliberate list | A scope spent re-reporting settled decisions |
