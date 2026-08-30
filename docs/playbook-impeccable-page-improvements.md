# Impeccable Page-Improvement Playbook

A repeatable, hand-off-able playbook for improving any myK9Show page with the
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
Login:       role-dependent e2e-* account (see the queue group for this page's role) / password in apps/myk9show/.env.local  (dev server: pnpm dev:show)
```

**[ADDED] Minimum input is the page name; the agent derives the rest.** Only
`Page` is required from the dispatcher. If Route / Entry file / Role / Quality
bar are blank, the agent resolves them in Phase 0 before any other work:

- **Route + Entry file** — grep the router (`apps/myk9show/src/**/*outes*.tsx`,
  `App.tsx`) for the page name or an obvious slug; confirm the lazy-import path
  resolves to a real file. If the page name is ambiguous or matches 0/many
  routes, **stop and ask the dispatcher** — do not guess.
- **Role** — infer from the route prefix (`/at-show` → ringside roles,
  `/club-admin` → club admin, secretary workbench → secretary) and confirm
  against the page's RBAC guard. Cross-check the "Suggested page queue" table
  at the bottom of this doc, which lists canonical route + role for the known
  pages.
- **Quality bar** — default to `flagship` for any secretary/exhibitor-facing
  page; `MVP` only if the dispatcher said so.

If the page name doesn't appear in the router at all, it is not a valid target
— report that and stop, rather than inventing a page.

---

## Which skills, and why

The skill has 23 sub-commands. For this project (product register, pre-launch,
consolidation phase) they split four ways:

### Always run, in this order

| Order | Command                        | What it does here                                                                                                                                                                                                                          |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `critique`                     | Two **isolated** sub-agent design reviews (LLM design-director pass + automated detection), Nielsen heuristic scores 0–4, cognitive-load checklist, AI-slop verdict. Read-only.                                                            |
| 2     | `audit`                        | Code-level technical scores 0–4: a11y, performance, responsive, theming (light AND dark), error/edge states. Read-only.                                                                                                                    |
| 3     | _(triage — see below)_         | Map findings → fix commands. Not a skill command.                                                                                                                                                                                          |
| 4..n  | conditional fixes (next table) | Only the passes the findings triggered.                                                                                                                                                                                                    |
| last  | `polish`                       | Final pass. Starts with mandatory design-system discovery (DESIGN.md), classifies every drift as missing-token / one-off / conceptual, then fixes spacing, alignment, interaction-state gaps. **Always run, even if no fix passes fired.** |

### Run only when triggered by a finding

| Command    | Trigger from critique/audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clarify`  | Confusing labels, jargon, passive voice, unhelpful errors, tone mismatch. (Earlier sweeps found stale copy like the "Today" reference — this is the pass that catches those.) **Gate check:** when renaming a label that's driven by a boolean/predicate (a readiness chip, a status badge, an error condition), match the gate's _full satisfaction set_, not just the dominant case — read the predicate, not only the old string. Narrowing a label to the common case lets an off-case dismiss a chip whose text no longer describes what cleared it (PR #676: "Premium list not posted yet" named one of three OR'd conditions → widened to "Exhibitor info not published yet"). |
| `layout`   | Spacing/rhythm/alignment findings, flat hierarchy, nested cards, everything-in-a-container.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `typeset`  | Flat type scale (<1.25 ratio), line lengths over 75ch, hierarchy problems.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `colorize` | Monochrome UI that buries status meaning, OR hardcoded palette bugs (see watchlist below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `adapt`    | Responsive failures at any breakpoint, touch targets under 44px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `harden`   | Missing empty/loading/error states, long-text overflow, offline behavior gaps. Ringside-adjacent pages: test against the offline-first replication layer, never around it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `distill`  | Cognitive-load checklist fails 2+ items, >4 options at a decision point. This is the consolidation phase's best friend — prefer deleting/merging surfaces over decorating them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `optimize` | Audit flags re-render storms, layout thrash, expensive animations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `onboard`  | Only for pages with a real first-run/empty state (wizard, new-show flows).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Gated — require explicit human opt-in per page

| Command   | Why gated                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `animate` | Motion must serve the role's target feeling in docs/INTENT.md; show-day pages (ringside, Show Desk) should stay calm.                                                                                                                                  |
| `delight` | Project emoji policy: none in UI except celebratory moments (podium). Delight passes drift toward decoration; opt in deliberately.                                                                                                                     |
| `/design` | Not an `impeccable` command — the separate Claude Design canvas skill, used at **Phase 2.5** to turn a structural scope decision into a visual choice. Costs a round trip, needs the dispatcher present, and produces mockups that are never evidence. |

### Never run in this playbook

| Command               | Why not                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `craft`, `shape`      | Build new features. We are consolidating, not adding surface area.                                                                                                                                                                                                                                                                                                                                       |
| `teach`, `document`   | PRODUCT.md and DESIGN.md already exist (DESIGN.md regenerated in PR #659). Do not rewrite them mid-sweep. **[ADDED] One exception:** the skill's own setup _forces_ `teach` if PRODUCT.md is missing, empty, or placeholder (`[TODO]` markers, <200 chars). If the preflight context load reports that, the gate wins — run `teach` once, then resume. Do not bypass the skill's gate to honor this ban. |
| `extract`             | Design-system extraction is repo-wide work, its own task — not per-page.                                                                                                                                                                                                                                                                                                                                 |
| `bolder`, `overdrive` | Wrong register. These amplify; product pages for working secretaries need clarity, not spectacle.                                                                                                                                                                                                                                                                                                        |
| `quieter`             | Only if a critique explicitly scores a page as overstimulating; none have.                                                                                                                                                                                                                                                                                                                               |
| `live`                | Interactive browser iteration with the user present — not autonomous-agent work.                                                                                                                                                                                                                                                                                                                         |

---

## [ADDED] Model robustness — separate the grader from the worker

This playbook is run by a model, and two of its steps are pure judgment: the
`critique`/`audit` **scores** and the `fix`/`polish` **craft**. The scaffolding
(preflight, bucketing, watchlist greps, testing, ship) is deterministic and
runs the same on any model. The judgment steps are not — a more lenient scorer
enforces a lower bar, and the gate ("no dimension below 3/4") is only as strict
as the model that assigns the 3.

The failure mode is **self-evaluation coupling**: if the same model both does
the work and scores it, it cannot hold itself above its own ceiling, and it
stops believing it met the bar. Sub-agents do not fix this — by default they
inherit the runner's model, so an "independent" review shares the runner's
capability. Isolation catches blind spots, not ceiling gaps.

**Pin the evaluator.** Run the scoring steps on a fixed strong model regardless
of who runs the fixes:

- `critique` and `audit` (Phase 1), and the **confirm re-score** after fixes
  (the iteration cap), MUST run on **Opus or Fable** — pass `model: 'opus'`
  (or `'fable'`) to the Agent/Workflow sub-agent that performs them, even when
  a smaller model runs the fix passes. This holds the _bar_ constant while only
  the _craft_ varies with the runner.
- The fix/polish passes MAY run on the dispatched runner's model. A smaller
  runner produces less-refined output but is still held to the pinned grader's
  standard, so it does not stop early.
- If the only model available is the runner's own, say so in the Phase 6
  report — the bar is then capped at that model's perception, and the
  dispatcher should weigh the result accordingly.

**Do not rely on taste where a number exists.** Prefer measurable gates over
self-scored 0–4 wherever the check can be computed — they are model-invariant:

- **Contrast** — compute the ratio (WCAG AA = 4.5:1 body, 3:1 large/UI text and
  non-text). Do not eyeball it.
- **Touch targets** — measure rendered px against the 44px floor.
- **Type scale** — compute the ratio between steps (≥1.25); don't judge it.
- **Watchlist** — literal greps (already model-invariant).

A self-scored 0–4 is the fallback for the genuinely subjective (hierarchy,
emotional resonance, AI-slop verdict) — never a substitute for a check you
could have measured.

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

> **[ADDED] Check for overlapping in-flight work** (do this in Phase 0, before
> any edit). Run `git worktree list` and `gh pr list --state open`. If another
> active branch/worktree/PR touches a **shared or global** file this page
> depends on — `index.css` and its theme tokens, `buttonVariants`, any
> component this page imports that other pages also import — coordinate or
> wait. Two sessions editing the same global token set collide silently (the
> prototypical case: a theme-token fix session and a page run both editing
> light/dark `--accent`). List the shared files this page pulls in, and confirm
> none are mid-flight elsewhere before Phase 3.

### Phase 1 — Evaluate (read-only, no edits)

7. `$impeccable critique <page>` — spawn the two assessments as **separate
   sub-agents** (the isolation is what makes scores honest). Each in its own
   browser tab if browser automation is available. **[ADDED] Run these scoring
   sub-agents on the pinned evaluator model (Opus/Fable — see "Model
   robustness"), even if a smaller model runs the rest of this playbook.**
8. `$impeccable audit <page>` — same pinned-evaluator rule as step 7.
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
    answer in writing: _"Does this duplicate an existing surface? Why is
    duplication justified instead of a link?"_ Default answer is a deep-link,
    not new UI. Prefer `distill`-style deletions over additions.
13. Anything touching role feelings, `// INTENT:` behavior, or page IA beyond
    cosmetics: stop and surface to the user before proceeding. If the
    dispatcher opted in, Phase 2.5 is how that surfacing is done.

### [ADDED] Phase 2.5 — Design canvas (gated; attended runs only)

Step 13 currently hands the dispatcher a markdown findings table and asks them
to approve a restructure sight-unseen; the first time they see it is the Vercel
preview. This phase makes that one decision visual. It is optional, it is the
only place `/design` belongs in this pipeline, and it changes no code.

**Gate — run it only when ALL of these hold:**

- Triage produced at least one IA / hierarchy / structural finding that step 13
  requires surfacing. A table of pure `colorize` / `adapt` / `clarify` findings
  does not qualify — go straight to Phase 3.
- The run is **attended**. A canvas nobody looks at until morning is wasted
  tokens; see the sweep-mode defaults.
- The dispatcher opted in for this page, exactly as with `animate` / `delight`.

Steps (lettered so the numbered pipeline keeps its existing cross-references):

13a. **Read the ledger first, then seed from reality.** Open
[`docs/reference/impeccable-structural-decisions.md`](reference/impeccable-structural-decisions.md)
and read its **Patterns in force** table — those are the structural decisions
earlier runs already made, and every artboard below must conform to them or
explicitly argue against them (see 13d). `DESIGN.md` governs color, type, and
component styling; the ledger governs page structure, which `DESIGN.md` does
not cover. Then artboard 1 is **Current**: the
Phase 1 screenshots at the width where the finding actually bites (usually
1280; 375 if it is a mobile finding). If Phase 1 could not screenshot the
branch — the worktree / Preview MCP caveat in step 9 — rebuild artboard 1 from
the entry file's real markup and `DESIGN.md` tokens, and label it a
reconstruction.

13b. **`/design` 2–3 alternatives** for the SAME content at the SAME width,
drawn with `DESIGN.md` tokens (`--chip-*`, `--status-*`, `--accent`, `--muted`,
the real type scale) so the winner is buildable rather than aspirational.
Constraints, inherited from CLAUDE.md's consolidation phase and the step 15
bans:

- Every element on an alternative must already exist on this page or on a page
  it deep-links to. A blank canvas invites new surfaces, which is precisely
  backwards for the phase we are in. Anything genuinely new still owes the
  step 12 duplication answer **in writing, before** it reaches an artboard.
- One alternative is always the **subtractive** option: the contested block
  deleted and deep-linked elsewhere. It is often the right answer and it never
  gets drawn unless you require it.
- The Phase 3 hard bans apply to mockups too — no side-stripe borders, gradient
  text, glassmorphism, hero-metric template, identical card grids, `#000`/`#fff`,
  em dashes, or emoji. An artboard that violates them gets implemented and then
  caught in `polish`, which wastes the whole round trip.

13c. **The dispatcher picks one artboard, and that pick IS the step 13 scope
decision.** Record it as the disposition of each structural finding in the
merged table, then run Phase 3 implementing the chosen artboard. If the
dispatcher picks none, the structural findings are dropped with that as their
one-line reason and the run continues mechanical-only.

13d. **Record the decision before Phase 3 starts.** Append one row to the
ledger's decision log — date, page, PR, the triggering finding, the pattern
chosen stated as a reusable rule, the rejected alternatives (including why the
subtractive one lost), and the canvas Artifact URL. If the decision establishes
a rule the next page should follow, also add a one-sentence entry to **Patterns
in force**. This is the only write path the pipeline has back into shared
design knowledge; skipping it is how the divergence this phase exists to
prevent gets reintroduced. **If the chosen artboard contradicts a pattern
already in force, stop and surface it** — either this page is a recorded
exception or the pattern needs revising everywhere it shipped, and that is a
repo-wide task, not a page task. Never resolve that conflict autonomously.

**What this phase is not.** The canvas is a decision aid, never evidence. It
does not satisfy the Phase 5 visual verification (step 23) or the Phase 6
before/after (step 28) — both still require the real rendered branch. If the
shipped page looks worse than the artboard, the implementation is wrong; the
artboard does not get to stand in for it. And skip this phase whenever the fix
is already obvious from the findings table — a round trip you did not need is
the main way this phase goes wrong.

### [ADDED] Definition of done — the exit condition

"All these improvements" is unbounded; this is the bound. A page is **done**
when ALL of these hold — not when the agent runs out of ideas:

- Every **blocking** and **high-severity** finding from the merged table is
  fixed, or explicitly dropped with a one-line reason in the table.
- No `audit` dimension (a11y, performance, responsive, theming, edge states)
  scores below **3/4**. A dimension under 3 must be raised to at least 3 or the
  shortfall justified in the PR body. Aim for 3; don't gold-plate to 4.
- No item on the project watchlist matches anywhere in the page's tree.
- `polish` has run and all interaction states are accounted for.
- The full testing phase (Phase 5) is green.

**Iteration cap.** Re-run `critique`/`audit` at most **twice** after fixes (one
fix round, one confirm round; the confirm re-score runs on the pinned evaluator
model). If the confirm round still surfaces _new_ blocking findings, stop and
report to the dispatcher rather than looping a third time — a page that won't
converge in two rounds is a sign of a deeper structural issue that needs a
human decision, not more passes. Low-severity findings that survive the cap are
listed in the PR body as "known, deferred," not chased indefinitely.

**[ADDED] Score calibration anchors.** So "3/4" means the same thing on any
model, anchor each score to a concrete state rather than an internal sense of
"good." Using the **theming** dimension as the worked example:

- **0–1** — broken: theme toggle does nothing, or large areas unreadable.
- **2** — a visible defect a user would notice: a chip near-black in light mode
  (the #666 bug), an unreadable hover state, body contrast under 4.5:1.
- **3** — no defects; tokens used correctly; both modes correct; contrast
  passes AA. Correct and accessible, not necessarily elegant. **This is the bar.**
- **4** — everything in 3, plus deliberate craft: color carries meaning,
  hierarchy reinforced by it, nothing arbitrary. Craft, not required.

Score against these states. The same logic transfers to the other dimensions:
2 = a defect a user hits, 3 = correct + accessible, 4 = correct + crafted.

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
    before; checkpoints are cheap). **[ADDED]** If a pass goes wrong — typecheck
    red, a worse design, a regression — `git restore`/`git checkout` that pass's
    uncommitted edits back to the last green commit before retrying or moving
    on. Never carry a half-applied pass into the next one; commit-after-green
    only protects you if a failed pass is reset, not left dirty.

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
24. **[ADDED] Cross-surface ripple check.** If any edit touched a **global or
    shared** file (`index.css` / theme tokens, `buttonVariants`, a component
    imported by other pages), the blast radius is larger than this page. Grep
    for the other importers (`grep -rl <component>` / the token name) and
    smoke-check at least the highest-traffic consumer in both modes. A token or
    shared-component fix that makes this page right can make three others wrong;
    the watchlist exists because exactly this has shipped before. If nothing
    global was touched, state that and skip.

### Phase 6 — Ship

25. The standard 8-step workflow: `/simplify` → `/commit` → PR → `/review` →
    fix findings → merge → `/cleanup`. Add `/codex:review` when the page's
    behavior (not just styling) changed — Codex catches what Claude reviewers
    miss, proven on #418/#444.
26. PR body: the annotated before/after visual (step 28), the findings table
    with each item's disposition (fixed / dropped+reason / deferred-to-user),
    and a link to the Vercel preview for the real rendered branch.
27. **[ADDED] Report back to the dispatcher** (the final chat message, not just
    the PR). Include: the page, the PR link, audit scores **before → after**
    per dimension, count of findings fixed vs. deferred, any item that needs a
    human decision (IA changes, INTENT-touching changes, a page that didn't
    converge in the iteration cap), and the cross-surface ripple result. This
    is what lets the dispatcher decide the next page without reading the diff.
28. **[ADDED] Annotated before/after visual.** Produce a side-by-side
    before/after of the changed UI for the dispatcher and the PR. Two methods —
    pick by the nature of the change:
    - **Faithful reconstruction (default for subtle visual fixes).** Rebuild
      the changed components' before and after states with the `show_widget`
      visualization tool, using the ACTUAL values from the diff — real hex
      colors, real px sizes, measured contrast ratios — annotated with what
      changed and the metric (e.g. "1.9:1 → 5.0:1", "24px → 44px"). Render the
      mode where the defect lives (usually light) and say so. Use this when the
      delta is a shade/contrast shift (near-invisible at thumbnail size), or it
      only appears under specific data/states (e.g. a schedule level must be
      in-progress/completed for its status color to show), or the run is in a
      worktree where the Preview MCP serves main, not the branch.
    - **Real browser screenshots.** Drive a dev server on the branch with
      browser automation, both modes, when the change is a self-evident layout
      or structure shift that reproduces without special seed data. The Vercel
      PR preview already renders the real branch — link it rather than restaging
      data when that suffices.
      Faithfulness rule: every value in a reconstruction must come from the diff
      or a computed measurement — never approximate, beautify, or invent, and
      label it a reconstruction. Cover only the fixed findings, one comparison
      block each with its metric. The reconstruction supplements the Vercel
      preview; it does not replace it.

---

## Project-specific watchlist

Bugs this codebase has actually shipped — every evaluate pass should grep for
them explicitly:

1. **Dark-only Tailwind palette classes**: `bg-*-950 / text-*-400` with no
   light-mode counterpart renders near-black chips in light mode
   (ShowStatusPill, fixed in PR #666). Pattern: every raw palette color needs
   both halves, or better, a `--chip-*`/`--status-*` token.
   ~~Known remaining instance: `ShowDeskAdaptiveHeader.tsx` hardcodes
   emerald/amber/slate chip colors.~~ **Cleared (p2 sweep).** That claim was
   stale twice over — the chips had been tokenised (`bg-success/10`,
   `bg-warning/10`, `chipClasses('stone')`) and the component was dead code,
   rendered by nothing. Both it and `ShowDeskCloseoutSection` are deleted.
   **Re-verify a watchlist entry before acting on it**; this one had outlived
   its bug by two refactors.
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

## Suggested page queue

Pages are grouped by **role surface**. The sweep runs **top to bottom across all
groups**, strictly sequential, each branch stacked on the previous page's tip —
the collision rule below applies across groups too. Cross-role pages share fewer
components, so stacking across groups is merely conservative, never harmful.

**Each group names the e2e login the sweep must use for its pages** — these
routes are RBAC-gated, so loading an `/admin` page as a secretary parks it on
the guard. All accounts share the password in `apps/myk9show/.env.local`.
Phase 0 still resolves each page's real route/role against the router; the
routes here are the known-canonical ones.

These are `@myk9t.com` addresses. The `e2e-*@test.myk9.com` set this table
named until 2026-08-30 was retired on 2026-08-23 (`test.myk9.com` has no MX
record, so mail to it hard-bounced off a third party's server) and has **zero**
`auth.users` rows — verified again on 2026-08-30: 22 users on `@myk9t.com`,
none on `test.myk9.com`. Signing in with a retired address fails as
`Invalid login credentials`, the same message a wrong password gives, so it
reads as rotation drift rather than a dead account. Prefer the helpers in
`src/test/e2e/helpers/testUsers.ts` (`signInAsSecretary` and siblings), which
read both address and password from env themselves.

### Secretary workflow — login `secretary@myk9t.com`

| #   | Page                                     | Route                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~Show Workbench — Setup~~               | ~~/shows/:id/setup~~                                | **RETIRED — not a valid target.** `ShowWorkbenchSetupPage.tsx` is now a 12-line `<Navigate>` to `/shows/:id`; the workbench-collapse plan moved its content to the Overview. Do not dispatch it. Its `SetupAdaptiveHeader` was stranded by the retirement and deleted in the p2 sweep.                                                                                                                           |
| 2   | Show Workbench — Show Desk               | /shows/:showId/show-desk                            | **Swept** (PR pending). The old note ("ShowDeskAdaptiveHeader token fix lives here") was doubly stale: those chips had already been tokenised, AND the component was not rendered at all — `ShowDeskPanel` renders `SecretaryCockpit`. Deleted in that sweep.                                                                                                                                                    |
| 3   | Entry Management                         | /shows/:showId/entry-management                     | **Swept** ([#1835](https://github.com/rbeezley/myk9-platform/pull/1835)). The queue previously listed `/shows/:id/entries` and `EntriesManagementPage.tsx`; neither exists.                                                                                                                                                                                                                                      |
| 4   | Reports                                  | /shows/:id/reports                                  |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | Results Control / Submit Results         | /shows/:id/results-*                                |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | Show creation wizard                     | /secretary/create-show/wizard                       | Has a real first-run state → `onboard` eligible                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | Public show landing (default + heritage) | /shows/:id                                          | **Brand register**, exhibitor-facing                                                                                                                                                                                                                                                                                                                                                                             |
| 8   | At-Show — class picker                   | /at-show/:showId                                    | **Swept** (PR #1827). Offline-first constraints dominate; keep calm, no motion                                                                                                                                                                                                                                                                                                                                   |
| 8b  | At-Show — entry list + scoresheet        | /at-show/:showId/class/:classId, .../score/:entryId | **Not yet swept.** The p8 run covered only the picker. Watchlist #1 already has **19 raw palette hits** here (`packages/ringside` `SortableEntryCard.tsx`, `SortableEntryCardComponents.tsx`, `ClassCardSkeleton.tsx`) — start from those. `useEntryListData.ts` already sets `networkMode:'always'` correctly; confirm the combined A/B and scoresheet routes inherit it rather than deriving their own queries |

### Site admin — login `testadmin@myk9t.com` (role: `SITE_ADMIN`)

| #   | Page                  | Route                | Entry file                                               | Notes                                   |
| --- | --------------------- | -------------------- | -------------------------------------------------------- | --------------------------------------- |
| 9   | Admin Dashboard       | /admin/dashboard     | src/pages/admin/AdminDashboard.tsx                       | Landing; `/admin` redirects here        |
| 10  | User Management       | /admin/users         | src/pages/admin/UserManagementPage.tsx                   | High table/density surface              |
| 11  | Payout Ledger         | /admin/payouts       | src/pages/admin/PayoutLedgerPage.tsx                     | Money UI — `clarify`/`harden` sensitive |
| 12  | Permission Management | /admin/permissions   | src/pages/admin/permissions/PermissionManagementPage.tsx | RBAC config surface                     |
| 13  | Role Requests         | /admin/role-requests | src/pages/admin/RoleRequestsPage.tsx                     | Review-queue workflow                   |

### Exhibitor — login `exhibitor@myk9t.com` (seeded dogs: Willow, Ranger, Juniper)

| #   | Page                     | Route                   | Entry file                                    | Notes                                            |
| --- | ------------------------ | ----------------------- | --------------------------------------------- | ------------------------------------------------ |
| 14  | My Entries / My Shows    | /exhibitor/entries      | src/pages/MyEntriesPage.tsx                   | Exhibitor home; **flagship** bar                 |
| 15  | Show Registration wizard | /shows/:showId/register | src/pages/RegistrationWizardPage.tsx          | Multi-step, first-run state → `onboard` eligible |
| 16  | Exhibitor Payments       | /exhibitor/payments     | src/pages/exhibitor/ExhibitorPaymentsPage.tsx | Money UI — `clarify`/`harden` sensitive          |
| 17  | Cart                     | /cart                   | src/pages/CartPage.tsx                        | Checkout flow; conversion-critical               |

### Club admin — login `clubadmin@myk9t.com` (role: `CLUB_ADMIN`)

| #   | Page          | Route                | Entry file                                | Notes                                   |
| --- | ------------- | -------------------- | ----------------------------------------- | --------------------------------------- |
| 18  | Club Members  | /club-admin/members  | src/pages/club-admin/ClubMembersPage.tsx  | Roster management                       |
| 19  | Club Payments | /club-admin/payments | src/pages/club-admin/ClubPaymentsPage.tsx | Money UI — `clarify`/`harden` sensitive |

One page = one worktree = one PR. Do not batch pages; findings tables stay
reviewable and reverts stay cheap.

---

## [ADDED] Autonomous sweep mode (unattended, e.g. overnight)

The interactive run pauses twice for the dispatcher — the **scope decision**
(Phase 2 step 13) and **IA/INTENT surfacing**. Sweep mode runs the whole queue
unattended by collapsing those two pauses into pre-authorized safe defaults.
The dispatcher reviews the output in the morning; the run never waits.

This mode is **opt-in** — only run it when the dispatcher explicitly asks for an
unattended sweep. It does not change the per-page pipeline; it changes the
checkpoints and the cross-page sequencing.

### Pre-authorized defaults (these replace the human checkpoints)

1. **Scope = mechanical only.** Run exactly the buckets the Setup run did:
   `clarify / layout / typeset / colorize / adapt / harden / distill / optimize`
   where triggered, plus `polish`. **Never** execute an IA or `// INTENT:`
   change — log each as a `spawn_task` chip and move on. "Surface to the
   dispatcher" becomes "log a chip and skip."
2. **Page resolution is strict.** Run only pages from the "Suggested page queue"
   (known routes). If a page can't be resolved or is ambiguous, **park it**
   (skip + log) — never guess, never block the sweep waiting for an answer.
3. **Do not merge by default.** Open each page's PR and leave it for morning
   review (the Vercel preview is the dispatcher's visual gate). See merge policy.
4. **Phase 2.5 is skipped entirely, and the ledger is read-only.** The design
   canvas exists to put a structural choice in front of a human; unattended
   there is no human to look, and its output is a mockup no later phase
   consumes. Structural findings are logged as chips per default 1, not drawn.
   A sweep may **read** `docs/reference/impeccable-structural-decisions.md` for
   context, but must never append a row — an unattended agent recording a
   structural decision nobody approved is worse than no record at all.

### Sequencing — the collision rule (non-negotiable)

The queue pages **share** components and tokens (`StatusDot`, `index.css` theme
tokens, `buttonVariants`, the adaptive-header family). Running them in parallel
off `main` produces mutually-conflicting PRs — not hypothetical: it happened on
the first run (#676 vs. #678 collided on one shared file). So:

- **Run pages strictly sequentially**, one at a time. Never fan out.
- **Stack each page's branch on the previous page's branch**, not on fresh
  `main`. Page 2 branches from page 1's tip, page 3 from page 2's, so shared-file
  edits accumulate cleanly instead of conflicting. The result is a chain of
  per-page PRs the dispatcher merges bottom-up.
- Rebuild any shared package (`pnpm --filter @myk9/<pkg> build`) once per page
  before that page's tests, per Phase 5.

### Merge policy (the one real choice — state it before starting)

- **Review mode (default).** Open the stacked PRs; do not merge. The dispatcher
  merges bottom-up in the morning. Caveat: rejecting a mid-stack PR means the
  ones above it need a rebase — note this in the final report.
- **Hands-off mode (`--merge`).** Auto-merge each page's PR after its CI passes,
  before starting the next page (which then branches off fresh `main`, not a
  stack). Collision-free, no morning rebase puzzle, but the mechanical fixes
  merge unreviewed. Only valid because this mode is mechanical-only + fully
  tested; never combine `--merge` with any IA work.

### Robustness — park, don't halt

A sweep must survive a bad page without losing the rest of the night:

- If a page's tests hang >30s, CI fails, typecheck/lint breaks, or the page
  won't resolve → **park that page** (abandon its branch, log why) and continue
  to the next. One bad page never halts the sweep.
- Respect the per-page iteration cap (two evaluate rounds). A page that won't
  converge is parked with its partial findings, not retried indefinitely.
- Cap total work at the queue length.

### Morning report (the single artifact the dispatcher wakes up to)

One summary covering every queue page: PR link (or "parked + reason" or
"IA-only — N chips, no PR"), audit scores before→after, findings fixed vs.
deferred, and the IA task-chips created. This is the hand-back.

### Environment caveats

- **Model:** run on Opus or Fable. The evaluator-pin keeps the _bar_ honest on
  any model, but unattended fix _craft_ still tracks the runner — and there's no
  human to catch a weak pass mid-run.
- **Host:** a local overnight `/loop` is a safer host than a headless cloud
  agent — the impeccable skill, the browser, and the `show_widget` visual tool
  may be absent in headless/cron runs (interactively-authenticated MCP servers
  don't always load there). Confirm those tools are reachable before relying on
  the annotated-visual and live-evaluate steps.
- The sweep is a **multi-agent orchestration** — launching it requires the
  dispatcher's explicit opt-in, the same as any Workflow.
