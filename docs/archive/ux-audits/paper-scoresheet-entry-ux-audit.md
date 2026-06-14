# UX Audit: Paper Scoresheet Entry (Secretary Workflow)

**Date:** 2026-04-13
**Auditor:** Claude
**Sources:** Code analysis — `ScoringEntryListPage.tsx`, `ScoresheetPage.tsx`, `BulkResultEntry.tsx`, `SecretaryClassDashboard.tsx`, `EntryTableRow.tsx`, `SimpleTimeFields.tsx`, `secretaryRoutes.tsx`, `App.tsx`, `docs/INTENT.md`

**Scope:** The secretary's paper scoresheet entry workflow — entering results from physical scoresheets after a class completes, when myK9Q was not used at ringside.

---

## Pass 1: Mental Model Alignment

**What UI suggests:** There is one way to enter scores: find the class, open it in some form, and type numbers.

**What it actually does:** There are two unconnected scoring paths in the codebase, both incomplete:

- **Path A** (`/scoring/classes/:classId/entries`) — `ScoringEntryListPage` lists entries; clicking one opens `ScoresheetPage` which dispatches to the `@myk9/scoring-ui` registry. Designed one-dog-at-a-time, judge-first. **Routes are not registered in any route file — navigating here produces a 404.**
- **Path B** (`/shows/:showId/trials/:trialId/classes/:classId/secretary`) — `SecretaryClassDashboard` with a "Bulk Entry" tab containing `BulkResultEntry`. Batch entry for a whole class. Route registered. **Scent Work-specific** — typed entirely around `ScentWorkEntry`, `ScentWorkResult`.

**Misalignment gaps:**

| UI Element                                      | User Expects                       | Actually Does                                                   | Severity |
| ----------------------------------------------- | ---------------------------------- | --------------------------------------------------------------- | -------- |
| Entry cards in class results table              | Click → score entry screen         | Navigates to `/scoring/classes/:classId/entries/:entryId` (404) | Critical |
| "Bulk Entry" tab on SecretaryClassDashboard     | Works for all sport types          | Only works for Scent Work (search time + Q/NQ + faults)         | High     |
| `classId: 'bulk-entry-class'` in submit handler | Results saved to the correct class | Always saves with hardcoded classId `'bulk-entry-class'`        | Critical |
| Tab key after Qualification select              | Moves to faults input              | Exits the Select component's focus trap unpredictably           | Medium   |

**Jargon found:**

- "1/100" label on hundredths field — secretary reads stopwatch as hundredths, the label is fine but visually small
- "MM:SS.HH" in table column header — the "HH" convention for hundredths is not standard for stopwatches; most secretaries read "MM:SS.xx"

---

## Pass 2: Information Architecture

**Current structure:**

- **Secretary Dashboard (PipelineDashboard)** — trial cards, class cards, no direct "Enter scores" action
- **Trial Detail page** → Classes tab → individual class cards → Secretary view (3 navigation steps after show)
- **SecretaryClassDashboard** → tabs: Overview | Bulk Entry | Placements
- **ScoringEntryListPage / ScoresheetPage** — exists as components, no routes registered

**IA issues:**

| Issue                      | Location                               | Problem                                                                                                                       | Recommendation                                                   |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| No "Enter Scores" shortcut | PipelineDashboard, DayOfOperationsPage | Secretary must navigate Show → Trial → Classes → Class → Secretary tab to reach bulk entry — 4–5 clicks                       | Add "Enter scores" action to class cards on trial/pipeline views |
| "Bulk Entry" tab label     | SecretaryClassDashboard                | Sounds like a bulk import feature, not "type scores from paper"                                                               | Rename to "Paper Entry" or "Manual Entry"                        |
| Two scoring paths          | App-wide                               | `ScoringEntryListPage` + `ScoresheetPage` exists but is unreachable and separate from `SecretaryClassDashboard`               | Decide on one path; register routes or delete orphaned pages     |
| Sport-specific bulk entry  | SecretaryClassDashboard                | Only Scent Work (time + Q/NQ + faults); Obedience uses points, Agility uses separate time/fault fields, Tracking is pass/fail | Abstract the entry row for each sport type                       |

**Visibility problems:**

- Hidden but should be visible: a "Paper Entry" or "Enter scores from scoresheet" button should appear on class cards once a class status is "completed" or "in-ring"
- Prominent but should be secondary: Summary Cards (total / with data / valid / invalid counts) at the top of BulkResultEntry add cognitive load before the secretary has typed anything — they're always 0 at start

---

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element                                    | Looks Like                     | Actually Is                                                          | Clear?                                                                     |
| ------------------------------------------ | ------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Three-field time input (Min / Sec / 1/100) | Three small inputs with labels | Auto-advances to next field on 2-digit input                         | Partially — auto-advance is surprising                                     |
| Qualification `<Select>`                   | Standard dropdown              | Keyboard-unfriendly — Tab key exits the trigger, not the option list | No                                                                         |
| Status badge ("Empty")                     | Read-only info                 | Indicates validation state                                           | Partially — "Empty" vs "Invalid" vs "Valid" is useful but badges are small |
| Submit button: "Submit N Results"          | Will save everything visible   | Only submits entries where `isValid === true`                        | Misleading — skips incomplete rows silently                                |
| Clock icon in SimpleTimeFields             | Opens something                | Opens a recent times popover                                         | No — not labeled                                                           |

**False affordances:**

- The "Submit N Results" button count only reflects valid entries, but the label says nothing about skipping others. Secretary might not notice 3 invalid rows are being skipped.

**Hidden affordances:**

- Auto-advance from Min → Sec → Hundredths on 2-digit entry — not communicated to user
- Recent times popover (clock icon) — no tooltip or label

**Recommended fixes:**

- Add a tooltip to the clock icon: "Recent times"
- Rename Submit button to "Submit [N] valid results (skip [M] incomplete)" when incomplete rows exist
- Make auto-advance behavior explicit with a subtle visual cue (pulse on next input)

---

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step                 | Decisions Required                                            | Can Be Reduced?                                       |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| Finding the bulk entry form | Navigate: Show → Trial → Classes → Class card → Secretary tab | Yes — add direct "Enter scores" link from class cards |
| Per-dog time entry          | 3 separate fields (min, sec, hundredths)                      | Partially — auto-advance helps; still 3 focus moves   |
| Per-dog qualification       | Select from 5 options                                         | Yes — default to "Qualified" (most common)            |
| Per-dog faults              | Free number input                                             | No reduction needed — occasional use                  |
| Per-dog notes               | Free text                                                     | Low cognitive load                                    |
| Reviewing before submit     | Summary cards + individual row badges                         | Partially — row badges are correct                    |

**Missing defaults:**

- Qualification has no default — "Select" placeholder means secretary must always make this selection even for Q entries. For classes with 20 dogs, most are Qualified; a default of `Qualified` with override would save 20 selections per class.
- Faults defaults to `0` — correct, leave as-is.

**Unnecessary complexity:**

| Complexity                                            | Who Needs It                                 | Recommendation                                                    |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Summary cards at top (Empty / Valid / Invalid counts) | Useful at review stage, noise at entry stage | Show only after secretary starts typing (hide when all = 0)       |
| CSV import / download template                        | Power users with large classes               | Keep but de-emphasize (move to overflow menu or secondary action) |
| `classId: 'bulk-entry-class'` hardcoded               | Nobody — this is a bug                       | Fix immediately                                                   |

**Cognitive load score:** High — 5+ navigation steps to reach the form, 5+ interactions per dog, no smart defaults for qualification.

---

## Pass 5: State Coverage

### ScoringEntryListPage

| State   | Implemented? | Quality | Issue                                                                                     |
| ------- | ------------ | ------- | ----------------------------------------------------------------------------------------- |
| Empty   | Yes          | Poor    | Shows "No Pending Entries / All entries have been scored!" — fine, but page is 404 anyway |
| Loading | Yes          | Good    | Spinner                                                                                   |
| Success | N/A          | —       | Navigates per-entry, no class-level success                                               |
| Error   | Yes          | Good    | AlertCircle + error message                                                               |

### BulkResultEntry / SecretaryClassDashboard

| State   | Implemented? | Quality | Issue                                                                                                                      |
| ------- | ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| Empty   | Yes          | Poor    | Shows "Empty" badges on all rows — no guidance on what to do                                                               |
| Loading | Yes          | Good    | isSubmitting disables submit button                                                                                        |
| Success | No           | Missing | After `onResultsSubmit` resolves, there is no success toast, confirmation, or visual acknowledgment. Form resets silently. |
| Partial | Yes          | Poor    | Rows with `hasChanges && !isValid` get red background — helpful but no tooltip on what's wrong                             |
| Error   | Yes          | Fair    | `submitError` Alert shown — but only for network/API failure, not per-row validation details                               |

**Dead ends found:**

- After successful bulk submit: no confirmation, no "what's next" guidance. Secretary doesn't know if it worked.
- If secretary accidentally navigates away mid-entry: no "unsaved changes" warning.

**Missing error handling:**

- No `confirm()` or dialog on navigate-away with unsaved changes
- No success state after bulk submit
- `classId: 'bulk-entry-class'` hardcoded — results are saved to wrong entity silently (data-loss bug)

---

## Pass 6: Flow Integrity

**Primary flow tested:** Secretary finishes a Scent Work class, takes paper scoresheets, opens laptop, enters results for 15 dogs.

**Step-by-step findings:**

| Step | Action                                                        | Friction                                             | Severity                                    |
| ---- | ------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| 1    | Secretary navigates to the show                               | Browse Shows → correct show                          | None                                        |
| 2    | Secretary finds the trial                                     | Show detail page → trial card                        | None                                        |
| 3    | Secretary finds the class                                     | Trial detail → Classes tab → class card              | None                                        |
| 4    | Secretary opens secretary view                                | Clicks "Secretary" link on class card (if visible)   | Medium — not always visible                 |
| 5    | Secretary opens Bulk Entry tab                                | Clicks "Bulk Entry" tab                              | Low — tab is there                          |
| 6    | Secretary types time for dog #1                               | 3 inputs: Min, Sec, 1/100 — auto-advance on 2 digits | Low — functional once learned               |
| 7    | Secretary selects Qualification                               | Opens Select, scrolls, picks "Qualified"             | Medium — required for every dog, no default |
| 8    | Secretary enters faults (0)                                   | Already defaulted — Tab to confirm                   | None                                        |
| 9    | Secretary moves to dog #2                                     | Enter/Tab from Notes → lands on dog #2 Minutes       | Low                                         |
| 10   | Secretary reviews and submits                                 | Clicks "Submit N Results"                            | Medium — no confirmation of success         |
| —    | **BLOCKED** if non-Scent Work class                           | Time field appears but doesn't match sport           | High                                        |
| —    | **BLOCKED** if secretary reaches class via EntryCardGrid link | Route is 404                                         | Critical                                    |

**Abandonment risks:**

- Secretary opens a class and sees the `ScoringEntryListPage` 404 (via EntryCardGrid link) — will likely give up or refresh, confused.
- Secretary enters all data then sees no success message — might submit again, creating duplicates.
- Secretary has an Obedience class — bulk entry form shows "Time (MM:SS.HH)" column which doesn't apply; qualifications are different. No way to enter points. Will abandon.

**Recovery gaps:**

- Navigate away mid-entry: no unsaved-changes warning — data is lost
- Accidental duplicate submit: no deduplication guard
- Wrong entries visible in bulk form: no way to filter to just one ring/class within the dashboard

**Flow verdict:** Completable with significant friction for Scent Work. Broken for all other sport types. Critical route-registration bug blocks the intended one-dog-at-a-time path entirely.

---

## UX Audit Summary

**Overall UX health:** Critical Issues

### Critical (Fix immediately)

| Finding                                                                                                         | Pass | Impact                                | Effort                                    |
| --------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------- | ----------------------------------------- |
| `/scoring/classes/:classId/entries` and `/:entryId` routes not registered — 404 on all entry-card scoring links | 1, 6 | All scoring via new path is broken    | Low — add 2 routes to secretaryRoutes.tsx |
| `classId: 'bulk-entry-class'` hardcoded in BulkResultEntry submit — results saved to wrong entity               | 1, 5 | Silent data-loss / data integrity bug | Low — pass classId prop through           |
| No success state after bulk submit — secretary doesn't know if it worked                                        | 5, 6 | Repeat submits, data corruption       | Low — add toast on success                |

### High Priority (Fix soon)

| Finding                                                                                                                                      | Pass | Impact                                           | Effort                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------ | --------------------------------------- |
| BulkResultEntry is Scent Work-only (ScentWorkEntry types, time field, Q/NQ options) — can't enter Obedience, Agility, Rally, Tracking scores | 1, 6 | Secretary blocked for all non-Scent Work classes | High — need sport-abstracted entry rows |
| No "Enter scores" shortcut from class cards on pipeline/trial views — requires 4–5 nav clicks                                                | 2, 4 | Secretary friction every session                 | Medium — add action to class cards      |
| No navigate-away warning when bulk entry has unsaved changes                                                                                 | 5, 6 | Data loss risk                                   | Low — add `useBeforeUnload` guard       |

### Medium Priority (Plan for)

| Finding                                                                | Pass | Impact                           | Effort                       |
| ---------------------------------------------------------------------- | ---- | -------------------------------- | ---------------------------- |
| Qualification field has no default — secretary must pick for every dog | 4    | ~20 unnecessary clicks per class | Low — default to "Qualified" |
| "Bulk Entry" tab name doesn't match mental model ("paper entry")       | 2    | Discovery friction               | Low — rename                 |
| Summary cards visible before any entry — noise                         | 4    | Minor distraction                | Low — hide until first entry |
| No confirmation dialog before navigating away from unsaved bulk data   | 5    | Data loss                        | Low                          |

### Low Priority (Nice to have)

| Finding                                                    | Pass | Impact            | Effort  |
| ---------------------------------------------------------- | ---- | ----------------- | ------- |
| Clock icon in SimpleTimeFields has no tooltip              | 3    | Discoverability   | Trivial |
| "MM:SS.HH" column header jargon — use "MM:SS.xx" or "Time" | 1    | Minor terminology | Trivial |
| Submit button count misleading when rows are being skipped | 3    | Trust             | Low     |

### Quick Wins (High impact, low effort)

- **Register scoring routes** (2 lines in secretaryRoutes.tsx) — unblocks the entire new scoring path
- **Fix `classId: 'bulk-entry-class'`** — pass the real classId from SecretaryClassDashboard as a prop
- **Add success toast after bulk submit** — `toast({ title: "Scores saved", description: "N results recorded." })`
- **Default Qualification to "Qualified"** — change initial state in `BulkResultEntry` from `''` to `'Qualified'`

### Recommendations

1. **Fix the critical bugs first** (routes missing, wrong classId, no success state) — these are blocking real usage today.
2. **Define one canonical paper entry path** — decide whether the new `ScoringEntryListPage`/`ScoresheetPage` flow or the `SecretaryClassDashboard` bulk entry is the intended future. The new flow is more sport-agnostic but requires route registration and scoresheet implementations. The bulk entry is faster for batch work but is currently sport-locked. For Phase 2, use the `SecretaryClassDashboard` bulk path (it's registered and accessible) and fix the criticals above.
3. **Abstract the entry row by sport type** — Scent Work needs time + Q/NQ + faults; Obedience needs points + Q/NQ; Agility needs time + faults + Q/NQ; Rally needs score + Q/NQ; Tracking needs pass/fail. Build a `SportEntryRow` pattern that takes the class config and renders the appropriate fields.
4. **Add a direct "Enter scores" action to class cards** — from the PipelineDashboard and trial class lists, a class with status "completed" or "running" should have a clear "Enter scores" link. One click, not five.
