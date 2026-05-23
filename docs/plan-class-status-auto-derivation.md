# Plan — Class Status Auto-Derivation (Stub)

**Date:** 2026-05-22
**Status:** **Stub.** Not yet drafted in detail. Pre-work required (PO interview on edge-case rules) before full plan can be written.
**Companion plan:** [`plan-show-map-workbench-collapse.md`](plan-show-map-workbench-collapse.md) (Option B). Phase B2b includes a future-proofing note for this work.

## The idea

Currently, class status (`neutral` / `active` / `complete`) is set manually via secretary actions (`mark-class-started`, `mark-class-complete`). The PO observed in design review that **scoring data already implies status transitions**:

- **First entry scored in a class** → class is objectively `active`
- **All expected entries scored or accounted for** → class is objectively `complete`

If the system derives status automatically from scoring events, the secretary doesn't need to remember to mark the lifecycle. The "Mark Class Started" / "Mark Class Complete" buttons become **rare** (manual override only, for edge cases) rather than always-required.

## Why it's the right direction

- Aligns with Option B's "more automatic, less tab-memory driven" thesis.
- Eliminates a class of "I forgot to mark complete" errors.
- The data already exists — scoring writes carry timestamps and class IDs.
- Reduces secretary cognitive load on a high-frequency operation.

## Why it's its own plan (not bundled into Option B)

1. **Cross-app scope.** myK9Q owns scoring writes; myK9Show consumes the resulting status. A Supabase trigger could handle it without app code. Three layers potentially touched.
2. **Edge-case rules need PO sign-off.** Several real cases (below) don't have obvious answers and shouldn't be guessed at by an implementer.
3. **Option B's critical path is long enough.** Bundling this into B2b would balloon a phase that already has the row-action wiring.

## Pre-work: PO interview (5–10 min, required before drafting)

Before this plan can be fleshed out, the PO needs to lock the following rules:

1. **What counts as "expected to score" for completeness?**
   - Just `not scratched && not pulled` entries?
   - Or include `at-gate` / `come-to-gate` as still-expected?
   - Or some other definition?

2. **Briefing semantics — does briefing-time-set trigger `active`?**
   - The current codebase tracks `briefing_time` separately. If a judge "starts" the class with a briefing before any score lands, should the class flip to `active` then? Or only on first score?
   - Implications: if briefing triggers `active`, auto-derivation needs to watch two write paths (briefing time set, first score). If only scoring triggers it, briefing becomes informational metadata.

3. **Re-judging / score deletion behavior.**
   - If a class is `complete` and one entry's score is deleted (re-judge in progress), does the class flip back to `active`?
   - If the re-judge produces a new score, does it flip back to `complete`?
   - Default proposal: flip-back-on-delete is correct; status reflects current state of scoring.

4. **Empty class (0 entries) handling.**
   - Auto-derivation says "never started" forever.
   - Secretary may want to formally close empty classes for reporting.
   - Manual "Mark Complete" remains available as an override.

5. **Weather cancellation / early closeout.**
   - Class with entries-remaining > 0 but secretary needs to close.
   - Manual "Mark Complete" remains available.

6. **Late entries mid-class.**
   - Class was `complete`; late entry added; class needs to flip back to `active`.
   - Auto-derivation must reactively handle this. Confirm.

## Implementation candidates (to evaluate during full plan)

| Approach | Pro | Con |
|---|---|---|
| **(A) Supabase trigger on `entries` writes** | Single source of truth at the data layer; every consumer sees consistent state | Trigger complexity; harder to debug; needs careful handling of expected-count semantics |
| **(B) myK9Q application logic** (in score persistence) | Lives close to the originating event; uses existing `replicatedClassesTable.updateClassStatus` | Couples scoring to status transitions; if myK9Q's offline buffer holds a score, status update is delayed too |
| **(C) myK9Show derivation layer** (virtual status from scoring data) | No write-path change; pure compute | Every read recomputes; existing `class.status` consumers stay on the old field; dual sources of truth |
| **(D) Hybrid: app-layer write + DB constraint** | Belt-and-suspenders | More moving parts |

**Recommendation (to be confirmed during full plan):** **(A)** Supabase trigger. Cleanest semantics; lives at the data layer where the unified Supabase project is the natural truth boundary.

## Soft impacts on Option B

These are already documented in Option B's Phase B2b implementation note:

- `mark-class-started` and `mark-class-complete` mutation actions become **rare** rather than always-visible.
- Don't over-invest in always-visible primary buttons for these two actions.
- Still wire them inline so they work when needed (manual override path).
- `score-class` and `open-class` (the navigate actions) are unaffected.

## When to draft the full plan

After:
1. PO interview locks the six edge-case rules above.
2. Option B's Phase B6 has shipped and stabilized for one show cycle (so the workbench is at a known-good state before adding the auto-derivation change).
3. Implementation candidate is chosen (A / B / C / D).

Until then, this stub captures the idea and prevents it from being lost.

## Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-05-22 | Stub created during Option B review session. PO observed that class status transitions are derivable from scoring events; full plan deferred until PO interview locks edge-case rules. | This session |
