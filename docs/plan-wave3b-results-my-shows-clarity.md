# Wave 3B Results and My Shows Clarity Plan

> **Status:** Implemented locally on branch `codex/wave3b-results-my-shows-clarity`; pending PR

**Goal:** Make completed/history and results states trustworthy for exhibitors without adding new surfaces.

**Source audit:** [`docs/audits/2026-06-ux-journeys/SUMMARY.md`](audits/2026-06-ux-journeys/SUMMARY.md)

## Scope

- `UX-P2-02`: Completed/history entries should not combine active-state language such as `Pending Review`, `Payment Due`, and `Upcoming`.
- `UX-P2-12`: Results empty states should distinguish unscored, under-review/unreleased, and truly empty result states.
- `UX-P3-02`: Results copy should be calmer and more state-specific.

## Duplication Check

Does this duplicate an existing page? No. Wave 3B tightens existing exhibitor surfaces:

- Existing My Entries cards receive past-show status copy.
- Existing show `Results` tab receives state-specific empty copy.
- Existing show-detail My Entries rows receive a result-pending label instead of an upcoming label after the class date.

No new page, result workflow, payment workflow, dialog, or duplicate results surface is introduced.

## Testing Phase

- Add focused My Entries card coverage for past/history status badges.
- Add focused `WhereToBe` and `DogEntriesSection` coverage for past no-result entries.
- Add focused `ShowResultsTab` coverage for unscored and reviewed/unreleased empty states.
- Run related tests, app typecheck/lint, and `git diff --check`.

## Implementation Notes

- My Entries past/history cards now use `Review incomplete` and `Payment unresolved` for unresolved past-show states instead of live-action labels.
- Show-detail entry rows now label past classes without posted results as `Awaiting results`; future classes still read `Upcoming`.
- The Results tab now distinguishes no entries/results, entries with no scored runs, and scored runs whose placements are still being reviewed or unreleased.
