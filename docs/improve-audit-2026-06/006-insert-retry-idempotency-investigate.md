# Plan 006: Investigate INSERT retry idempotency in the replication mutation queue

> **Status:** Active

> **Executor instructions**: This is an **investigation plan**. Your deliverable
> is a written verdict (with evidence) on whether a retried INSERT can create a
> duplicate row, plus a recommended fix-or-no-fix. Do **not** change production
> replication code in this plan — a wrong change here corrupts offline data for
> every entity. If your verdict is "fix needed," scope the fix as a follow-up
> plan; do not execute it. When done, update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat deb820e35..HEAD -- packages/replication/src apps/myk9show/src/services/replication`
> If these changed since this plan was written, re-read the cited code at HEAD.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (this plan is read-only; the risk is in the deferred fix)
- **Depends on**: none
- **Category**: bug (investigate)
- **Planned at**: commit `deb820e35`, 2026-06-21

## Why this matters

The replication layer uploads queued mutations to Supabase. For INSERTs it runs
`supabase.from(tableName).insert(data).select('id')` and treats a 0-row result as
an RLS block. If a network timeout fires **after** the server commits the INSERT
but **before** the client receives the response, the mutation is retried — and if
the row's primary key is server-generated, the retry inserts a *second* row,
corrupting offline-originated data (entries, scores). If, instead, the PK is a
**client-generated UUID** carried in `data`, the retry hits a duplicate-key error
and no second row is created — but then the queue must treat that duplicate-key
error as success, or it will wedge retrying forever. Which of these is true
determines whether there is a bug at all, and what the fix is. This plan settles
that with evidence before anyone touches the upload path.

## Current state

- `packages/replication/src/MutationManager.ts` — the mutation queue + uploader.
  - The INSERT execution (around lines 586-604):
    ```ts
    case 'INSERT': {
      const { data: rows, error } = await withTimeout(
        this.supabase.from(tableName).insert(data).select('id'),
        TIMEOUT_PRESETS.standard,
        `${tableName} insert`
      );
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error(`RLS policy blocked INSERT on ${tableName} ...`);
      }
      return {};
    }
    ```
  - Mutations are enqueued with a `rowId` (the **affected row's PK**, passed in
    at line ~116) and a separate `crypto.randomUUID()` at line ~141 that is the
    **mutation/queue-entry id** (not the row PK). Do not confuse the two.
  - On failure, mutations are re-queued (`Re-queued failed mutation ...`,
    around line 217) — confirming retries happen.
- The per-table INSERT call sites that build `data` (to inspect whether `data`
  includes a client-generated PK):
  `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts`,
  `ReplicatedDogsTable.ts`, `ReplicatedClassesTable.ts`,
  `ReplicatedShowsTable.ts`, `ReplicatedTrialsTable.ts`,
  `ReplicatedClubsTable.ts`, `ReplicatedArmbandsTable.ts`,
  `ReplicatedJudgeAssignmentsTable.ts`.
- **Architecture note** (replication memory / `CLAUDE.md`): the replication layer
  is UUID-native (the ringside id→string migration made ids client-side UUID
  strings). That is a strong *hint* the PK is client-generated and included in
  `data`, but you must confirm it per the entities that actually originate
  offline INSERTs (entries/scores matter most), not assume it.

## Commands you will need

| Purpose                          | Command                                                                                          |
|----------------------------------|--------------------------------------------------------------------------------------------------|
| Inspect INSERT execution         | `sed -n '580,640p' packages/replication/src/MutationManager.ts`                                   |
| See how `data` is built for INSERT | `grep -rn "queueMutation\|enqueue\|'INSERT'\|\"INSERT\"\|\.insert(" apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts` |
| Check if id is set client-side   | `grep -rn "id:\|randomUUID\|uuid(" apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts` |
| Find duplicate-key handling      | `grep -rn "23505\|duplicate key\|on_conflict\|upsert\|onConflict" packages/replication/src apps/myk9show/src/services/replication` |
| Look for existing idempotency    | `grep -rn "idempot\|already.*exist\|conflict" packages/replication/src`                            |

## Scope

**In scope** (the only file you create):
- `docs/plan-replication-insert-idempotency.md` — the investigation verdict +
  recommended action. Add the `> **Status:** Active` line and a `docs/README.md`
  row per `CLAUDE.md`.

**Out of scope** (do NOT touch):
- `MutationManager.ts` and any `Replicated*Table.ts` — no code changes. This is
  a read-only investigation; the fix (if any) is a separate plan.

## Git workflow

- Branch: `advisor/006-insert-idempotency-spike`
- Commit: `docs(replication): investigate INSERT retry idempotency`
- Docs-only; default to the branch and let the operator choose direct-to-main.

## Steps

### Step 1: Confirm whether the row PK is client-generated and sent in `data`

For at least the offline-critical entities (entries, plus scores if a separate
table, then dogs/classes), trace the INSERT call site to see whether the object
passed as `data` already contains an `id` (or the table's PK) generated on the
client (UUID) **before** upload. Record per entity: PK column, client-generated
yes/no, evidence line.

**Verify**: the doc states, per inspected entity, whether `data` carries a
client PK, each with a `file:line` citation.

### Step 2: Determine the retry behavior on a duplicate

Read the upload/retry path in `MutationManager.ts` (the catch/re-queue around
line 217 and the INSERT case). Answer: if the server already committed the row
and the same INSERT is retried, what happens?
- If PK is client-UUID in `data` → the retry returns a Postgres unique-violation
  (SQLSTATE `23505`). Does the code catch `23505` and treat it as success, or
  does it `throw` and re-queue forever? (Use the "Find duplicate-key handling"
  command.)
- If PK is server-generated → the retry creates a second row. Confirm nothing
  upstream dedupes it.

**Verify**: the doc states exactly one of: (A) safe — duplicate-key is handled as
success; (B) wedge — duplicate-key is thrown and re-queued indefinitely; (C)
duplicate-row — server PK, retry inserts a second row. Cite the lines that prove
which.

### Step 3: Write the verdict and scope the fix (if any)

Based on Steps 1–2:
- Verdict **A (safe)**: write "no fix needed," note the reasoning so this is not
  re-audited, done.
- Verdict **B (wedge)**: scope a fix — catch SQLSTATE `23505` in the INSERT case
  and treat as success (the row exists, which is the desired post-state). List
  the exact lines and a test approach (mock the supabase insert to return a
  `23505` error on the second call; assert the mutation is marked done, not
  re-queued).
- Verdict **C (duplicate-row)**: scope a fix — move offline-originating PKs to
  client-generated UUIDs, or switch the INSERT to an idempotent upsert keyed on a
  stable client id. Note the blast radius (every Replicated*Table) and that this
  is an L-effort follow-up.

**Verify**: the doc ends with one verdict (A/B/C), and for B/C a concrete,
named-files fix outline with a test approach. `git status` shows only the docs
file(s).

## Done criteria

ALL must hold:

- [ ] `docs/plan-replication-insert-idempotency.md` exists with per-entity PK
      findings (Step 1), the retry-behavior verdict A/B/C with citations
      (Step 2), and a fix outline for B/C or an explicit "no fix needed" for A
      (Step 3).
- [ ] The doc has `> **Status:** Active` and a `docs/README.md` row.
- [ ] No production code changed (`git status`).
- [ ] `plans/README.md` status row for 006 updated.

## STOP conditions

Stop and report if:

- Entities disagree (some PKs client-generated, some server-generated) — report
  the split; the fix may differ per entity and must not be applied uniformly.
- The INSERT path is already routed through an upsert/`on_conflict` you did not
  expect — then idempotency may already be handled; document it and mark the
  finding resolved.

## Maintenance notes

- Whichever verdict, record it so this is not re-audited (the audit that spawned
  this plan flagged it as MED-confidence precisely because the PK origin was
  unknown).
- If the verdict is B or C, the follow-up fix touches the offline write path for
  every entity — it must land behind `MutationManager.test.ts` and a retry-with-
  duplicate test, and be reviewed against `CLAUDE.md`'s offline-first rule.
