# Plan 005: Investigate the replication OCC/watermark/conflict race cluster (read-only spike)

> **Executor instructions**: This is a **read-only investigation**. You produce
> ONE findings document — you do **not** change any `.ts` under `packages/` or
> `apps/`. Follow the steps, answer each question with `file:line` evidence, and
> for each lead render a verdict: CONFIRMED bug / NOT A BUG / NEEDS-TEST. Update
> this plan's row in `docs/improve-audit-2026-07/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 929240192..HEAD -- packages/replication`
> If the package changed materially since this plan was written, note it in your
> doc and verify leads against the live code.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (produces a doc; changes no code)
- **Depends on**: none
- **Category**: investigate
- **Planned at**: commit `929240192`, 2026-07-02

## Why this matters

`packages/replication` is the offline-first engine behind ringside scoring — the
make-or-break reliability surface when a club runs a show on venue WiFi. The bug
audit surfaced several **plausible but unconfirmed** concurrency leads here.
Confirming or killing them needs careful reading (and in some cases a targeted
test) that is itself the work — jumping straight to a "fix" risks changing subtle
correct code. This spike separates the real bugs from the noise and scopes any
real fix into its own follow-up plan, so the risky edits happen with evidence,
not guesses.

Two of the audit's replication leads were **already rejected** during vetting —
do not re-litigate them (record them as settled in your doc):
- *Quota eviction deletes dirty rows* — FALSE. `evictToTarget` filters
  `if (row.isDirty) return false` (`packages/replication/src/core/ReplicatedTableCache.ts:240`);
  `evictLRU`/`evictRetainingFraction` delegate to it.
- *INSERT 23505 left in the failed queue* — already fixed
  (`packages/replication/src/MutationManager.ts:700`).

## Leads to verify (each gets a verdict + evidence in your doc)

### Lead A — OCC token not advanced for full-row UPDATEs on non-entries tables
`reconcilePendingMutationsForRow` skips advancing a queued full-row UPDATE's OCC
token when no `rebuildUpdatePayload` was supplied
(`MutationManager.ts:333` — `if (!isRpc && rebuiltData === undefined) continue;`).
Only `ReplicatedEntriesTable` supplies that hook
(`apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts:160`).

**The question that decides severity**: do any *non-entries* replicated tables
actually use OCC at all? OCC only engages when a queued `mutation.serverVersion`
is set (see the version precondition at `MutationManager.ts:767-768`). Determine
which `Replicated*Table` adapters populate `serverVersion` / carry a `version`
column. If **only entries** use OCC, Lead A is theoretical (other tables are
last-write-wins and the skip is harmless) → verdict NOT A BUG (document why). If
another table uses OCC without a rebuild hook, it can re-trigger the 40001
conflict storm → CONFIRMED, and scope the fix (supply/auto-generate the hook).

### Lead B — scoped vs unscoped watermark mixing
`ReplicatedTableCache` stores a table-global `lastIncrementalSyncAt` and
per-scope slots (`scopes[scopeValue]`); the monotonic-advance path
(`ReplicatedTableCache.ts:~490`) and the scoped projection
(`projectScopedMetadata`, `:390-411`). The lead: a table synced **both** globally
and per-scope could let a global advance poison a later scoped read, skipping
rows.

**The question**: enumerate every `sync(...)` call site and its scope. Be precise
about what "unscoped" means in the cache: `scope.value === undefined` is truly
unscoped, but `scope.value === ''` is still passed as a scoped slot value. Some
call sites intentionally pass an empty string to fetch all rows for a table, so
do not collapse "unfiltered fetch" and "metadata-unscoped" into the same bucket.
For each table, record whether its sync calls use a real scope value, `''`, or
`undefined`/`{}`; then decide whether any single table can mix the table-global
watermark with per-scope slots. If no table mixes those metadata modes, Lead B
can't fire → NOT A BUG (record the call-site table). If one does, → CONFIRMED;
scope an invariant/guard.

### Lead C — `baseData` missing for a locally-created row that reconciles before upload
A row created locally (INSERT, dirty, never downloaded) that gets reconciled by a
concurrent server merge before its INSERT uploads may lose its base snapshot,
defeating later 3-way conflict detection. Trace the INSERT queue path: is
`baseData`/`baseVersion` set when a row is first queued
(`packages/replication/src/core/ReplicatedTable.ts` reconcile path ~`:506-530`
and `syncReplicatedTable.ts:~268-280`)? Verdict + evidence. If real, this needs a
**failing test first** before any fix → mark NEEDS-TEST and describe the test.

### Lead D — conflict resolution drops server-added fields
`detectDirtyRowConflict` (`packages/replication/src/conflict/detectDirtyRowConflict.ts`)
iterates over base/local/remote keys. Lead: a field present on remote but absent
on local (server-added) is not flagged as a conflict, and "keep local" could
re-upload a payload that nulls it. This was LOW confidence / inferential in the
audit. Confirm whether the resolve path actually re-sends a full row that would
overwrite such a field, or whether it only sends touched-field deltas (which
would make this a non-issue). Verdict + evidence.

### Lead E — passcode-session expiry misclassified on OCC re-check
On an OCC 0-row result the manager does a direct `select('version')` re-check
(`MutationManager.ts:781-790`) and classifies the outcome
(`classifyEmptyUpdateResult`). Lead: for a passcode-authenticated ringside
client whose session expired, that SELECT fails RLS and the mutation may be
misclassified as "row deleted" and dead-lettered, with no re-auth recovery.
Confirm how `classifyEmptyUpdateResult` treats a *failed* (vs empty) re-check
and whether ringside passcode sessions can expire mid-show. Verdict + evidence.
(This one may need reading `packages/ringside/src/auth/*`.)

## Commands you will need (read-only)

| Purpose | Command |
|---------|---------|
| Find OCC usage | `grep -rn "serverVersion\|version" apps/myk9show/src/services/replication/Replicated*Table.ts` |
| Find sync call sites | `grep -rn "\.sync(" apps/myk9show/src packages/replication/src` |
| Run existing repl tests (to understand invariants) | `cd packages/replication && pnpm test` |

## Scope

**In scope** (create ONE file):
- `docs/archive/plan-replication-occ-watermark-findings.md` — the findings doc, with a
  verdict table (Lead A–E: CONFIRMED / NOT A BUG / NEEDS-TEST), `file:line`
  evidence for each, and for every CONFIRMED/NEEDS-TEST lead a short "fix scope"
  paragraph (what a follow-up plan would change, and what test proves it).
  Add a `> **Status:** Active` line under the title and register it in
  `docs/README.md` per the project's docs convention.

**Out of scope** (do NOT touch):
- Any `.ts`/`.tsx` under `packages/` or `apps/`. This spike changes no code.
- Re-verifying the two already-rejected leads beyond noting them settled.

## Done criteria (ALL)

- [ ] `docs/archive/plan-replication-occ-watermark-findings.md` exists with a verdict for
      each of Lead A–E, each backed by `file:line` evidence the executor read.
- [ ] Every CONFIRMED or NEEDS-TEST lead has a "fix scope" + "proof test" note.
- [ ] The doc has a `Status: Active` line and a row in `docs/README.md`.
- [ ] `git status` shows only the new findings doc, `docs/README.md`, and
      `docs/improve-audit-2026-07/README.md` changed — no source files.
- [ ] `docs/improve-audit-2026-07/README.md` row for 005 updated.

## STOP conditions

- A lead turns out to be a live, actively-firing bug (not latent) — finish the
  doc but flag it at the TOP as urgent so a fix plan is prioritized immediately.
- Verifying a lead would require running a mutation against the real database —
  STOP; this spike is read-only. Describe the test that *would* prove it instead.

## Maintenance notes

- The output doc becomes the input to one or more follow-up fix plans. Keep each
  lead's "fix scope" small and independently testable — do not bundle them.
- Anything you mark NOT A BUG: record the reasoning tightly so the next audit
  doesn't resurface it (this is how the rejected-findings ledger stays useful).
