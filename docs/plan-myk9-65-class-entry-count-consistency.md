# MYK9-65: Class Entry Count Consistency

## Goal

Make Show Desk, Class Details, Class Management, Entry Management, and scoring agree on class-scoped entry totals and progress without bypassing the replication-backed Entry module.

## Read-path inventory

| Surface          | Current entry source                                                    | False-zero failure                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Show Desk        | `getEntriesForShow(showId)` under `queryKeys.showEntries(showId)`       | Explicitly detects a cold show replica and falls back to the secretary PostgREST read.                                                                       |
| Class Details    | `useClassEntriesWithQuery(classId)` plus `useClassEntriesRaw(classId)`  | `getEntriesByClass` accepts an empty class slice from a cold per-show replica as a real empty class.                                                         |
| Class Management | `useClassesByTrialQuery(trialId)` and each class row's joined `entries` | Replicated class reads aggregate `replicatedEntriesTable.getAll()`; a warm class replica plus cold entry replica produces `Entries: 0`.                      |
| Entry Management | `getEntriesForShow(showId)`                                             | Uses the same secretary show read as Show Desk, but maintains its own local loading/retry lifecycle.                                                         |
| Scoring          | Class-scoped replicated entry reads                                     | The browser re-walk showed `0 of 0` even after Entry Management proved the class had eight entries; the initial read never hydrates the show-scoped replica. |

## Canonical contract

- Use the Entry module's show-scoped secretary read as the shared staff source.
- Keep the existing `queryKeys.showEntries(showId)` cache identity so Show Desk, Class Details, Class Management, and scoring observe the same rows and invalidations.
- Derive every per-class total from `entry.class_id` on those shared rows.
- Preserve public/exhibitor result reads and the scoring mutation path.
- Treat loading and cold-online failure as unavailable, never as a confident zero.

## Agreed test seams

The Linear acceptance criteria are the pre-agreed TDD seams:

1. **Entry service seam:** the show-scoped secretary read returns scoring/check-in/payment fields consistently from replication and cold-store fallback.
2. **Class Details seam:** a known class renders the seeded total/readiness/run-sheet rows from the shared show query; loading or failure does not render zero.
3. **Class Management seam:** class rows derive seeded entry totals from the shared show query; loading or failure renders an unavailable count.
4. **Routing seam:** class-scoped Entry Management links preserve show, trial, and class parameters and their filtered result count matches the source count.
5. **Scoring seam:** the scoring list adapts the same shared show rows to the existing scoring model and renders eight total / three scored; loading or failure does not render zero.
6. **Browser seam:** desktop/tablet navigation from Show Desk through Class Details, Class Management, Entry Management, and scoring shows one consistent count.

## Implementation phases

### Phase 1 — Contract and red tests

- Extend the secretary entry row contract with the raw scoring fields needed by Show Desk and Class Details.
- Add red service and page regressions using the Heartland seed shape: Container Novice A has eight entries and three scored.
- Add explicit loading/error assertions that reject a visible zero.

### Phase 2 — Shared staff query

- Add a reusable staff show-entry query hook around `getEntriesForShow` and `queryKeys.showEntries`.
- Migrate Show Desk to the hook without changing behavior.
- Filter the same rows by class in staff Class Details and adapt them to the existing readiness/run-sheet shape.
- Derive Class Management row counts from the same query instead of the class query's embedded `entries` relation.
- Adapt the shared rows to the existing scoring model without changing replicated scoring mutations.

### Phase 3 — Count-to-filter agreement

- Reuse the existing Entry Management route builders and class filter.
- Verify total, review, payment, check-in, and scoring counts against the exact same class row set.
- Do not create another management surface.

### Phase 4 — Verification

- Run focused Vitest files after each vertical slice.
- Run myK9Show typecheck and lint for touched code.
- Run the relevant full unit suite once at the end unless it exceeds the repository's 60-second hang threshold.
- Re-walk the seeded secretary flow at desktop and tablet widths.
- Run code review, address blocking findings, and record evidence on MYK9-65.

## Baseline browser evidence

The authenticated production walk on July 19, 2026 established the exact contradiction for Container Novice A:

- Show Desk: eight entries, three scored (`3/8`, 38%).
- Entry Management with the exact trial/class filter: eight rows.
- Class Details: zero total and `0 of 0` scored.
- Class Management: `Entries: 0`.
- Scoring list: `0 of 0 scored`.

Snapshots are stored in the Codex visualization artifact directory for the MYK9-65 task. Branch behavior is covered by the focused component/service tests; an authenticated deployed-browser re-walk remains the final issue evidence gate after preview deployment.
