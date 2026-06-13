# Impeccable Page-Improvement Playbook

A repeatable, hand-off-able plan for improving any myK9Show page with the
`impeccable` skill. Give an agent this document plus a **page name** and it
runs the full pipeline: evaluate → triage → fix → polish → test → ship.

The earlier Secretary Workbench experiment ran only an evaluate pass. This
playbook is the complete loop, including the fix passes and the required
testing phase.

---

## How to dispatch

Fill in this block and hand it to the agent along with this file:

```
Page:        <human name, e.g. "Entry Management">
Route:       <e.g. /shows/:showId/entries>
Entry file:  <e.g. apps/myk9show/src/pages/secretary/EntriesManagementPage.tsx>
Role:        <secretary | exhibitor | judge | steward | club admin>
Quality bar: <MVP | flagship>   (most secretary pages: flagship)
Login:       secretary@myk9t.com / TestPass4567!  (dev server: pnpm dev:show)
```

---

## Which skills, and why

The skill has 23 sub-commands. For this project (product register, pre-launch,
consolidation phase) they split four ways:

### Always run, in this order

| Order | Command | What it does here |
|---|---|---|
| 1 | `critique` | Two **isolated** sub-agent design reviews (LLM design-director pass + automated detection), Nielsen heuristic scores 0–4, cognitive-load checklist, AI-slop verdict. Read-only. |
| 2 | `audit` | Code-level technical scores 0–4: a11y, performance, responsive, theming (light AND dark), error/edge states. Read-only. |
| 3 | *(triage — see below)* | Map findings → fix commands. Not a skill command. |
| 4..n | conditional fixes (next table) | Only the passes the findings triggered. |
| last | `polish` | Final pass. Starts with mandatory design-system discovery (DESIGN.md), classifies every drift as missing-token / one-off / conceptual, then fixes spacing, alignment, interaction-state gaps. **Always run, even if no fix passes fired.** |

### Run only when triggered by a finding

| Command | Trigger from critique/audit |
|---|---|
| `clarify` | Confusing labels, jargon, passive voice, unhelpful errors, tone mismatch. (Earlier sweeps found stale copy like the "Today" reference — this is the pass that catches those.) |
| `layout` | Spacing/rhythm/alignment findings, flat hierarchy, nested cards, everything-in-a-container. |
| `typeset` | Flat type scale (<1.25 ratio), line lengths over 75ch, hierarchy problems. |
| `colorize` | Monochrome UI that buries status meaning, OR hardcoded palette bugs (see watchlist below). |
| `adapt` | Responsive failures at any breakpoint, touch targets under 44px. |
| `harden` | Missing empty/loading/error states, long-text overflow, offline behavior gaps. Ringside-adjacent pages: test against the offline-first replication layer, never around it. |
| `distill` | Cognitive-load checklist fails 2+ items, >4 options at a decision point. This is the consolidation phase's best friend — prefer deleting/merging surfaces over decorating them. |
| `optimize` | Audit flags re-render storms, layout thrash, expensive animations. |
| `onboard` | Only for pages with a real first-run/empty state (wizard, new-show flows). |

### Gated — require explicit human opt-in per page

| Command | Why gated |
|---|---|
| `animate` | Motion must serve the role's target feeling in docs/INTENT.md; show-day pages (ringside, Show Desk) should stay calm. |
| `delight` | Project emoji policy: none in UI except celebratory moments (podium). Delight passes drift toward decoration; opt in deliberately. |

### Never run in this playbook

| Command | Why not |
|---|---|
| `craft`, `shape` | Build new features. We are consolidating, not adding surface area. |
| `teach`, `document` | PRODUCT.md and DESIGN.md already exist (DESIGN.md regenerated in PR #659). Do not rewrite them mid-sweep. |
| `extract` | Design-system extraction is repo-wide work, its own task — not per-page. |
| `bolder`, `overdrive` | Wrong register. These amplify; product pages for working secretaries need clarity, not spectacle. |
| `quieter` | Only if a critique explicitly scores a page as overstimulating; none have. |
| `live` | Interactive browser iteration with the user present — not autonomous-agent work. |

---

## The pipeline

### Phase 0 — Preflight (gates, non-optional)

1. Work in a **fresh worktree + branch** (`EnterWorktree`), never the primary
   checkout. Run `bash scripts/bootstrap-worktree.sh` if deps are missing.
2. Invoke the skill via the **Skill tool / `$impeccable`** — the harness
   resolves it from any cwd, so this works inside a worktree. The skill runs
   its own context loader; you do not call the script by path. (Note: the
   skill's files live in the MAIN repo's untracked `.claude/skills/impeccable/`
   — they are NOT copied into worktrees, so a worktree-relative
   `node .claude/skills/...` path will fail. If you must run the loader
   directly, use the absolute main-repo path:
   `/Users/richardbeezley/AI Projects/myk9-platform/.claude/skills/impeccable/scripts/load-context.mjs`.)
   PRODUCT.md and DESIGN.md must both load; if either fails, stop and report —
   do not synthesize context.
3. Read **docs/INTENT.md**, the section for this page's role. Write down the
   target feeling in one sentence; every later change is checked against it.
4. Read the page's source. Inventory every `// INTENT:` comment — these are
   immovable without explicit approval.
5. Register is **product** for all app pages. (Public landing/heritage pages
   are **brand** — note it if dispatched one.)
6. State the preflight line before any file edit:
   `IMPECCABLE_PREFLIGHT: context=pass product=pass command_reference=pass shape=not_required image_gate=skipped:evaluate-only mutation=open`

### Phase 1 — Evaluate (read-only, no edits)

7. `$impeccable critique <page>` — spawn the two assessments as **separate
   sub-agents** (the isolation is what makes scores honest). Each in its own
   browser tab if browser automation is available.
8. `$impeccable audit <page>`.
9. Both passes must cover: **light mode AND dark mode**, and three widths
   (375 / 768 / 1280). Caveat: the Preview MCP serves the MAIN repo's code,
   not the worktree — for worktree verification start a vite server on a
   unique port (`pnpm dev:show -- --port 51xx`) or rely on unit tests.
10. Output of this phase: one merged findings table —
    `# | finding | severity | source (critique/audit) | proposed command`.

### Phase 2 — Triage

11. Map each finding to a fix command using the trigger table above. Findings
    that map to nothing get fixed inline during `polish` or explicitly
    dropped with a reason.
12. **The duplication question** (CLAUDE.md): if any fix proposes new UI,
    answer in writing: *"Does this duplicate an existing surface? Why is
    duplication justified instead of a link?"* Default answer is a deep-link,
    not new UI. Prefer `distill`-style deletions over additions.
13. Anything touching role feelings, `// INTENT:` behavior, or page IA beyond
    cosmetics: stop and surface to the user before proceeding.

### Phase 3 — Fix passes

14. Run only the triggered commands, one at a time, in this order:
    `clarify → distill → layout → typeset → colorize → adapt → optimize → harden`.
    (Copy and structure first; paint and edge cases last — later passes
    inherit a stable surface.)
15. Hard rules during all passes (from the skill's absolute bans + project):
    - No side-stripe borders, no gradient text, no glassmorphism-by-default,
      no hero-metric template, no identical card grids, no modal-as-first-thought.
    - No `#000`/`#fff`; tint neutrals toward brand hue; OKLCH for new colors.
    - No em dashes in UI copy. No emoji (except celebratory UI).
    - Use design tokens (`--chip-*`, `--status-*`, semantic `--accent`/`--muted`
      etc.) — never raw Tailwind palette colors for stateful UI.
    - Keep files under 500 lines; extract siblings as needed.
16. Commit after each green pass (worktrees have been swept mid-session
    before; checkpoints are cheap).

### Phase 4 — Polish (always)

17. `$impeccable polish <page>` with the dispatched quality bar. Design-system
    discovery first; classify and fix drift; walk the page as the role would
    (keyboard too); check all interaction states: hover, focus-visible,
    active, disabled, loading, empty, error.

### Phase 5 — Testing & verification (required — the phase is not complete without it)

18. Unit tests for every component/hook/util that changed. Use the custom
    render from `src/test/utils/testUtils.tsx`. For value-sensitive fixes
    (an enum to a column, a label string), write the assertion first, red →
    green.
19. If a shared package's `src` changed: `pnpm --filter @myk9/<pkg> build`
    before running app tests (app vitest reads `dist`, not `src`).
20. `pnpm typecheck` (never raw tsc) — must be green across the monorepo.
21. `pnpm lint` — watch for `react-hooks/set-state-in-effect`.
22. `cd apps/myk9show && pnpm test` — full suite. If a runner hangs >30s,
    stop and report; don't loop.
23. Visual verification, light AND dark, three breakpoints. Screenshot proof.

### Phase 6 — Ship

24. The standard 8-step workflow: `/simplify` → `/commit` → PR → `/review` →
    fix findings → merge → `/cleanup`. Add `/codex:review` when the page's
    behavior (not just styling) changed — Codex catches what Claude reviewers
    miss, proven on #418/#444.
25. PR body: before/after screenshots (both modes), the findings table with
    each item's disposition (fixed / dropped+reason / deferred-to-user).

---

## Project-specific watchlist

Bugs this codebase has actually shipped — every evaluate pass should grep for
them explicitly:

1. **Dark-only Tailwind palette classes**: `bg-*-950 / text-*-400` with no
   light-mode counterpart renders near-black chips in light mode
   (ShowStatusPill, fixed in PR #666). Pattern: every raw palette color needs
   both halves, or better, a `--chip-*`/`--status-*` token.
   Known remaining instance: `ShowDeskAdaptiveHeader.tsx` hardcodes
   emerald/amber/slate chip colors.
2. **`color-scheme` mismatches**: app theme is class-driven (`darkMode:
   'class'`); any `@media (prefers-color-scheme: dark)` in CSS files bypasses
   the toggle (two known: `myk9-registration-workflow.css`, `calendar.css`).
3. **Tailwind JIT in dev**: responsive classes used only by lazy-loaded
   modules may be missing from the dev CSS bundle and look broken on other
   pages. Verify suspected dev-only breakage against a production build
   before "fixing" it.
4. **Offline-first**: never replace a replicated read with a direct Supabase
   read while fixing a loading state.
5. **Touch targets**: 44px minimum is an `// INTENT:` rule in buttonVariants
   (exhibitor-facing). `size="sm"` at 40px is the sanctioned floor.

---

## Suggested page queue (secretary workflow order)

| # | Page | Route | Notes |
|---|---|---|---|
| 1 | Show Workbench — Setup | /shows/:id/setup | Critique/audit partially done; start from existing findings |
| 2 | Show Workbench — Show Desk | /shows/:id/show-desk | ShowDeskAdaptiveHeader token fix lives here |
| 3 | Entry Management | /shows/:id/entries | |
| 4 | Reports | /shows/:id/reports | |
| 5 | Results Control / Submit Results | /shows/:id/results-* | |
| 6 | Show creation wizard | /shows/new | Has a real first-run state → `onboard` eligible |
| 7 | Public show landing (default + heritage) | /shows/:id | **Brand register**, exhibitor-facing |
| 8 | At-Show (ringside surfaces) | /at-show/:showId | Offline-first constraints dominate; keep calm, no motion |

One page = one worktree = one PR. Do not batch pages; findings tables stay
reviewable and reverts stay cheap.
