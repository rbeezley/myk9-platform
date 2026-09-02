# Reviewer brief — copy to the scratchpad, fill the placeholders, pass the path to the agent

`{{WORKTREE}}` = absolute worktree path. `{{SCRATCH}}` = scratchpad dir. `{{BASELINE}}` = commit SHA.
`{{FILED}}` = issue ids already filed this run.

---

You are auditing the myK9Show TypeScript monorepo at `{{WORKTREE}}` (a git worktree — run everything
from there, never `cd` to the primary checkout). Dependencies are installed. The app is
`apps/myk9show` (React 19, Vite, React Router, TanStack Query, Zustand, Supabase, Base UI via
shadcn). Shared packages live in `packages/*`. Baseline: `{{BASELINE}}`.

`grep` here is ugrep and the shell is zsh: quote `--include` globs and use `${=VAR}` to word-split.

## Mission

Find REAL, VERIFIED defects **in your assigned scope only**:

1. **Bugs / logic errors** — inverted conditions, off-by-one, field names that do not match the
   schema, null/undefined that throws at runtime, races, stale closures, effects missing deps that
   matter, query keys that serve stale data, mutations that never invalidate, swallowed errors that
   leave a success-looking UI, wrong date/timezone math, wrong money math, status strings absent
   from the DB CHECK constraint or the TS union.
2. **Broken navigation** — `<Link to>`, `navigate()`, `href`, `<Navigate to>` targets that resolve
   to no route; param-shape mismatches; buttons with no handler or a no-op handler; `disabled`
   expressions that can never become false; dialogs whose confirm never submits; query-param deep
   links the target page never reads.
3. **Dead code** — exports with zero importers anywhere (grep the whole repo, packages and tests
   included), unreachable branches, components never mounted, flags that are always one value,
   placeholder UI that ships.
4. **Data-integrity / security smells** you walk into — client-only authorization, direct Supabase
   reads bypassing `@myk9/replication` on offline-critical show-day paths, RLS assumptions.

## Verification standard — non-negotiable

- Every finding is backed by code you **read**. Quote exact `file:line` and state the failing
  input/state → wrong observable outcome. **No concrete failure scenario, no finding.**
- Broken-nav findings: grep the route tables (`src/router.tsx`, `src/routes/*.tsx`,
  `src/routes/routeRegistry.ts`) and prove the path is absent or the params mismatch.
- Dead-code findings: `grep -rn "Symbol" apps packages --include='*.ts' --include='*.tsx'` and paste
  the count. Own-file-only = dead. Test-only = report separately, lower priority.
- Before calling something a bug, check for a nearby `// INTENT:` comment, grep `supabase/tests/`
  for a test naming the function, and run `git log -S "<snippet>" --oneline -5`. **A deliberate
  decision is not a defect** — this is the judgment the expensive model is here for.
- Do NOT report style, naming, formatting, missing tests, or "could be simpler".
- **Read-only.** You may run `grep`, `git log`, `git blame`, and from `apps/myk9show`:
  `npx tsc --noEmit -p tsconfig.app.json` (never `-p tsconfig.json` — it is solution-style, compiles
  nothing, and exits 0) or `pnpm vitest run <one file>`. Do not edit, do not run the whole suite,
  do not install.

## Operating rules

- **Do NOT spawn sub-agents** (no Agent tool, no Workflow). Do the work yourself, sequentially.
- **Write each finding to your findings file the moment you verify it.** Do not hold them for a
  final write — if you are interrupted, verified work must survive.
- Prefer `grep` / `sed -n` / `head` over reading whole large files; read fully only where the logic
  needs it.

## Known-deliberate — do NOT report

Refresh this list each run; a stale entry costs a whole scope.

- `SlideOverPanel`'s inert `size` prop (MYK9-99).
- `manageable_show_ids()` omitting `deleted_at` (MYK9-126, pinned by a parity test).
- The always-empty `discounts` array in cart/registration pricing (decided not a feature).
- The public Show Map tab being read-only for managers (row actions live on Show Desk).
- The `/admin/permissions/roles` and `/admin/permissions/users` redirect entries in routeRegistry.
- `apps/myk9show/supabase/.temp/*` being tracked in git.
- Anything carrying a `MYK9-<n>` reference in a nearby comment — note the id instead.
- **Already filed — these are known defects, not findings.** Do not re-report them; if you land on
  one, note the id in your Coverage section and move on. `{{FILED}}`
  (Format: `file:line — MYK9-nnn — one-line summary`. Includes prior runs for this scope, not just
  this one — most scopes have been swept before.)

## Output

Write to the findings file named in your task, one section per finding, in exactly this shape:

```
### F<n>: <short title>
- **Class:** bug | broken-nav | dead-code | logic | data-integrity | security
- **Severity:** P0 | P1 | P2 | P3
- **Confidence:** high | medium | low
- **Files:** path:line, path:line
- **Role/workflow:** who hits it, and where (route)
- **Evidence:** quoted code
- **Failure scenario:** concrete input/state → wrong observable outcome
- **Expected:** what should happen
- **Suggested fix:** one or two sentences
```

Severity: **P0** data loss, security exposure, payment failure, score/result corruption, show-day
outage. **P1** a launch golden path needs developer help or a brittle workaround. **P2** real
friction, wrong but recoverable. **P3** polish, dead code.

End with `## Coverage`: directories read closely, skimmed, skipped, and anything you checked and
found clean (so the next reviewer does not repeat it). Then reply with ~10 lines: counts by
severity and the three most important findings with `file:line`.

**Ten verified findings beat forty guesses.** Open the files in your scope; do not audit by grep
alone.
