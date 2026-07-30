# myK9Q sync & offline fixes — handoff to myK9Show

**Source:** myK9Q v3 (`D:\AI-Projects\myK9Qv3`), 22 commits between 2026-07-26 and 2026-07-30, all now on `main`.
**Purpose:** these fixes address defects that are architectural, not cosmetic. myK9Show shares the replication approach, so most of them are worth checking there.

Every defect below shares one property: **it fails silently.** No error, no crash — just wrong or missing data. That is why they survived so long in myK9Q, and why they are worth auditing rather than waiting for a bug report.

---

## How to read this

Each item has a **myK9Show status**, which is one of:

| Status | Meaning |
|---|---|
| **CONFIRMED PRESENT** | I found the same defect in the platform repo |
| **LIKELY** | The pattern is there; needs a decision on whether it applies |
| **NOT APPLICABLE** | Checked, myK9Show already handles it (or is already better) |
| **UNVERIFIED** | I did not check deeply enough to say |

I inspected the platform repo read-only and changed nothing.

---

## P1 — Silent data loss

### 1.1 A failed upload put a queued score into a state nothing could see

**Symptom reported:** "Scores entered while offline don't come in after reconnecting." Reported as an Android bug. It was not — an iPhone on cellular never went offline, so it never used the queue at all. Any device that truly loses network hits this.

**Root cause:** on upload failure the score was set to `status: 'failed'` and left in the queue. Every consumer selected on `status === 'pending'`, and the manual "retry failed" path only drained a separate `failedItems` array the score never reached. One transient failure stranded it permanently.

The trigger is routine: Chrome fires the `online` event when the network interface comes up, *before* DNS/TLS is usable, so the first upload attempt after reconnect commonly throws.

**Fix:** treat `failed` with attempts remaining as eligible for retry; give one component sole ownership of the sync mutex; stop double-counting retries; don't burn retry attempts while offline.

**myK9Q:** `src/stores/offlineQueueStore.ts`, `src/hooks/useOfflineQueueProcessor.ts` (commits `9c1f9c2`, `dbb9463`)

**myK9Show status: UNVERIFIED.** myK9Show has a different offline system (`apps/myk9show/src/services/offline-checkin/OfflineCheckInService.ts`) with its own `retryCount`. The specific bug may not map, but **the shape is what to audit**: is there any status value that a record can enter which no consumer's selector matches? That is the whole defect, and it is easy to reintroduce.

---

### 1.2 Writes reported success against rows that no longer exist

**Root cause:** `supabase.from('entries').update(...).eq('id', id)` throws only on `error`. **Postgres does not treat a zero-row UPDATE as an error.** A write against an id that no longer exists returns `{ data: [], error: null }` — indistinguishable from success unless you check the row count.

Realistic trigger: a "delete trial + re-upload" import reassigns primary keys while a device holds queued work. The score uploads against a dead id, reports success, and vanishes. Worse, if ids are *reassigned* rather than deleted, it can land on the wrong dog.

**Fix:** require `.select()` on the update and throw when it matches nothing. Extracted to one helper so the rule lives in one place.

**myK9Q:** `src/services/entry/updateGuards.ts`, applied at 6 write sites in `scoreSubmission.ts` and `entryStatusManagement.ts` (commits `7f61478`, `6f2b2bf`)

**myK9Show status: LIKELY.** I found no row-count checks on scoring writes in `packages/scoring/src`. Worth grepping for `.update(` followed by `.eq('id'` and confirming each either checks the count or genuinely doesn't need to.

> One site (`resetEntryScore`) had no `.select()` at all, so its row count wasn't merely unchecked — it was unavailable. Check for that variant too.

---

### 1.3 Un-paginated reads truncate silently at the row cap

**Symptom:** on 2026-06-14, a 1,354-entry / 197-dog show showed **183 dogs** on phones. 14 dogs missing entirely.

**Root cause:** a single un-paginated query hit Supabase's "Max Rows" cap (then 1,000). PostgREST truncates **silently** — no error, just short data.

**Why whole dogs vanished rather than scattered entries:** the cap truncates an *ordered* result, so it removes the tail. Dogs entered only on the last day had all their entries in that tail. This is why the symptom was "my dog isn't in the app" rather than "a class looks short" — worth knowing, because it shapes what a diagnostic should report.

**Fix:** paginate every read that can exceed the cap; add a guard test that fails CI on new un-paginated reads of high-volume tables.

**myK9Q:** `src/lib/supabasePagination.ts`, guard at `src/lib/__tests__/entriesPagination.guard.test.ts` (commits `49f5c49`, `773235a`, `f7d5103`)

**myK9Show status: PARTIALLY NOT APPLICABLE — and myK9Show is ahead here.**
`apps/myk9show/src/services/replication/ReplicatedDogsTable.ts` already uses **keyset pagination** (`id > lastId` ordered by `id`, with `.limit()`), which is strictly better than our offset approach — see §1.4. Do **not** port our `.range()` implementation over it.

What *is* worth porting is the **guard test**: a mechanical check that no new read of a high-volume table ships unbounded. In myK9Q that guard found two defects my manual audit had missed, including one already in production.

---

### 1.4 Pagination over a non-unique sort silently drops rows

**This is the one to read even if you skip the rest.** It is a bug *created by* fixing §1.3 naively.

`.range()` paging is only correct over a **stable** sort. Postgres gives no tie-break guarantee, so if the ORDER BY column is not unique, rows on a page boundary can be returned twice **or skipped entirely**.

Nearly every natural sort key here is non-unique: `armband_number` repeats across classes, `exhibitor_order` and `final_placement` repeat freely, and `updated_at` is *identical across every row of a bulk import* — the exact situation during a re-upload.

**Measured in myK9Q:** paginating a 2,300-row fetch ordered only by `updated_at` silently lost **4 rows**. Adding `.order('id')` as a tie-break fixed it. Every one of the 9 call sites we paginated had this flaw.

**Fix:** always append a unique tie-break (`.order('id')`) to any paginated query. The guard test enforces it.

**myK9Show status: NOT APPLICABLE for `ReplicatedDogsTable`** — keyset pagination on a unique `id` is inherently stable and immune to this. **But check any other paginated read**: `.range()` appears in at least `usePlatformPayoutLedger.ts`, `activityLogService.ts`, `activity-logs/reads.ts`, and `AuditLogger.ts`. Each needs a unique tie-break or a keyset rewrite.

---

### 1.5 Stale-row pruning was not scoped by tenant

**Root cause:** `removeStaleEntries(serverIds)` iterates **every cached row for a table** and deletes anything absent from `serverIds`. But `serverIds` only covers the show/scope just synced. On a device holding cache from more than one scope, syncing scope A deletes scope B's rows entirely.

**Fix:** add an optional scope key; skip rows belonging to another scope. Also gate the prune so it **only runs after a complete fetch** — running it after an incremental sync would delete every row that merely didn't change.

**myK9Q:** `ReplicatedTable.removeStaleEntries(serverIds, licenseKey?)` (commits `c8c04a2`, `8822d71`)

**myK9Show status: CONFIRMED PRESENT (assess applicability).**
`packages/replication/src/core/ReplicatedTable.ts:950` — `removeStaleEntries(serverIds)`, no scope parameter. Called from `packages/replication/src/syncReplicatedTable.ts:330` and `ReplicatedDogsTable.ts:252`.

**The question to answer:** can one myK9Show device hold cached rows from more than one scope (show, club, org) for the same table? If yes, this is a live data-loss bug. If the cache is always single-scope and cleared on switch, it is latent — still worth the parameter, since that invariant is easy to break later.

Also confirm the prune only runs after a **full** fetch, never an incremental one.

---

## P2 — Recovery

### 2.1 A device that synced past a change could never recover it

**Root cause:** incremental sync asks for `updated_at > lastSync`. Once the local clock advances past a server-side change, that change is unreachable forever. The only recovery was a destructive "clear all data", which is unsafe with unsynced work pending.

**Fix:** `forceFullSync` — ignore the clock, re-fetch everything, upsert. Non-destructive: no database wipe, so queued offline work survives.

**myK9Q:** `ReplicatedEntriesTable.sync(licenseKey, { forceFullSync })`, `repairAllTables()` in `src/services/replication/initReplication.ts` (commit `c8c04a2`)

**myK9Show status: UNVERIFIED.** Check whether an equivalent self-heal exists that does not require wiping the cache.

---

### 2.2 Two "full sync" paths that behaved differently

**Worth flagging because it cost real debugging time.** myK9Q had:

- `syncAll()` → each table's own `sync()`, with correct join-based filtering
- `refreshAll()` → a generic executor that filtered **every** table by a `license_key` column

Tables reaching their tenant key via joins (`classes → trials → shows`) had no such column, so the generic path **could never refresh them** — and never had. It surfaced as "could not refresh classes, trials" on a perfectly healthy show.

**Fix:** one path. Repair now calls `syncAll({ forceFullSync: true })`; the per-table `sync()` implementations already filter correctly.

**myK9Show status: LIKELY worth checking.** `packages/replication/src/syncReplicatedTable.ts` is a generic sync path. If any table reaches its tenant key indirectly, confirm the generic path handles it rather than assuming a flat column.

---

### 2.3 Guards must count every store that holds unsynced work

myK9Q kept unsynced work in **two** IndexedDB stores (`OFFLINE_QUEUE` for scores, `PENDING_MUTATIONS` for table mutations) after an unfinished consolidation. Guards checked one or the other, never both — and the destructive "refresh all data" path, which deletes the database, checked only the score queue. A steward holding queued check-ins but no scores could wipe them.

**Fix:** one `countUnsyncedWork()` reading both. A store that can't be read counts as *unknown*, not empty.

**myK9Q:** `src/services/replication/unsyncedWork.ts` (commit `c8c04a2`)

**myK9Show status: UNVERIFIED.** If myK9Show has more than one queue store, audit every destructive path for the same asymmetry.

---

## P3 — Diagnostics and UX

### 3.1 Data Health panel

Compares server truth against the device's cache, **per class, led by dog count**. Reports two distinct problems with different remedies:

- device has fewer rows than the server → run Repair
- server has no rows at all → the **import** is incomplete, re-import

Conflating those sends a secretary chasing the wrong fix. Re-downloading cannot conjure rows the server doesn't have.

**myK9Q:** `src/pages/ShowDetails/components/DataHealthPanel.tsx`, `hooks/useDataHealth.ts` (commit `3a41a88`)

**Worth porting on the merits** — it is the only thing that would have caught the June incident before exhibitors did. Its own server read is paginated, since an unbounded one would under-report in exactly the situation it exists to detect.

### 3.2 Recovery is a separate, explicit action

"Sync Now" stays incremental and cheap. **"Repair data"** is a distinct button that re-downloads everything. Both are labelled in-app, because the distinction is invisible otherwise — and reaching for the sync icon when a dog is missing *cannot* help, since the device is already synced past the change.

Repair reports what it changed: *"recovered 14 entries"* or *"nothing was missing on this device."* The second is the more useful: if a dog is still absent, the device isn't the problem.

**myK9Q:** `src/hooks/useForceResync.ts`, `src/components/ui/MissingDataPrompt.tsx` (commits `e213d29`, `75d1a5d`, `ff178c9`)

### 3.3 Theme class not applied when entering via the login page

The blocking theme script returned early on `/` and `/login` after applying a landing theme, never applying the user's saved theme class. Since the app then navigates client-side for the rest of the session, `<html>` carried **no theme class at all** — and stylesheets that are dark-by-default rendered dark on a light page until the user happened to refresh.

**Fix:** apply the theme class on those pages too, and re-apply on mount as a safety net.

**myK9Q:** `public/theme-init.js`, `initializeSettings()` in `src/stores/settingsStore.ts` (commit `50d9aba`)

**myK9Show status: UNVERIFIED.** `apps/myk9show/public/theme-init.js` exists but is structured differently (it defers to a canonical `src/context/themeClasses.ts`). Check whether any entry path can leave `<html>` without a theme class for a whole session — the symptom is "looks wrong until I refresh."

### 3.4 Vercel cache headers naming files that don't exist

`vercel.json` set `must-revalidate` on `/sw.js`, but the build emits `sw-custom.js`. Same for `/manifest.json` vs the `/manifest.webmanifest` the HTML links. Both rules matched nothing, probably for a long time — **a header rule pointing at a non-existent path looks perfectly healthy.**

**Fix + guard:** point them at the real filenames, and a test tying `vercel.json` to the filename in `vite.config.ts`.

**myK9Q:** `vercel.json`, `src/lib/__tests__/vercelHeaders.guard.test.ts` (commit `9f371ec`)

**myK9Show status: worth a 2-minute check** of its own `vercel.json` against its actual build output.

---

## The four generalizable rules

Independent of which fixes you port:

1. **A row cap truncates silently.** Any read that can exceed it must paginate. Prefer **keyset** pagination — myK9Show's `ReplicatedDogsTable` already does this and is immune to §1.4 by construction.
2. **Paginate only over a unique sort.** Otherwise rows on page boundaries vanish. This bug is invisible until someone counts.
3. **A zero-row UPDATE is not an error in Postgres.** Check the row count or you will report success for writes that did nothing.
4. **Never let a record enter a state no selector matches.** That single mistake is what stranded judges' scores.

## Suggested order

1. §1.2 zero-row write guards — smallest change, prevents silent loss of scored data
2. §1.5 stale-prune scoping — answer the multi-scope question first; if yes, it's urgent
3. §1.4 tie-breaks on the four non-keyset `.range()` call sites
4. §1.3 guard test — mechanical, and it found two real bugs in myK9Q
5. §1.1 audit the offline queue for unreachable states
6. P2 / P3 as product priorities allow

## Caveats

- Statuses above come from reading the platform repo, not running it. Treat **CONFIRMED PRESENT** as "the code shape is there", and verify before changing anything.
- myK9Q's offline scoring reconnect fix (§1.1) shipped to production on 2026-07-30 but has **not** yet been verified on a real device that actually lost network. Watch myK9Q's outcome before assuming the approach is proven.
- Where myK9Show is already better (keyset pagination), port the *guard*, not the implementation.
