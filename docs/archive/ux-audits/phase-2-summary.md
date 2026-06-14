# Phase 2 UX Audit Summary: Secretary Operations

**Date:** 2026-04-04
**Pages audited:** Pipeline Dashboard, Day-of Operations, Results Control, Show Creation Wizard, Entry Management

---

## Cross-Cutting Themes

### 1. "Surfaces Problems, Not Data" — Not Yet Delivered

Pipeline Dashboard shows 10 stat chips (counts, percentages) but no actionable alerts ("3 classes need review"). Day-of Operations has no summary header showing counts across scratches/move-ups/entries. Results Control has no resolved-settings view showing the net effect of cascaded overrides. The secretary intent is "That was easy" — but the pages require the secretary to synthesize raw data into decisions.

### 2. Scratch/Move-Up Tap Count Exceeds INTENT Target

INTENT says "calm one-tap operations." Day-of Operations scratches take 4 taps minimum (navigate tab, find entry, click Scratch, confirm dialog). Move-ups take 5+ (same plus selecting target class). Touch targets on Scratch/Move-Up buttons use `size="sm"` (~32px) which violates the 44px INTENT guardrail.

### 3. Dead Controls and Incomplete Features

Pipeline Dashboard `is_scoring_finalized` and `is_results_reviewed` are hardcoded `false` — the Review/Publish/Closed workflow is non-functional. Entry Management "Send Email" bulk button has no onClick handler. Show Creation Wizard has a drag handle icon but no drag implementation. These dead controls erode trust.

### 4. No "Clone from Previous Show"

INTENT explicitly calls for "clone from previous shows." Show Creation Wizard has no clone feature. A secretary running their 4th show types the same details every time.

### 5. Show Selector Friction

Both Day-of Operations and Entry Management open with a full-card show selector that doesn't auto-select today's show. On show day, the secretary must pick the show before doing anything — even when there's only one active show.

---

## Top 10 Findings by Severity

| Rank | Finding                                                                                       | Page                 | Severity | Effort                                     |
| ---- | --------------------------------------------------------------------------------------------- | -------------------- | -------- | ------------------------------------------ |
| 1    | Pipeline `is_scoring_finalized`/`is_results_reviewed` hardcoded false — Review/Publish broken | Pipeline Dashboard   | Critical | Medium — wire to actual class data         |
| 2    | Scratch/move-up takes 4-5 taps, INTENT says 1 tap                                             | Day-of Operations    | High     | High — needs UX redesign                   |
| 3    | No "Clone from Previous Show" in creation wizard                                              | Show Creation Wizard | High     | Medium — add clone selector + data prefill |
| 4    | CSV export missing 4 columns (owner name, email, phone, reg #)                                | Entry Management     | High     | Medium — join owner data in export query   |
| 5    | "Send Email" bulk button does nothing                                                         | Entry Management     | High     | Low — remove dead button or implement      |
| 6    | Check-in status clickable but looks static (no cursor, no affordance)                         | Entry Management     | High     | Low — add cursor-pointer + visual hint     |
| 7    | No query error handling — skeleton forever on failure                                         | Results Control      | High     | Low — add error state with retry           |
| 8    | No effective-settings summary after configuring overrides                                     | Results Control      | High     | Medium — add resolved view per class       |
| 9    | Event number validation blocks wizard but UI says "optional"                                  | Show Creation Wizard | Medium   | Low — align validation with UI copy        |
| 10   | Pipeline pushed below fold by stat rows + announcements                                       | Pipeline Dashboard   | Medium   | Low — reorder: pipeline first              |

---

## Quick Wins (high impact, low effort)

| Fix                                                        | Page                 | Time Est |
| ---------------------------------------------------------- | -------------------- | -------- |
| Remove dead "Send Email" button or add `onClick` handler   | Entry Management     | 5 min    |
| Add `cursor-pointer` + border to check-in status buttons   | Entry Management     | 10 min   |
| Add error state with retry to Results Control queries      | Results Control      | 20 min   |
| Fix event number validation to match "optional" UI copy    | Show Creation Wizard | 5 min    |
| Move pipeline Kanban above stat rows and announcements     | Pipeline Dashboard   | 15 min   |
| Make drag handle visible (increase opacity + size)         | Pipeline Dashboard   | 5 min    |
| Increase Scratch/Move-Up button size to `size="default"`   | Day-of Operations    | 5 min    |
| Auto-select today's show in Day-of Operations selector     | Day-of Operations    | 20 min   |
| Remove GripVertical icon from trials (no drag implemented) | Show Creation Wizard | 5 min    |
| Set fee field defaults to common values ($30/$35)          | Show Creation Wizard | 5 min    |

---

## What's Working Well

- **Mission Control naming** — reinforces secretary confidence
- **Show > Trial > Class hierarchy** — correct mental model
- **5-column Kanban** — maps to real class lifecycle
- **Trial date auto-naming** ("Saturday Trial 1", "Saturday Trial 2") — excellent smart default
- **Single-judge auto-assignment** to all classes — removes decision
- **Single-template auto-selection** — removes decision for common case
- **Preset card pattern** in Results Control — clear visual for quick configuration
- **Comp entry workflow** — correct domain language and dialog structure
- **ScratchDialog destructive styling** — clear visual weight for irreversible action

---

## Recommendations

1. **Fix the Pipeline critical** — hardcoded booleans make the Review/Publish workflow decorative. This is the secretary's primary tool and it's partially broken.
2. **Remove dead controls** — "Send Email" button and drag handle icon with no implementation. These erode trust more than the missing features they represent.
3. **Reduce scratch/move-up tap count** — consider a quick-action overlay or inline scratch button directly in the class pipeline cards. The current dialog-based flow is too heavy for show-day urgency.
4. **Add "Clone from Previous Show"** — this is the single highest-ROI feature for secretary time savings. INTENT explicitly calls for it.
5. **Batch the error state fixes** — Results Control needs the same error-with-retry pattern as Phase 1 pages.

---

## Next Steps

- Add Critical and High findings to TO-DOS.md
- Proceed to Phase 3 (Public Discovery) or fix accumulated findings
