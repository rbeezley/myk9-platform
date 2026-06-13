---
description: Run the impeccable page-improvement playbook on a named page (evaluate → triage → fix → polish → test → ship)
argument-hint: <page-name> (only the page name is required, e.g. "Secretary Dashboard")
---

# Impeccable page run

Run the impeccable page-improvement playbook on the page named in `$ARGUMENTS`.

This command is only the **dispatcher**. The pipeline itself lives in
`docs/plan-impeccable-page-improvements.md` — read it first and follow it
exactly; do not improvise or duplicate the phases here.

## Steps

1. **Read the playbook:** `docs/plan-impeccable-page-improvements.md`. It is the
   source of truth for every phase, the skill-selection buckets, the watchlist,
   the Definition of Done, and the ship artifacts.

2. **Target page = `$ARGUMENTS`** — the only required input. Resolve its route,
   entry file, and role yourself in Phase 0 (grep the router; cross-check the
   playbook's "Suggested page queue" table). If the page name is ambiguous or
   matches zero/many routes, **STOP and ask** — do not guess or invent a page.
   Default quality bar = `flagship`. If `$ARGUMENTS` is empty, ask which page.

3. **Run Phase 0 (preflight) + Phase 1 (evaluate) only, then STOP.** Work in a
   fresh worktree. Run the concurrency check. Pin the `critique`/`audit`
   evaluators to **Opus or Fable** (Model robustness section), even if a smaller
   model runs the rest. Present the merged findings table + audit scores, then
   **wait for the dispatcher's scope decision** (mechanical vs. IA). Do NOT edit
   page files before that decision — this is the Phase 2 step-13 surface point.

4. **After the scope decision:** run only the triggered fix passes → `polish` →
   the full Phase 5 testing phase → ship one PR. Produce all three Phase 6
   artifacts: the findings table with dispositions, the structured report-back,
   and the annotated before/after visual.

5. **Non-negotiable guardrails (from the playbook):**
   - Anything touching `INTENT.md` role feelings or page IA beyond cosmetics →
     surface to the dispatcher; never decide it autonomously.
   - Answer the duplication question before proposing any new UI (default to a
     deep-link, not a new surface).
   - Run the project watchlist greps; do the cross-surface ripple check before
     shipping if any shared/global file changed.
   - One page = one worktree = one PR.
