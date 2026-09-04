# Linear writes pending a reachable connector

> **Status:** Active — delete this file once every item below is applied.

Corrections and tracker actions that were **written but never filed**, because the Linear connector
was unreachable from the sessions that produced them. They live here so they are not lost on a
laptop, and so a false claim does not sit unchallenged in the tracker.

`plugin:linear:linear` shows as connected at the CLI (`claude mcp list`) but has not been enabled
for the recent working sessions — `ListPlugins` returns nothing for it and `ToolSearch "+linear"`
finds no tools, so no Linear tool is callable. Enabling the plugin (via `/mcp` in an interactive
terminal) is what unblocks all of this.

**Apply an item, then delete it from this file.** When the file is empty, delete the file and its
row in [`../README.md`](../README.md).

| # | Issue | Action | Blocked since |
| - | ----- | ------ | ------------- |
| 1 | MYK9-365 | Replace the final description section | 2026-09-04 |
| 2 | MYK9-372 | Add a new comment | 2026-09-04 |
| 3 | MYK9-289 | Decide: reopen, or file the harness defect separately | 2026-09-04 |
| 4 | (new) | Create parent `Bug audit components/ rest 2026-09-04 — P2/P3 findings` | 2026-09-04 |
| 5 | (new, sub of 4) | P2 — `/admin/sync` dashboard renders `Math.random()` mock data as live sync health | 2026-09-04 |
| 6 | (new, sub of 4) | P2 — Class-creation "Overrides" tabs pinned to Basic; Financial/Timing/Personnel/Rules unreachable | 2026-09-04 |
| 7 | (new, sub of 4) | P3 — Judge qualification "Certified" date one day early west of UTC | 2026-09-04 |
| 8 | (new) | P3 Improvement — dead code: `PerformanceGraphs` cluster orphaned by #1980 + six zero-importer modules | 2026-09-04 |

Items 1 and 2 are verbatim paste-ready. Item 3 is a judgement call that needs the issue read first.
Items 4–8 are new issues from the 2026-09-04 `components/` rest bug audit
([`bug-audit-components-rest-2026-09-04.md`](bug-audit-components-rest-2026-09-04.md)). They were
deduped against repo artefacts only — **run the three-axis `list_issues(includeArchived: true)`
search (file path, symptom, route) before creating each one**; if a match exists, comment there
instead. Team **MyK9-platform**, labels `Claude` + `Bug`/`Improvement`, priority P2 → 3 Medium,
P3 → 4 Low, baseline `caddbd636`.

---

## 1. MYK9-365 — REPLACE the final section of the description

Find the section titled **"Known residual, not covered here"** at the bottom of the
description and replace it entirely with:

```markdown
## Residual investigated and CLOSED — the chip does not misreport

An earlier version of this issue flagged that `ReplicationSyncProvider`'s
`lastSyncAt` is in-memory only (`useState(null)`, set only on a successful sync),
and that the at-show readiness chip keys "offline ready" off it — so it _should_
report not-ready on a cold offline boot even with data in IndexedDB.

**Measured, and it does not.** Cold offline boot on `/at-show/:showId` with a fully
primed device and IndexedDB deliberately left intact:

    DBG_PRIMED_ONLINE:        ready badge visible
    DBG_AFTER_OFFLINE_RELOAD: {notReadyVisible:false, readyVisible:true, mainTextLen:770}

The chip correctly reports **"offline ready"**. The code-level reasoning that
predicted otherwise (`triggerSync` returns early offline, so `lastSyncAt` stays
null, so `ready` is false) is wrong somewhere not yet traced — something sets that
state on the boot path.

A second inference collapses with it: I had reasoned that the committed test
_"the readiness badge tells the truth when the device is NOT primed"_ must be
vacuous, since it wipes IndexedDB and then asserts not-ready. That test passes in
CI **and** a primed device stays ready, so the chip genuinely distinguishes the two.
The test is sound. No issue to file.
```

---

## 2. MYK9-372 — ADD a new comment

The earlier closure comment's second "Risks / remaining work" bullet makes the same
false claim. Post this as a new comment (do not silently edit the old one — the
correction is the useful record):

```markdown
**Correction to the second "remaining work" bullet above: that residual is not real.**

I wrote that `lastSyncAt` being in-memory "means the chip likely reads not-ready on a
cold offline boot even with data in IndexedDB". Measured on 2026-09-04, it does not.
Cold offline boot on `/at-show/:showId`, primed device, IndexedDB intact:

    {notReadyVisible:false, readyVisible:true, mainTextLen:770}

The chip correctly reports "offline ready". My derivation — `triggerSync` returns
early when offline, so `lastSyncAt` stays null, so `ready` is false — looked airtight
and is wrong somewhere I did not trace.

The related inference that the committed test _"the readiness badge tells the truth
when the device is NOT primed"_ must therefore be vacuous is also wrong: it passes in
CI, and a primed device stays ready, so the chip does distinguish primed from wiped.

Nothing to fix. Recording it because the false version was stated as a probable defect
on a show-day surface, and an unverified claim left standing in the tracker is exactly
what MYK9-365's own description turned out to be.
```

---

---

## 3. MYK9-289 — decide whether to reopen

MYK9-289 is marked **Done** and its failure keeps recurring. The mechanism was root-caused on
2026-09-04 and is recorded in full as **NCR-2026-09-04-04** in [`findings.md`](findings.md); the
write-up is in
[`claude-daily-commit-review-2026-09-04.md`](claude-daily-commit-review-2026-09-04.md) § H-1.

**This one is a judgement call, not a paste.** Read MYK9-289's full description first — `get_issue`
by id, and `includeArchived: true` on any search — then decide:

- If MYK9-289 was always this harness defect, closed on a fix that addressed one role's symptom →
  **reopen it** and attach the root cause.
- If MYK9-289 was a genuine product never-settle that was correctly fixed → **file separately**.
  Filing a harness defect under it mislabels both.

Do not decide from the issue summary alone. The reason this is still open is precisely that the
description could not be read.

Root cause text to attach: the "Evidence" and "Notes" fields of NCR-2026-09-04-04 in
[`findings.md`](findings.md).

---

## 4. CREATE parent — `Bug audit components/ rest 2026-09-04 — P2/P3 findings`

Label `Claude`. Body:

```markdown
Grouping parent for the P2/P3 findings of the 2026-09-04 bug audit of `apps/myk9show/src/components/`
(non-show-ops scope), baseline `caddbd636`. Report:
`docs/qa/bug-audit-components-rest-2026-09-04.md`. Sub-issues carry the evidence; this parent
holds nothing else.
```

---

## 5. CREATE sub-issue of 4 — `/admin/sync` Sync Monitoring dashboard renders Math.random() mock data as live sync health

Labels `Claude`, `Bug`. Priority 3 (Medium). Body:

```markdown
**Severity:** P2 — a monitoring surface linked from the support-diagnostics checklist and
`/admin/health` shows fabricated numbers; an operator can export them as evidence during an incident.

**Baseline:** `caddbd636`. Source: `docs/qa/bug-audit-components-rest-2026-09-04.md` F1.

## Evidence

- `components/sync/SyncMonitoringDashboard/index.tsx:28` takes `SyncAnalyticsService.getInstance()`;
  `:57` calls `getMetrics(startTime, now)`.
- `services/analytics/SyncAnalyticsService.ts:545-551`:
  `loadPersistedData()` — "For now, generate some mock data for demo purposes" —
  `generateMockAnalyticsData()` pushed into `this.events` / `this.conflicts`.
- `services/analytics/sync-analytics-helpers.ts:244-257`: 100 events over the last 24h with
  `Math.random()` timestamps, durations, `status: Math.random() > 0.1 ? 'completed' : 'failed'`,
  random `bytesTransferred`.
- `getMetrics` (`SyncAnalyticsService.ts:202-284`) folds only those arrays — nothing from
  `@myk9/replication`; `compressionRatio = 0.7 // Mock`.
- `ConflictsTab.tsx:41` `Math.floor(metrics.totalConflicts * 0.2)` ("Manual Resolution") and `:48`
  `* 0.05` ("Pending") are invented ratios.
- `NetworkTab.tsx:82` divides by `metrics.totalSyncs` (0 when no random event lands in the `1h`
  window) → `NaN KB/sync`; `:116` hard-codes a 24h denominator for every `TimeRange`.
- Reachability: `routes/adminRoutes.tsx:194-201`, `routeRegistry.ts:33` (+ `high` prefetch tier
  `:174`), `pages/admin/supportDiagnosticActions.ts:134-136` ("Review sync monitoring"),
  `/admin/health` "Open Sync" link.
- No `// INTENT:` comment. `SyncMonitoringPage.tsx:7-9` promises "real-time metrics … for sync
  operations". The 09-02 remediation plan's "preserve `sync/SyncMonitoringDashboard/`" was a
  do-not-delete-as-dead instruction, not an acceptance of the data source.

## Failure scenario

Show-day sync incident → support checklist sends the operator to `/admin/sync` → health card shows
~90 "Healthy", "Total Syncs ≈ 100", non-zero conflict counts, changing every 5 s. None of it
reflects any device's pending-mutation store. Export (`index.tsx:80-108`) writes the fabricated
numbers to JSON.

## Expected

A monitoring page reads real replication state (pending-mutation count, last-sync watermark,
conflict log) or does not exist.

## Suggested fix

Consolidation-phase answer: delete the route, page, `components/sync/SyncMonitoringDashboard/*`,
the mock path in `SyncAnalyticsService`, and the two support-checklist links. Fallback: gate the
page behind `import.meta.env.DEV` with a visible "demo data" banner until a real event source exists.

## Acceptance criteria

- [ ] `/admin/sync` either renders values derived from `@myk9/replication` state, or the route,
      page and links are removed.
- [ ] `generateMockAnalyticsData` has no production caller.
- [ ] No `NaN` can render on the Network tab (test with `totalSyncs = 0`).
```

---

## 6. CREATE sub-issue of 4 — Class-creation "Overrides" tab strip is pinned to Basic; Financial/Timing/Personnel/Rules overrides are unreachable

Labels `Claude`, `Bug`. Priority 3 (Medium). Body:

```markdown
**Severity:** P2 — the secretary cannot set per-class fees, time limits, judges or search-area
rules through the class-creation wizard; every created class carries template defaults for those
fields. Recoverable per class afterwards through Class Edit, which is the brittle workaround.

**Baseline:** `caddbd636`. Source: `docs/qa/bug-audit-components-rest-2026-09-04.md` F2.

## Evidence

- `components/templates/secretary/FieldOverrideForm.tsx:362`:
  `<Tabs value={'basic'} onValueChange={() => {}}>`
- The file's only `useState` is `showAllFields` (`:50`); no active-tab state exists.
- `@/components/ui/tabs` → `packages/ui/src/components/Tabs/Tabs.tsx:19-33` forwards `value` to
  Base UI `TabsPrimitive.Root`, so the strip is controlled at `'basic'` and the no-op handler
  freezes it. `:363-388` render five `TabsTrigger`s; `:394-449` four `TabsContent`s that can never
  become active; `:87-92` compute an `other` group that is never rendered.
- Mounted from `pages/secretary/ClassCreationPage.tsx:405-416`, step 3 "Overrides" of
  `/shows/:showId/classes/:trialId/create` (entered from `ClassManagementPage.tsx:240`).
- `git log -S` → `35c3a1d4b` (original import); only a class-token refactor (#712) touched the
  line since. No `// INTENT:` comment. `docs/plan-template-authoring-removal.md` keeps class
  creation consuming templates, so this page stays live.

## Failure scenario

Secretary picks a template and classes, reaches "Overrides", clicks "Financial" to set entry fees /
`maxEntries` → nothing changes; Basic fields stay on screen. Same for Timing, Personnel, Rules.
Every field the `financial`/`timing`/`personnel`/`rules`/`other` groups classify (`:56-92`) is
unreachable; the "Override Summary" card only ever lists Basic fields.

## Expected

Clicking a tab shows that group's editable fields.

## Suggested fix

`const [activeTab, setActiveTab] = useState<TabKey>('basic')` and
`<Tabs value={activeTab} onValueChange={setActiveTab}>` (or `defaultValue="basic"` with no `value`).
Render `other` under an "Other" tab or fold it into Basic.

## Acceptance criteria

- [ ] A component test clicks "Financial" and asserts a fee input renders (and the mutation
      `value={'basic'}` fails it).
- [ ] Fields in the `other` group are reachable somewhere on the step.
```

---

## 7. CREATE sub-issue of 4 — Judge qualification "Certified" date renders one day early west of UTC

Labels `Claude`, `Bug`. Priority 4 (Low). Body:

```markdown
**Severity:** P3 — wrong displayed date, no data corruption; the write path is unaffected.
Same trap MYK9-352 fixed in `useClubDetailsState`; these two sites survived.

**Baseline:** `caddbd636`. Source: `docs/qa/bug-audit-components-rest-2026-09-04.md` F3.

## Evidence

- `components/users/UserDetails/JudgeQualificationsCard.tsx:118` and
  `components/panels/edit/QualificationsTab.tsx:57`:
  `{new Date(qual.date_obtained).toLocaleDateString()}`
- `judge_qualifications.date_obtained` is Postgres `DATE` (`049_judge_qualifications_table.sql:15`;
  re-declared `date` in `20260902170000`, `20260902180000`, `20260903150000`), returned as
  `'YYYY-MM-DD'`. `new Date('YYYY-MM-DD')` parses as UTC midnight; `toLocaleDateString()` renders
  in the viewer's zone.
- Surfaces: `/people/:id` (card mounted from `UserDetailsView.tsx:374`) and the Edit User panel's
  Qualifications tab (`UserEditPanel.tsx:231`).
- Write path safe: `JudgeQualificationPanel.tsx:57,73-75` round-trips the original
  `certificationDate` string before falling back to `toYYYYMMDD(dateObtained)`.

## Failure scenario

`date_obtained = '2024-05-01'` viewed from any US zone → "4/30/2024". Every certification date on
both surfaces is one day early for every US viewer.

## Expected

"5/1/2024".

## Suggested fix

Use the calendar-date formatter in `lib/format/dates.ts` (or `utils/date-format.toLocalDate`).
Same-sweep cosmetic sibling, not filed separately: `clubs/ClubDetails/utils.ts:15 getShowStatus`
does `new Date(show.startDate)` on `'YYYY-MM-DD'`, so the "Registration Open / Upcoming / This
Week" label crosses its boundaries a few hours early (bucketing itself was fixed by MYK9-352).

## Acceptance criteria

- [ ] Both sites render the stored calendar date regardless of viewer timezone (test with
      `TZ=America/Chicago`).
- [ ] `grep -rn "new Date(.*date_obtained" apps/myk9show/src/components` returns nothing.
```

---

## 8. CREATE — Dead code: `PerformanceGraphs` cluster orphaned by #1980 + six zero-importer modules (~2.3k lines)

Labels `Claude`, `Improvement`. Priority 4 (Low). Related: MYK9-353, MYK9-364. Body:

```markdown
**Severity:** P3 — unreachable code; ~2.3k lines passing typecheck/lint and inflating the
`oversizedSourceFiles` ratchet surface.

**Baseline:** `caddbd636`. Source: `docs/qa/bug-audit-components-rest-2026-09-04.md` F4.
Counts: `grep -rln "<symbol>" apps packages --include='*.ts' --include='*.tsx'`, excluding the
module's own file and test files.

| module / symbol | live importers | note |
| -- | -- | -- |
| `components/analytics/PerformanceGraphs.tsx` (351) + `.helpers.ts` (108) + `.types.ts` (49) | 0 | Orphaned by #1980 (`59e0668c8`), which deleted its last importer `EnhancedAnalyticsDashboard.tsx`. `dogs/DogDetails/Statistics/charts.tsx:26` names it only in a comment. `analytics/index.ts` re-exports it but `from '@/components/analytics'` has 0 importers. Delete `src/test/components/analytics/PerformanceGraphs.test.tsx` with it. |
| `components/analytics/PerformanceCharts.tsx` (452) | 0 | Only importer is `PerformanceGraphs.tsx:80`, itself dead. MYK9-353 recorded it as NOT-dead on 2026-09-03 — true on the 09-02 baseline, no longer. |
| `components/analytics/index.ts` barrel | 0 | every live consumer imports the file directly |
| `components/analytics/analytics-utils.ts` `findCleanSweepDogs` | 0 | already `@deprecated` (`:346`) |
| `components/common/TimerIntegration.tsx` (356) | 0 | only mention is a comment, `features/premium/pdf/bodies/classOrder.ts:38`; `DualTimerDisplay` stays live via `scoring/ScentWorkScoresheet.tsx` |
| `components/common/ResetDataButton.tsx` (103) | 0 | DEV-gated, never mounted; only mention is a comment, `utils/debugUtils.ts:2` |
| `components/common/AdvancedSearchSuggestions.tsx` (115) | 0 | sibling of `AdvancedSearch.tsx`, deleted by #2000 |
| `components/sync/SyncStatusIndicator.tsx` (219) | 0 live | `hooks/useGlobalSyncStatus.ts:2` imports only `type SyncStatus`; `entries/EntrySyncStatusBar.tsx:14` is a commented-out import; `sync/index.ts` has 0 importers; `src/test/components/sync/SyncStatusIndicator.test.tsx` is test-only. Move `SyncStatus` into the hook first (the 09-02 plan §7B step that never ran). |
| `components/sync/index.ts` barrel | 0 | — |
| `components/sync/ConflictResolutionDialog.tsx` (97) | 0 live | imported only by `components/conflict/{index.ts,ConflictNotifications.tsx}`, and `components/conflict` is imported nowhere outside itself. |

## Acceptance criteria

- [ ] Each row deleted (or its `note` refuted with a live importer) after a re-grep immediately
      before deletion.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet` green.
```

---

## Why these are queued rather than dropped

Four separate times across the 2026-09-04 sessions, reasoning from source reached a confident
conclusion that measurement then overturned — the paused-query premise (MYK9-347), "reconnect
recovers nothing" (MYK9-365), the typing cost on the 252-dog test (#2013), and the chip claim in
items 1 and 2 above. Three were caught before shipping. The fourth would have become a filed issue
that the next reader treats as authority — which is exactly how a wrong `UserManagementPage` comment
misled an earlier session that same day.

An unverified claim left standing in the tracker is the failure mode these corrections exist to
prevent. Discarding them because the connector happened to be unavailable would have preserved it.
