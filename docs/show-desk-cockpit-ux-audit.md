# UX Audit: Show Desk Tab — Secretary Class Operations Cockpit

**Date:** 2026-07-22
**Auditor:** Claude
**Sources:** Code review of PRs #1414 (cockpit) and #1415 (overview/schedule consolidation) — `ShowDeskPanel.tsx`, `SecretaryCockpit.tsx`, `SecretaryCockpitSchedule.tsx`, `SecretaryCockpitFocusedClass.tsx`, `ClassOperationalControls.tsx`, plus `docs/INTENT.md`.

**Intent context:** `ShowDeskPanel.tsx` carries an `// INTENT:` comment — the cockpit projects Show Map data and deep-links to canonical pages; it does not duplicate entry/score/report workflows. Findings respect that boundary.

## Pass 1: Mental Model Alignment

**What UI suggests:** "Today's schedule" of Classes grouped by Trial, with a Now marker, a needs-attention triage strip, and a focused-class work panel. Matches how a secretary actually thinks on show day (what's running, what's late, what's next to print).

**What it actually does:** Exactly that — status/expected-start edits inline, everything else deep-links out. Strong alignment.

| UI Element | User Expects | Actually Does | Severity |
|---|---|---|---|
| "Needs closeout" filter | Unclear to a first-time secretary what "closeout" covers | Filters to classes needing wrap-up work | Low |
| "Complete" status | Might read as "everything done incl. scores" | CONTEXT.md defines it as judging finished only; the unentered-scores confirm guard reinforces this | Low (well handled) |

**Jargon found:** "Closeout" is the only borderline term; the rest (Scheduled Start vs Revised Expected Start, Paperwork Print) is backed by CONTEXT.md definitions and honest microcopy ("The scheduled time was preserved").

## Pass 2: Information Architecture

**Current structure:** Day chips → Needs attention strip → Schedule (per-Trial collapsibles) ∥ Focused Class panel (sticky sidebar on xl, inline expansion below the row on smaller screens).

| Issue | Location | Problem | Recommendation |
|---|---|---|---|
| No day context on single-day shows | Day chip row | Chips render only when >1 day; single-day shows lose the date entirely | Show a static date label when only one day |
| Attention strip vs per-row attention | Top strip + row badges + focused panel | Same issue can appear in 3 places; counts could read as different issues | Acceptable redundancy; keep counts consistent (strip shows `all.length` while listing `items` — see Pass 5) |

**Visibility problems:**
- Hidden but should be visible: pencil edit affordance on Expected Start is `opacity-0 group-hover` — invisible on touch/tablet, the primary show-day device.
- Prominent but should be secondary: none found. Hierarchy is well judged.

## Pass 3: Affordance Clarity

| Element | Looks Like | Actually Is | Clear? |
|---|---|---|---|
| Class row (whole div) | Static row | Clickable (focuses class) via `onClick` on a plain div | No — no cursor is set (`cursor-pointer` is present, OK visually) but **not keyboard-focusable, no role** |
| Class name | Link/button | Button that focuses class | Yes |
| Status pill | Badge | Dropdown trigger (chevron helps) | Yes |
| Expected start time | Plain text with clock icon | Inline editor trigger | Partially — hover-only pencil hides it on touch |
| Attention card CTA "Open" (top strip) | Generic | Navigates to the fix | Weak — violates the verb-first grammar established in #1406 |

**False affordances:** none found.

**Hidden affordances:** row-level click-to-focus (keyboard users can't reach it — inner button saves this, so severity is moderated); hover-only pencil.

**Recommended fixes:**
- Give the Expected Start pencil a persistent low-opacity state (`opacity-60 group-hover:opacity-100`) or always show on `pointer:coarse`.
- Rename top-strip attention CTA from "Open" to the verb-first action label (the focused-panel version already uses `item.label`).

## Pass 4: Cognitive Load

| Screen/Step | Decisions Required | Can Be Reduced? |
|---|---|---|
| Landing | Pick day (only if multi-day) → scan attention → pick class | No — already minimal; smart URL-state restore removes re-orientation cost |
| Status change | 1 tap + guarded confirm only when scores missing | No — well calibrated |
| Print confirm | Explicit dialog + undo toast | No — deliberate friction matching the "Paperwork Print" definition |

**Missing defaults:** none significant — focused class, day, and scroll anchor all persist in the URL (excellent for shared secretary tablets).

**Unnecessary complexity:** none. Filters are four options, scoped to the schedule only and labeled as such.

**Cognitive load score:** Low — the strongest aspect of the redesign.

## Pass 5: State Coverage

### Schedule / Cockpit

| State | Implemented? | Quality | Issue |
|---|---|---|---|
| Empty (filter) | Yes | Good | "No Classes match this filter." |
| Empty (no classes at all / no trial groups) | No | Missing | Section renders nothing — blank area with no guidance |
| Loading (paperwork prints) | Partial | OK | `paperworkPrints.data ?? []` renders as "not printed" while loading — momentarily misleading |
| Pre-show | Yes | Good | "Show-day work has not started…" banner |
| Error (status/start/print mutations) | Yes | Good | Toast per failure, undo on print confirm |
| Error ("Use scheduled time" revert) | No | Missing | `void setRevisedExpectedStart(classId, null)` — no saving state, no success/error feedback |

**Dead ends found:** empty-schedule case above.

**Missing error handling:** the revert-to-scheduled-time action (fire-and-forget).

## Pass 6: Flow Integrity

**Primary flow tested (code walkthrough):** Secretary opens Show Desk mid-show → triages attention → focuses running class → updates status → revises start → prints and records paperwork.

| Step | Action | Friction | Severity |
|---|---|---|---|
| 1 | Open tab | None — day auto-selected, anchor restored, "Jump to now" available | None |
| 2 | Triage attention | "Open" label vague; otherwise chips land on the fix per guardrail | Low |
| 3 | Focus class | Inline on tablet, split panel on desktop — both good | None |
| 4 | Change status | Confirm guard uses `window.confirm` — inconsistent with the app's dialog language (print confirm got a real dialog) | Med |
| 5 | Revise start | Good; revert path lacks feedback (Pass 5) | Med |
| 6 | Print + record | Two-step (Print → Record as printed) is honest to the domain; undo + history + void covered | None |

**Abandonment risks:** none serious.

**Recovery gaps:** "Mark incorrect" in print history also uses `window.confirm`.

**Flow verdict:** Completable — smooth, with two consistency papercuts.

---

## Summary

**Overall UX health:** Good — this is a genuine upgrade and honors both INTENT.md and the consolidation phase (projection + deep links, no duplicated workflows).

### High Priority

| Finding | Pass | Impact | Effort |
|---|---|---|---|
| Hover-only pencil on Expected Start invisible on touch | 3 | Tablet secretaries may never discover inline time editing | Trivial |
| Empty cockpit (no trials/classes) renders blank | 5 | Confusing first-visit state | Small |

### Medium Priority

| Finding | Pass | Impact | Effort |
|---|---|---|---|
| `window.confirm` in status guard + print-history void | 6 | Inconsistent with shadcn dialog language; unstyled, blocks thread | Small |
| "Use scheduled time" revert has no saving/error feedback | 5 | Silent failure possible offline | Small |
| Row click-to-focus not keyboard-accessible (plain div) | 3 | Keyboard users rely on inner name button only | Small |

### Low Priority

| Finding | Pass | Impact | Effort |
|---|---|---|---|
| Attention CTA "Open" not verb-first | 3 | Breaks grammar from #1406 | Trivial |
| No date shown on single-day shows | 2 | Minor orientation loss | Trivial |
| Paperwork rows read "Not confirmed printed" while print records still load | 5 | Momentary misinformation | Small |

### Quick Wins
- Pencil: persistent at reduced opacity.
- Attention CTA: use `item.label` (already done in the focused panel).
- Revert button: add `isSaving` + toast, mirroring the save path.

### Recommendations
1. Fix the touch-affordance and empty-state gaps before a live show weekend — both are tablet-first realities.
2. Replace the two `window.confirm` calls with `AlertDialog` to match `PaperworkPrintConfirmationDialog`.
3. Leave the architecture alone — schedule + focused panel + URL state is the right shape; iterate on microcopy only.
