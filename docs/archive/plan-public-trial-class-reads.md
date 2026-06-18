# Plan: Fix public trial/class identity reads (Lane 3.7)

> **Status:** Complete — Stage 1 merged (PR #805); Stage 2 merged (PR #811, 2026-06-17).

## Staging (why this is two PRs)
The two blockers look symmetric but have different fix surfaces. **ClassDetailsPage** reads
classes through a *query hook* (`useClassesQuery` → `getAllClasses`), so a service-layer
empty-guard fixes it transparently. **TrialDetailsPage** and **ShowDetailsPage** read the
*Zustand stores* (`useTrialStore`, `loadTrialClasses`) directly — only sync populates those,
and there is no DB-row→store-shape mapper, so fixing them needs page rewiring on a path staff
also use (real authed-regression risk). The low-risk service/hook fixes ship first.

- **Stage 1 (this PR):** A.3 `getAllClasses` empty-guard (fixes ClassDetailsPage blocker #1 +
  class-list leak #3) + D `useEntriesByClassQuery` anon branch (#5). Both go through the
  query-hook layer; no store surgery. Fully tested + anon REST-verified.
- **Stage 2 (this PR):** A.1 `getTrialById` + A.2 `getClassById` fallthroughs, B.4
  `TrialDetailsPage` (#2, the trial-page blocker), C.6 `ShowDetailsPage` default-style tabs (#4).
  These need the store-shape work and dedicated render tests. NOTE: A.1/A.2 each break a pinned
  "returns null for missing records" test and carry a double-throw-on-miss wrinkle through
  `withReplicationFallback` — do them *with* their consuming page, not alone.
  - **Decisions taken:** (A.1/A.2) chose option (ii) — `postgrestGet{Trial,Class}ById` switched to
    `.maybeSingle()` so the cold-but-present and genuinely-missing cases both resolve in one call
    with no throw; the pinned tests now mock `mockSupabase.from` and assert the fall-through.
    (B.4) `currentTrial`/`parentShow` fall back to `useTrialQuery` (new `hooks/queries/useTrialsDatabase.ts`,
    mapped via the existing `mapDatabaseToTrial`) and the existing anon-safe `useShowQuery`; the
    not-found guard now also fires once the anon fallback settles empty (no infinite spinner).
    (C.6) chose option B (feed the tabs, not extend the styled-landing early-return — option A would
    render the Monogram landing for default shows, violating documented intent): `effectiveTrials` =
    `landingTrials`, plus a per-trial `getClassesByTrialId` fetch reshaped by the new
    `pages/ShowDetailsPage.publicClasses.ts` helper into the tabs' `ClassInfo`/`TrialStats`.

Remediation for the Lane 3.7 replication-leak sweep (2026-06-17). Five public-route leaks
let a logged-out guest hit a cold replication store; two are blockers (the public trial and
class pages never render). #779 fixed the public *entries* path; trial/class *identity* and
the class *list* were never covered. The fix mirrors #779's split: a direct PostgREST read
for anon, no replication store on a public route.

## Root cause recap
`withReplicationFallback` only falls back to PostgREST on a THROW. A cold store (logged-out
guest never syncs) returns `[]`/`null` without throwing → false-empty success. Two by-id
reads (`getTrialById`, `getClassById`) compound this by returning `{data: null}` on a
cold store instead of the PostgREST fallthrough their `…ByShow`/`…ByTrialId` siblings use.

## Changes

### A. Service layer — make by-id + all-classes reads self-fall-through (universally correct)
1. `services/database/trials/reads.ts` `getTrialById`: `if (!trial)` → `return await postgrestGetTrialById(id)` (mirror `getTrialsByShow` / `getShowById`).
2. `services/database/classes/reads.ts` `getClassById`: `if (!cls)` → `return await postgrestGetClassById(id)`.
3. `services/database/classes/reads.ts` `getAllClasses`: add the `if (classes.length === 0) return await postgrestGetAllClasses()` empty-guard that `getClassesByTrialId` already has.
   - These help authenticated users too (a not-yet-synced entity no longer reads as null). No auth branch needed — trials/classes are plain public entities (anon has direct SELECT, proven by `getTrialsByShow`'s working fallthrough), unlike the gated `view_public_entry_results`.

### B. Page wiring — resolve identity through the (now anon-safe) reads, not the cold store
4. `pages/TrialDetailsPage.tsx`: `currentTrial` reads `useTrialStore().trials` (Zustand, cold for anon). Add a by-id query (`useTrialQuery` over `getTrialById`) and use `trials.find(...) ?? trialQuery.data`. New hook in `hooks/queries/useTrialsDatabase.ts` (or nearest existing trials-query module).
5. `pages/ClassDetailsPage/useClassDetailsData.ts`: `currentClass` derives from `useClassStoreCompat().classes` (full `getAllClasses` list) + `replicatedTrialClasses` (both cold for anon). Prefer a by-id `useClassQuery(classId)` (already wraps `getClassById`) for `currentClass`; source the sibling `trialClasses` list from `getClassesByTrialId` (already anon-safe) instead of filtering `getAllClasses`.

### C. ShowDetailsPage default-style tabs (medium)
6. `pages/ShowDetailsPage.tsx`: the anon `landingTrials` fallback is only wired to the StyledLanding early-return (fires only when `hasExplicitStyle`). For a *default*-style show an anon visitor falls to the tabbed UI, whose Trials/Classes tabs read the cold store (`associatedTrials`/`showClasses`). Feed those tabs (and their counts) from the anon-safe `landingTrials` + a classes-by-show/by-trial anon read when the store is cold.

### D. Entries roster (low)
7. `hooks/queries/useEntriesDatabase.ts` `useEntriesByClassQuery`: branch `isAnon` → `getPublicEntriesByClass` (mirror `useClassEntriesRaw`). Low impact (scored results already come from the GOOD `useClassEntriesRaw` path) but closes the last straggler.

## Testing
- Unit: `getTrialById`/`getClassById` fall through to PostgREST when the replicated row is absent (mock replicated → null, assert the postgrest fn is called and its data returned). `getAllClasses` empty-guard. Auth-branch test for `useEntriesByClassQuery`.
- Anon verification (cold session): direct REST reads of the seeded trial id + class id return rows; load `/trials/:id` and `/…/classes/:id` as a guest and confirm they render (per feedback_verify_anon_in_cold_session — the Preview MCP is pinned to main, so verify via REST + unit tests, not worktree preview).

## Out of scope
Anything touching the gated results view (that's #779/#799, already correct). This plan only
restores anon READ access to trial/class identity + lists — no new exposure (these entities
are already public; the bug is that guests couldn't load them).
