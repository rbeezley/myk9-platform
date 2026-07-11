# 006 — Fix INTENT.md §6 (myK9Q described as live) and re-baseline the debt registers

> Written against commit `15897d862` (2026-07-11). Docs-only plan. CAUTION: INTENT.md is load-bearing — substantive intent changes require a PR (per CLAUDE.md, this correction is a factual sync, not an intent change, but still go through PR because INTENT.md governs UX decisions).

## Why this matters

**(a)** `docs/INTENT.md` §6 ("App Boundary: myK9Show vs myK9Q", starting line 183) still documents a 2026-03-14 decision that "myK9Q is the ringside scoring tool" with cross-app navigation rules. But `apps/myk9q` was **deleted** — ringside was absorbed into myK9Show's `/at-show` (CLAUDE.md records this; do not rebuild myK9Q). INTENT.md is the doc AI tools are told to read before UX changes; §6 as written can cause a builder to wire links to a deleted app or defer ringside work to it. This is intent-erosion inside the anti-erosion doc.

**(b)** `TECHNICAL_DEBT.md:9` claims "Total Debt Items: 30 (0 open)" (last updated 2026-02-06) and `docs/DEFERRED-WORK.md:5` claims "ALL SECTIONS COMPLETE" (2026-02-15) — both ~5 months stale while 173 source files exceed the project's own 500-line rule and fresh audits keep finding work. Anyone consulting these registers concludes there is no debt.

## Steps

1. **INTENT.md §6 rewrite** (read the full section first — lines ~183-244):
   - Keep the section (the *boundary decision* still matters historically) but retitle/reframe: myK9Q's ringside role now lives at `/at-show` inside myK9Show; the legacy myk9q.com production app (separate repo) remains untouched; the monorepo `apps/myk9q` is deleted.
   - Preserve every intent statement about ringside qualities (offline capability, tablet touch targets, "invisible" judge experience) — re-anchor them to `/at-show`. Do NOT weaken or drop any emotional-intent language; this is a re-addressing, not a rewrite of intent.
   - Update any cross-app navigation rules to in-app routes. Add a dated note: "(2026-07: myK9Q absorbed into `/at-show`; section re-anchored.)"
2. **TECHNICAL_DEBT.md:** add a dated section at top: current standing debt summary — 173 files >500 lines (ratchet baseline 176, `scripts/qa/code-quality-ratchet.baseline.json`), pointer to `docs/improve-audit-2026-07-11/README.md` for the current audit and backlog. Change the header claim from "0 open" to reference the ratchet + audit as the live sources of truth. Do not delete historical entries.
3. **docs/DEFERRED-WORK.md:** same treatment — dated note that the file reflects the Feb-2026 sweep only, live deferred work now tracked in OPEN-TODOS.md + the audit backlog.
4. Spot-fix the two shipped-looking "Active" index rows if verifiable in ≤30 min: check whether `plan-lane-2-2-entry-multiselect.md` and `plan-block-person-delete-owns-dogs.md` shipped (grep main for their named deliverables; e.g. person-delete owns-dogs guard trigger exists — migration `20260617130000_block_person_delete_with_dogs`). For each confirmed shipped: flip status to Complete, `git mv` to `docs/archive/` (mirror path), remove its index row. If not clearly verifiable, leave and note.

## Out of scope

- Full docs/README.md Active-row reconcile (~50 rows — separate pass, listed in the audit backlog). Any code change. Rewriting intent itself.

## Done criteria

- INTENT.md contains no statement implying `apps/myk9q` exists or that ringside lives outside myK9Show; grep `myk9q\|myK9Q` in INTENT.md shows only historical/legacy-production references.
- Both registers open with dated, accurate standing-state summaries.
- PR (not direct push — INTENT.md is out of docs-fast-path scope per CLAUDE.md). `pnpm lint` green (markdown untouched by lint is fine; run anyway).

## Maintenance note

When a structural decision lands (app deleted, feature absorbed), grep INTENT.md the same day — it is explicitly the doc future agents trust first.
