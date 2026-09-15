# Bug audit — `packages/*` — 2026-09-15

**Week 38 · IDX 8 · scope `packages/*`** (rotation: `WEEK % 10`).
Baseline `4800ec108` (== `origin/main` at run time). Static code review, not a browser walk.

Reviewer: one agent, run sequentially, no sub-agents. 289k subagent tokens, ~17 minutes.
The scope table names **Fable** for this slice; the standing repo rule is that Agent calls pass
`opus` (Fable is main-session only), so the reviewer ran on **Opus** — the same judgment tier, not
a downgrade. Noted here so the substitution is not silently repeated as if the table said Opus.

## Summary

Six findings verified by the reviewer; **all six survived my own re-read of the cited lines**.
Four Linear issues filed (one P0, one parent, three sub-issues). Nothing was dropped on
verification, and nothing was a duplicate of the 2026-09-01/02 packages sweep.

| Sev | Finding | Filed |
| --- | --- | --- |
| P0 | AKC Detective classes are submitted to AKC as **Novice A** | [MYK9-547](https://linear.app/myk9-platform/issue/MYK9-547) |
| P2 | `subscribeToPush` hangs the Ring Alerts toggle forever on a device with no usable service worker | [MYK9-549](https://linear.app/myk9-platform/issue/MYK9-549) |
| P3 | `redactSecretLikeString` redacts the word "Bearer" and leaves the token behind | [MYK9-550](https://linear.app/myk9-platform/issue/MYK9-550) |
| P3 | Dead-code residue: two divergent `parseSmartTime`, `queryByField`/`queryIndex`, `useRingsidePermission` | [MYK9-551](https://linear.app/myk9-platform/issue/MYK9-551) |

Parent for the P2/P3 group: [MYK9-548](https://linear.app/myk9-platform/issue/MYK9-548).

## Findings

### P0 — AKC Detective submitted as Novice A (MYK9-547)

`packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts:42-51` classifies the AKC class
code from `level`. AKC Detective is a **standalone element with no level**:

- `apps/myk9show/src/features/registries/scentWork.ts:181-185` — *"Standalone (e.g. Detective)
  renders as just the element name, no level."*
- `apps/myk9show/src/data/templates/akcScentWorkRules.ts:216-231` — the Detective `ClassDefinition`
  has no `level` key at all.
- `apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts:260-261` — `level: cls.level ?? ''`.

So `mapPrimaryClass('', null)` matches no branch — `''.startsWith('Detective')` is false — and falls
to `return 'SWNOVA'; // safe fallback` at `:50`. `mapSecondaryClass('Detective')` has no case and
returns `''`, so no `secondaryClass` is emitted either. Every Detective run reaches AKC as **Scent
Work Novice A**. The `'SWDC'` branch at `:49` is unreachable with real data.

**Verified against the live database** (`sojmvhhwsjxmfistvzbe`), not just the code:

```sql
select element, level, count(*) from public.sport_class_rules
where element ilike 'detective' or level ilike 'detective' group by 1,2;
-- [{"element":"Detective","level":null,"n":1}]
```

The repo already carries the counter-example in another subsystem —
`apps/myk9show/src/services/titleEngine.ts:57-61` documents the same NULL-level shape and says
dropping those results *"made SWD unearnable from platform scoring."* The AKC formatter never got
that treatment.

The two tests that appear to cover it invent the vocabulary: `AKCScentWorkFormatter.test.ts:281`
and `:317` both set `level: 'Detective'`, a value nothing in the repo writes. That is the MYK9-323
pattern, one function over in the same file.

> **Note.** No Detective classes exist on staging today (`public.classes` has none), so this has not
> yet corrupted a real submission. It fires the first time a show runs Detective.

### P2 — `subscribeToPush` hangs the Ring Alerts toggle (MYK9-549)

`packages/notifications/src/push.ts:31-38` documents the trap on itself (`.ready` never rejects, it
just never settles) and `:49-65` provides `getReadyRegistration()`, a 2s-bounded race.
`unsubscribeFromPush` (`:105`), `lookupExistingSubscription` (`:121`) and `getExistingSubscription`
all use it. `subscribeToPush` at `:82` does not — `await navigator.serviceWorker.ready`, raw.

Traced the whole caller chain: `RingAlertsSettings.tsx:130-141` sets `isPushLoading(true)` and
awaits inside `try/finally`; `usePushSubscription.ts:40` awaits inside `try/catch`. Because the
promise never settles, neither the `catch` nor the `finally` ever runs — the toggle spins forever
with no toast and no recovery but a reload.

`git log -S "getReadyRegistration"` shows the guard arrived in `04be60937` (#1990); this call site
was missed. Same shape as MYK9-471 ("the site MYK9-404 missed"), so filed as its own issue rather
than reopening MYK9-247.

### P3 — Bearer redaction gap (MYK9-550)

`packages/core/src/utils/redaction.ts:30-40`. `KEY_VALUE_SECRET_RE`'s value class `([^&#\s]+)` stops
at whitespace, so `token=Bearer abc` matches only `token=Bearer` and becomes `token=[redacted] abc`
— destroying the `Bearer` anchor that `BEARER_RE` needs one line later.

**Reproduced against the built module** (`packages/core/dist/index.js`, not a re-implementation):

```
"token=Bearer opaque-token-value-1234"  -> "token=[redacted] opaque-token-value-1234"   LEAK
"authorization=Bearer sb_publishable_…" -> "authorization=[redacted] sb_publishable_…"  LEAK
"apikey=Bearer rk_live_…"               -> "apikey=[redacted] rk_live_…"                LEAK
"Authorization: Bearer sbp_…"           -> "Authorization: Bearer [redacted]"           ok
"Authorization: Bearer eyJ….eyJ….Sfl…"   -> "Authorization: Bearer [redacted]"           ok
```

P3 rather than higher: the input shape is narrow, and a JWT is still caught by `JWT_RE` two lines
later. Secondary note in the issue — `SECRET_KEY_RE` omits Stripe restricted keys `rk_live_`/`rk_test_`.

### P3 — Dead-code residue (MYK9-551)

One issue, per-symbol grep counts in the issue body. Two of the three carry a latent defect:

- **Two `parseSmartTime` implementations** (`packages/ringside/src/utils/timeInputParsing.ts:77`,
  `packages/scoring-ui/src/utils/parseSmartTime.ts:13`), both barrel-exported, both with **zero**
  importers, whose own tests pin opposite answers: `"45"` → `00:00.45` vs `0:45.00`; `"2345"` →
  `00:23.45` vs `23:45.00`. Ringside reads bare two digits as hundredths, scoring-ui as seconds.
  P3 only because the live AKC sheet takes its time from `useStopwatch`, never a parsed string.
- **`queryByField` / `queryIndex`** (`ReplicatedTableQuery.ts:21`, `:104`) — the catch at `:82`
  attributes *any* non-timeout error to a missing index, logs a warning, and falls back through
  `getAllData` → `getAll` → the lossy adapter, returning `[]`. That is MYK9-252 exactly, in the
  sibling the fix never rewired. Zero production callers; only `ReplicatedTable.retention.test.ts`.
- **`useRingsidePermission`** — test-only, the mirror of the deleted `apps/myk9q` hook.

## Dropped on verification

None. All six findings were re-read at the cited `file:line` and confirmed. Two were additionally
proven beyond the reviewer's own evidence — F3 against the live `sport_class_rules` table, F6 by
executing the built `@myk9/core` module.

## Not filed (report-only)

- **Missing Linear labels.** The task asks for `p0`/`p1`, `source:claude` and `audit:bug-scope`
  labels. None exist in this workspace (`list_issue_labels` returns 13 labels, none of them these).
  Followed the established precedent instead — `Claude` + `Bug`/`Improvement` plus Linear priority
  (Urgent for P0, Low for P3). Creating labels is a shared-system schema change and was not made
  unprompted.
- **At-show class-status collapse.** `cancelled` → `no-status`, so a cancelled class with any scored
  entry renders "In progress". Real, but it carries an explicit owner-decision INTENT block at
  `apps/myk9show/src/features/at-show/ringsideClassStatusMap.ts:10-15` ("Do NOT 'fix' this collapse
  without that migration") and lives in `apps/`, outside this scope.

## Landed on already-filed work, no second issue opened

Checked each against the 2026-09-01/02 packages sweep and confirmed the fix is present; none has
regressed, so nothing was re-filed and no recurrence comment was warranted.

MYK9-252 (`getAllWithStatus` present at `ReplicatedTableQuery.ts:129`), MYK9-206 (`expectedRemoteRows`
now persisted, `syncReplicatedTable.ts:165-171`), MYK9-324, MYK9-325, MYK9-326, MYK9-343, MYK9-328,
MYK9-115 containment, MYK9-91 run-queue, MYK9-303.

## Coverage

### Read closely (line by line)

- `packages/replication/src/syncReplicatedTable.ts` (all 415 lines); `core/ReplicatedTableCache.ts`
  :95-200, :330-495; `core/ReplicatedTableQuery.ts` (all); `core/ReplicatedTableBatch.ts` :25-170;
  `core/ReplicatedTableRowState.ts` (all); `core/ReplicatedTable.ts` :390-470, :775-1000.
- `packages/replication/src/` mutation layer: `mutation-ordering.ts`, `mutation-occ.ts`,
  `mutation-occ-rejection.ts`, `mutation-execute.ts`, `mutation-retry.ts`, `mutation-utils.ts`,
  `MutationUploadRunner.ts` (all 499), `quota-eviction.ts`, `parseUpdatedAt.ts`.
- `packages/ringside/src/`: `pages/EntryList/runQueue.ts`, `dogsAheadInList.ts`,
  `quickAdvanceCandidates.ts`, `components/classCompletionStorage.ts`, `utils/timeInputParsing.ts`,
  `utils/classStatus.ts`, `utils/staleDataUtils.ts`, `auth/passcodes.ts`,
  `context/useRingsidePermission.ts`, `pages/EntryList/permissions.ts`.
- `packages/secretary/src/`: `results/formatters/akcEntryOutcome.ts`,
  `results/formatters/AKCScentWorkFormatter.ts`, `results/types.ts`, `results/registry.ts`,
  `visibility/visibility-cascade.ts`, `visibility/visibility-types.ts`, `checkin/checkin-cascade.ts`,
  `index.ts`.
- `packages/core/src/`: `helpers/trial-status.ts`, `helpers/class-display-status.ts`,
  `constants/class-status.ts`, `constants/check-in-status.ts`, `utils/timeFormatting.ts` :55-235,
  `utils/redaction.ts`.
- `packages/notifications/src/`: `push.ts`, `suppression.ts`, `voice-text.ts`.
- `packages/scoring-ui/src/utils/parseSmartTime.ts`, `utils/timeUtils.ts`.

### Cross-checked in `apps/` to prove a package defect reaches a user (out of scope for findings)

`hooks/queries/useAKCSubmissionData.ts`, `features/registries/scentWork.ts` + `akc.ts`,
`types/class-template-types.ts`, `data/templates/akcScentWorkRules.ts`, `services/titleEngine.ts`,
`hooks/usePushSubscription.ts`, `components/notifications/RingAlertsSettings.tsx`,
`features/at-show/ringsideClassStatusMap.ts`, `services/replication/ReplicatedArmbandsTable.ts`,
`services/observability/sentry.ts`, `features/support/supportDiagnostics.ts`, `lib/timeUtils.ts`,
`lib/fieldUtils.ts`.

### Checked and found CLEAN — do not repeat

- **Watermark / incremental-sync boundary.** `parseUpdatedAtMs` NaN-guards; the max-observed-server
  watermark plus `REPLICATION_INCREMENTAL_BUFFER_MS` (60s / 5s high-churn) covers same-millisecond
  ties; `advanceWatermarkMonotonically` takes the max *inside* the IDB transaction; the
  `Number.isFinite` guard at `syncReplicatedTable.ts:200-206` catches a corrupt persisted watermark;
  per-scope routing never lets scope B advance scope A.
- **`removeStaleEntries` on an incremental sync.** Only `ReplicatedArmbandsTable.ts:150` sets
  `shouldCleanupStaleRows`, and that adapter always passes `forceFullSync: true` (`:152`), so a
  partial `serverIds` set can never delete live rows. Dirty rows protected
  (`ReplicatedTable.ts:994-999`, pinned by `ReplicatedTable.test.ts:1036`).
- **Mutation ordering transitivity.** The `-Infinity` sentinel keeps one key space; two missing
  sequence numbers compare equal and fall through to `timestamp`; no `NaN` reaches the comparator.
- **Retry / dead-letter classification.** Class-40 (`40001`, `40P01`) retryable; `RS429` containment
  not swallowed by `isVersionConflictError`; fail-open default intact; `isSupabaseError` rejects
  numeric-`code` DOMExceptions.
- **Evict LRU/LFU scoring.** `accessCount*0.7 + (lastAccessedAt/1000)*0.3` looks like a unit
  mismatch and is not — only differences matter (10 extra accesses ≈ 23s of recency). Not a finding.
- **`akcEntryOutcome.ts`** — the MYK9-323 vocabulary rewrite checks out against the CHECK
  constraints; `tallyAKCClass`'s withdrawn/absent exclusivity holds; `checkIn === 'pulled' → absent`
  outranking a recorded `qualified` matches `akcScentWorkCertificationPage.ts:145`, so deliberate.
- **Visibility / self-check-in cascades** — preset-then-field precedence, all-null full inherit and
  staff bypass all correct, covered by `publicResultsCascadeParity.test.ts`.
- **`normalizeClassStatus` vs the DB.** `classes_status_check` (migration 138) permits exactly
  `upcoming | setup | in_progress | completed | cancelled`; all five are in `LEGACY_STATUS_MAP`.
  No F3-style vocabulary gap here.
- **`classCompletionStorage.ts`** — prune-during-Map-iteration is safe, `Number(null)` → 0 is
  filtered by `> 0`, the O(1) test reset is correct.
- **`unsubscribeFromPush` / `lookupExistingSubscription`** — correctly bounded; the
  `unavailable` vs `none` distinction is honoured end-to-end by `usePushSubscription.ts`.

### Skimmed only

`packages/ui` (49 files — barrel and status-grammar entry points only), `packages/admin-mcp`,
`packages/email` (types-only; 481 of 496 lines are one type file), `packages/test-utils`,
`packages/scoring/src/stores/scoringStore.ts`, and `packages/scoring-ui`'s six scoresheet components
plus `useStopwatch.ts` / `useElementTimer.ts`.

### Skipped

`packages/supabase` (generated types). All `dist/` output. All `*.test.*` except where read to check
whether a behaviour was pinned.

## Process notes

- `pnpm qa:inflight` equivalent for this run: `gh pr list --state open` returned exactly one open PR
  (#2261, `supabase/migrations` + Stripe ledger FKs) — no overlap with `packages/*`.
- No Linear write failed. All four issues were created successfully.
- Worktree: `myk9-wt-bugaudit-pkgs`, branch `bug-audit-packages-20260915`, bootstrapped and removed
  at the end of the run.
