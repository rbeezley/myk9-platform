# Plan 004: Spike — map and rationalize the 7 entry-read modules

> **Status:** Active

> **Executor instructions**: This is an **investigation/design plan**, not a
> refactor. Your deliverable is a written findings document plus a concrete,
> reviewed refactor proposal — you must NOT move or merge production modules in
> this plan. Follow the steps, and if a STOP condition occurs, stop and report.
> When done, update the status row for this plan in `docs/improve-audit-2026-06/README.md` and leave
> your findings doc at the path in Step 5.
>
> **Drift check (run first)**: `git diff --stat deb820e35..HEAD -- apps/myk9show/src/services/database/entries`
> If the directory changed since this plan was written, note what changed in your
> findings doc; it does not block the spike but your map must reflect HEAD.

## Status

- **Priority**: P2
- **Effort**: L (spike itself is M; the refactor it scopes is L and is a
  separate, later plan)
- **Risk**: LOW (this plan writes only a doc; the risk lives in the follow-up)
- **Depends on**: none
- **Category**: tech-debt / direction
- **Planned at**: commit `deb820e35`, 2026-06-21

## Why this matters

The Entry entity's data-access layer is split across seven sibling modules under
`apps/myk9show/src/services/database/entries/`: `reads.ts` (761 lines),
`secretary.ts` (498), `secretaryPostgrest.ts`, `secretaryReadReplication.ts`,
`publicReads.ts`, `userEntriesReplication.ts`, plus the `index.ts` barrel. A
public seam already exists and is enforced (the barrel's header says "All callers
import from here — never from the sibling implementation files below"), so this
is **not** a missing-abstraction problem. The real risk is *internal*: there are
multiple read paths (replication-backed vs. direct PostgREST) with overlapping
responsibilities, and it is not obvious which one a given caller should use or
whether the choice is consistent. The project is in a "consolidate, don't
duplicate" phase, and a prior UX finding noted Entry Management showing stale
data on a cold replication store — a symptom of read-path confusion. Before
anyone refactors a hot, offline-critical path, we need a precise map: who calls
what, which path is replication-backed, and where the duplication actually is.
A blind merge here could break offline reads, so the spike comes first.

## Current state

- `apps/myk9show/src/services/database/entries/index.ts` — the public barrel.
  Its header comment (lines 1-3) states the one-module rule; it re-exports from
  `reads`, `publicReads`, `writes`, `lifecycle`, `moveUpNote`, `search`,
  `secretary`, `admin`, `invalidation`, `management-actions`. Note it already
  documents one known collision: `updateEntryStatus` is exported from `writes`
  as `updateEntryStatusWithAudit` because it "conflicts with the
  secretary-signature version in secretary.ts" (line 7, 19) — evidence the two
  modules have overlapping surface.
- The seven implementation modules (sizes from `ls -la` at plan time):
  - `reads.ts` (24,161 b) — generic reads: `getEntriesForShow`,
    `getEntryStatsByShow`, tombstone filtering, dog-entry aggregates.
  - `secretary.ts` (15,700 b) — secretary-scoped reads + status writes,
    replication-backed.
  - `secretaryReadReplication.ts` (9,607 b) — a replication read path.
  - `secretaryPostgrest.ts` (1,907 b) — a direct PostgREST path (by name).
  - `publicReads.ts` (3,620 b) — anon/public reads.
  - `userEntriesReplication.ts` (4,585 b) — the exhibitor "my entries"
    replication read.
  - `index.ts` (barrel).
- **Architecture constraint to honor** (from `CLAUDE.md` and the replication
  memory): persistent show-day data must be read through the replication layer
  so it works offline; the documented anti-pattern is a core flow doing a direct
  Supabase/PostgREST read that bypasses replication. A direct-PostgREST read is
  acceptable only on public/unauth routes (where the replication store is cold
  and would return false-empty). The spike must classify each read path against
  this rule — that classification *is* the core deliverable.
- **Vocabulary** (from `CONTEXT.md`): each entity is meant to have a canonical
  "Data Access Module" seam — use that term in the findings doc.

## Commands you will need

| Purpose                     | Command                                                                                                  |
|-----------------------------|----------------------------------------------------------------------------------------------------------|
| List the modules            | `ls -la apps/myk9show/src/services/database/entries/`                                                     |
| Find each module's exports  | `grep -rn "^export " apps/myk9show/src/services/database/entries/<file>.ts`                               |
| Find callers of an export   | `grep -rn "<exportedName>" apps/myk9show/src --include=*.ts --include=*.tsx | grep -v /entries/`           |
| Detect replication usage    | `grep -rn "replicat\|withReplicationFallback\|ReplicatedEntriesTable" apps/myk9show/src/services/database/entries/<file>.ts` |
| Detect direct PostgREST     | `grep -rn "supabase.from('entries')\|\.from(\"entries\")" apps/myk9show/src/services/database/entries/<file>.ts` |
| Typecheck (sanity only)     | `cd apps/myk9show && pnpm typecheck`                                                                      |

## Scope

**In scope** (the only file you create):
- `docs/plan-entries-read-consolidation.md` — the findings + refactor proposal.
  (Use `docs/` because this repo registers plans there; add the required
  `> **Status:** Active` line under the title per `CLAUDE.md`, and add a row to
  `docs/README.md`.)

**Out of scope** (do NOT touch in this plan):
- Any file under `apps/myk9show/src/services/database/entries/` — no moves, no
  merges, no deletions. Those are the *follow-up* plan's job.
- Any caller. You are reading and documenting only.

## Git workflow

- Branch: `advisor/004-entries-read-spike`
- This plan touches only docs. Per `CLAUDE.md`, docs-only changes may go direct
  to `main`, but since this is advisor output, default to the branch above and
  let the operator decide. Commit message:
  `docs(entries): map the 7 entry-read modules and propose consolidation`

## Steps

### Step 1: Inventory every export of all 7 modules

For each module, run the "Find each module's exports" command and record the
full list of exported functions/types in a table in the findings doc.

**Verify**: the doc has a row per export across all 7 files, none omitted
(cross-check counts against `grep -c "^export " <file>` per file).

### Step 2: Classify each read path as replication-backed or direct-PostgREST

For each *read* export, run the "Detect replication usage" and "Detect direct
PostgREST" commands against its module and read the function body. Tag each read
as one of: `replication` (offline-safe), `postgrest-public` (intended for
anon/cold routes), or `postgrest-core` (a direct read on a core authed flow —
this is the anti-pattern and a finding).

**Verify**: every read export has exactly one tag and a one-line justification
quoting the relevant line.

### Step 3: Build the caller map

For each read export, run the "Find callers" command. Record which
pages/hooks/components call it. Flag: (a) any caller importing from a sibling
module directly instead of the barrel (seam violation); (b) two different read
exports used by the *same* surface for the *same* data (duplication); (c) any
`postgrest-core`-tagged read called from an authed, offline-relevant surface.

**Verify**: the doc lists callers per export, with the three flag categories
called out explicitly (even if a category is empty, state "none found").

### Step 4: Identify the genuine consolidation opportunities

From Steps 2–3, write the specific, evidence-backed list of what should merge or
move, e.g. "`secretaryReadReplication.getX` and `secretary.getX` return the same
shape from the same source — merge into `secretary.ts`, delete
`secretaryReadReplication.ts`." Each proposed merge must name the exact
functions, cite the duplication evidence, and state the offline-safety
implication. Where two paths intentionally differ (replication vs. public), say
so and mark them **keep-separate** — not every split is debt.

**Verify**: each proposed change has (functions named) + (evidence line) +
(offline implication). No proposal without all three.

### Step 5: Write the follow-up refactor outline

End the doc with a sketch of the eventual refactor plan: ordered steps (add new
consolidated path → switch callers → delete dead module), the exact verification
(`pnpm typecheck`, the entries test files in
`apps/myk9show/src/services/database/entries/*.test.ts`, and an offline
read-path smoke), and the explicit risk that a wrong merge breaks offline reads.
Do not execute it.

**Verify**: `cd apps/myk9show && pnpm typecheck` exits 0 (you changed no code, so
this just confirms a clean tree); the findings doc exists at
`docs/plan-entries-read-consolidation.md` with a `> **Status:** Active` line and
a row added to `docs/README.md`.

## Done criteria

ALL must hold:

- [ ] `docs/plan-entries-read-consolidation.md` exists with: export inventory
      (Step 1), per-read replication/PostgREST classification (Step 2), caller
      map with the 3 flag categories (Step 3), evidence-backed merge proposals
      (Step 4), and a follow-up refactor outline (Step 5).
- [ ] The doc has `> **Status:** Active` under its title and a row in `docs/README.md`.
- [ ] `git status` shows only the two docs files changed (no production code).
- [ ] `docs/improve-audit-2026-06/README.md` status row for 004 updated.

## STOP conditions

Stop and report if:

- Any module turns out to be already unused (zero callers via the barrel and no
  re-export) — that is a delete candidate but confirm before recommending,
  because replication modules are sometimes wired via side effects, not imports.
- The replication-vs-PostgREST classification is ambiguous for a function
  because it branches at runtime (e.g. `withReplicationFallback`) — document the
  branch behavior rather than forcing a single tag.

## Maintenance notes

- The follow-up refactor (the L-effort one this spike scopes) is the risky part;
  it must land behind the entries test suite and an offline smoke. This spike's
  value is making that refactor safe to specify.
- Reviewer of this spike should sanity-check the offline-safety tags against
  `CLAUDE.md`'s offline-first rule — a misclassified `postgrest-core` read is the
  failure mode that matters.
