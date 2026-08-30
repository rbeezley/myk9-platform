# MYK9-261 / MYK9-262: Complete lifetime analytics results

## Goal

Ensure My Analytics reads every authenticated lifetime entry, including released scored entries beyond PostgREST's 1,000-row response cap, so its totals and derived statistics are complete and match My Entries.

## Requirements and acceptance criteria [ADDED]

- Reproduce the failure for seeded entries `…051` (Willow) and `…055` (Scout) as `exhibitor@myk9t.com`, and prove which layer loses the result: owned-dog IDs, the authenticated results view, PostgREST ordering/cap, or the hook mapper.
- Released own entries must reach Analytics with `result_text`, `search_time_seconds`, `total_faults`, and released `final_placement`, so Entries, Q Rate, Best Time, Avg Time, and per-dog statistics match My Entries.
- Return all matching rows rather than raising the 1,000-row limit; pagination must have deterministic boundaries and must fail the query rather than return a partial lifetime result when any page fails.
- Preserve the authenticated view's existing field-level release and ownership gates. MYK9-263 remains responsible for changing unreleased owner visibility and preliminary placement labelling.
- Do not enable the Analytics feature flag or premium gate in committed code.

## Scope

- Verify the latest `view_authenticated_entry_results` definition and the analytics query's selected columns.
- Add hook-level regression coverage proving more than 1,000 rows are returned through the public `useMyLifetimeStats` query seam.
- Keyset-paginate the existing authenticated-results query and preserve its final newest-first ordering.
- Do not change database views, authorization policy, generated database types, or result-visibility behavior.

## Diagnosis outcome [EXPANDED]

1. The seeded exhibitor's dog roster contains 251 dogs and includes Willow (`…041`) and Scout (`…044`).
2. A direct authenticated view read returns entries `…051` and `…055` with `is_own_entry = true`, `result_text = 'Q'`, times `38.5` / `41.2`, zero faults, and placements `1` / `2`.
3. `resolve_class_result_visibility('dec1a55e-…031')` returns all four fields visible for the completed, released class.
4. The browser's actual hook request returns exactly 1,000 of 1,231 matching rows, contains zero scored rows, and excludes `…051` / `…055`. The seed assigns tied `created_at` values, so ordering only by `created_at` leaves the cap boundary nondeterministic.
5. Root cause: incomplete, nondeterministically bounded client pagination. No database authorization change is required for MYK9-261/262.

## Hook change [EXPANDED]

- Fetch pages with a keyset cursor on the unique entry `id`, following the existing replication precedent for PostgREST-capped reads. Do not use offset pagination, which can skip or duplicate rows when data changes between page requests.
- Include `created_at` in the raw select, collect all pages, then sort the complete raw set by `created_at DESC, id DESC` before mapping. This preserves the hook's intended newest-first output while giving tied timestamps deterministic order.
- Use a 1,000-row page size and a bounded page count. A short page completes the read; a page error or exhausted safety bound throws so React Query exposes an error instead of confidently presenting partial lifetime statistics.
- Render that query failure as a retryable Analytics error state; never mislabel an incomplete read as “No Analytics Yet.”
- Keep the existing `dogIds.length === 0` fast path, selected result fields, `StatsEntry` mapping, query key, and cache strategy.

## Regression contract [EXPANDED]

- Add `useMyLifetimeStats.test.tsx` at the public hook seam, mocking only the database boundary and owned-dog query.
- First red assertion: 1,002 known rows split across a full first page and short second page must all reach the hook query result, including a scored row on page two.
- Add coverage that a later page error rejects rather than returning the first page and that an empty dog roster performs no database read.
- Add page coverage proving a failed read shows the retry action and does not show the empty-results state.
- Assert deterministic newest-first ordering for rows with equal timestamps using their entry IDs.

## Compatibility, recovery, and operations [ADDED]

- No migration, shared database write, generated type update, or deployment ordering change is required.
- The additional network requests occur only for accounts exceeding 1,000 matching entry rows; memory use remains proportional to the lifetime dataset already required by the client-side analytics engine.
- Rollback is a normal application-code revert. A page failure leaves no stored or partially committed state.
- After deployment, use the same read-only browser replay for Willow and Scout. Temporarily enable Analytics only in a local or preview build, then confirm no feature-flag change remains in the diff.

## Testing phase

- Run the new hook test red before implementation, then green after each pagination/error/ordering slice.
- Run the existing Analytics page and analytics utility tests plus `pnpm --dir apps/myk9show typecheck`.
- Run the full myK9Show test suite once at the end; stop and report if the known suite hang exceeds 60 seconds without useful output.
- Re-run the seeded browser read using the same account and capture the Entries, Q Rate, Best Time, Avg Time, and Scout breakdown values. Confirm the total exceeds 1,000 and Willow/Scout contribute their released results.
- Review `git diff --check`, the full diff, and the final worktree status for unrelated changes; confirm the Analytics flag remains false and authenticated-view visibility logic is untouched.

## Validation Profile [ADDED]

- Risk: medium
- Validation: app
- Rationale: this is an isolated exhibitor Analytics query change with focused hook coverage and no database, authorization, replication, or shared-system mutation.
