---
description: Unattended sweep — run the impeccable playbook (mechanical-only) across the secretary page queue, sequentially, opening one PR per page
argument-hint: [page list, or empty for the full queue] [--merge to auto-merge after CI]
---

# Impeccable sweep (autonomous)

Run **Autonomous sweep mode** of the impeccable page-improvement playbook over
the secretary page queue, unattended. This is the overnight variant: no human
checkpoints, one PR per page, reviewed in the morning.

This command is the **dispatcher**. The rules live in
`docs/plan-impeccable-page-improvements.md` → "Autonomous sweep mode (unattended)".
Read that section first and follow it exactly.

## Inputs (`$ARGUMENTS`)

- **Page list** — optional. If given, sweep only those pages (must be queue
  pages with known routes). If empty, sweep the full "Suggested page queue".
- **`--merge`** — optional. Hands-off mode: auto-merge each page's PR after its
  CI passes (collision-free, unreviewed). Omit for the default review mode
  (stacked PRs, you merge bottom-up in the morning).

## Non-negotiables (from the sweep-mode section — do not deviate)

1. **Mechanical only.** Run the triggered fix buckets + `polish`. **Never**
   execute an IA or `// INTENT:` change — log each as a `spawn_task` chip and
   move on.
2. **Strictly sequential + stacked branches.** One page at a time; each page's
   branch stacks on the previous page's tip (not fresh `main`) so shared
   components/tokens accumulate without conflicting. Never fan out. (With
   `--merge`, auto-merge after CI instead of stacking.)
3. **Park, don't halt.** If a page can't be resolved, tests hang >30s, or
   CI/typecheck/lint fails → park that page (log why) and continue. One bad page
   never stops the sweep. Respect the 2-round iteration cap.
4. **Pin evaluators to Opus/Fable**; run the whole sweep on Opus or Fable.
5. **One morning report** at the end: per page → PR link / parked+reason /
   IA-only(N chips); audit scores before→after; chips created.

## Before you start

State the merge policy and the resolved page list, then begin. If `$ARGUMENTS`
names a page not in the queue, report it and skip — do not invent pages.
