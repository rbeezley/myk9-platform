# Plan — Class Status Auto-Derivation (Stub)

**Date:** 2026-05-22
**Status:** **Stub.** Not yet drafted in detail. Pre-work required (PO interview on edge-case rules) before full plan can be written.
**Status note (2026-07-02):** the *presentation* side landed via the UX walk remediation plan's task 2.B — `@myk9/core` now exports the canonical lifecycle label triple (`CLASS_DISPLAY_STATUS_LABELS`: "Not started" / "In Progress" / "Completed", via `getClassDisplayStatusLabel` over the existing `getClassDisplayStatus`), the trial composite line (`deriveTrialCompositeStatus`), and the draft-show chip gate (`shouldShowClassLifecycleChips`). Auto-*derivation* of the stored status from scoring events (this plan's actual subject) remains open; when drafted, it should treat `getClassDisplayStatus` as the derivation to formalize server-side.
**Companion plan:** [`plan-show-map-workbench-collapse.md`](archive/plan-show-map-workbench-collapse.md) (Option B). Phase B2b includes a future-proofing note for this work.

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

1. **Cross-layer scope.** myK9Show's `/at-show` ringside owns scoring writes (offline-first via the replication layer); the rest of myK9Show consumes the resulting status. A Supabase trigger could handle it without app code. Multiple layers potentially touched.
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
| **(B) myK9Q application logic** (in score persistence) | Lives close to the originating event; uses existing `replicatedClassesTable.updateClassStatus` | Couples scoring to status transitions; if myK9Q's offline buffer holds a score, status update is delayed too — **and `apps/myk9q` was deleted, so this candidate is void; see the 2026-07 note below** |
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

## Proposed answers for the PO interview (drafted 2026-07-11 — owner: check a box per question)

Drafted so the interview becomes a 5-minute confirm/override pass instead of a design session. Each recommendation includes the tradeoff that drove it. One cross-cutting design point first, because questions 5 and 6 both hinge on it:

> **The override marker.** If status is *derived* (recomputed from scoring data), a manual "Mark Complete" would be silently flipped back by the next recompute. So manual actions must set an explicit override marker (e.g. `classes.status_override` or a `status_source: 'manual' | 'derived'` column) that derivation respects. "Manual override remains available" is only true if this exists — it is the one schema addition the full plan must include.

1. **What counts as "expected to score"?** — **Recommend:** expected = every entry not scratched/withdrawn. An entry is *accounted for* when it has a terminal outcome: `is_scored`, or `result_status` in the absent/excused/DQ family. Check-in states (`at-gate`, `come-to-gate`) are transient and never exclude an entry — an absent dog is a scoring outcome to record, not a dog to stop waiting for. Complete = all expected entries accounted for.
   - [ ] Accept  [ ] Override: ________
2. **Does briefing trigger `active`?** — **Recommend: no.** First scoring event (first `is_scored`/`scoring_started_at` write) triggers `active`. Briefing time stays informational metadata. Tradeoff: a class in briefing shows "Not started" for a few extra minutes; in exchange, derivation watches ONE write path and never flaps when briefing times are pre-entered during setup. Manual "Mark Started" (with override marker) covers a judge who wants the board to show active during a long briefing.
   - [ ] Accept  [ ] Override: ________
3. **Re-judge / score deletion flip-back?** — **Recommend: yes** (the stub's own default). Status is a pure recompute from current data: delete a score from a complete class → back to `active`; new score lands → `complete` again. No special-case event logic; the recompute IS the rule.
   - [ ] Accept  [ ] Override: ________
4. **Empty class (0 entries)?** — **Recommend:** stays `neutral` (never auto-starts, never auto-completes). Formal closeout of empty classes is the manual "Mark Complete" override — which now sticks, thanks to the override marker. Optionally revisit auto-closing empty classes as part of trial wrap-up later; not in v1.
   - [ ] Accept  [ ] Override: ________
5. **Weather cancellation / early closeout?** — **Recommend:** manual "Mark Complete" with the override marker; derivation stops recomputing that class. Unscored entries keep whatever terminal state the secretary assigns (or none — the closeout report shows them as unscored).
   - [ ] Accept  [ ] Override: ________
6. **Late entry added to a `complete` class?** — **Recommend:** reactive flip-back to `active` — and this **clears a manual override** if one was set, plus raises an attention flag on the class (the secretary who force-closed it needs to know new work appeared). A late entry silently hiding under a closed class is the worse failure.
   - [ ] Accept  [ ] Override: ________

**Implementation candidate — recommend (A) Supabase trigger, with two 2026-07 corrections to the table above:** candidate (B) "myK9Q application logic" is void — `apps/myk9q` was deleted; scoring now flows through `/at-show` → `ringside_update_entry` RPC → `entries` writes, which strengthens (A): a trigger on `entries` catches every scoring path (RPC, direct manager UPDATE, future paths) with no app coupling. The trigger should formalize the existing client-side `getClassDisplayStatus` derivation (per the 2026-07-02 status note) so client and server agree by construction. Note the scoring-completion trigger precedent (`20260525170000`, placement recalc) — same fire conditions; consider extending it rather than adding a second trigger on the same columns (trigger-ordering hazard).

When the boxes are checked, the full plan can be drafted per the "When to draft" gates — prerequisite 2 (workbench stability) is long met; only the interview remains.

## Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-05-22 | Stub created during Option B review session. PO observed that class status transitions are derivable from scoring events; full plan deferred until PO interview locks edge-case rules. | This session |
| 2026-07-11 | Proposed answers drafted for all six questions + override-marker design point + candidate (B) voided (myK9Q deleted). Awaiting owner check-boxes. | Fable audit session |
