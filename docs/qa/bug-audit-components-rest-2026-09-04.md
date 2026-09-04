# Bug audit — `components/` rest — 2026-09-04

- **Week:** 36 (`date +%V`) → `IDX = 36 % 10 = 6` → scope 7 in the SKILL.md table, **`components/` rest**, model **Fable**.
- **Baseline:** `caddbd636` (== `origin/main` at run time).
- **Reviewer:** one Fable agent, `run_in_background: false`, read-only, no sub-agents. 289,499 subagent tokens, 41 tool calls, 14.8 min.
- **Scope:** `apps/myk9show/src/components/` excluding the show-ops directories (`shows`, `classes`, `entries`, `scoring`, `secretary`, `schedule`, `reports`, `trials`, `checkin`, `offline-checkin`, `stewards`, `judges`, `results`, `conflict`, `waitlist`, `volunteers`, `announcements`).

## Filed — after a Linear outage during the run

The Linear connector (`plugin:engineering:linear`) needed an OAuth grant the unattended run could
not perform, so the run itself filed nothing; the findings were queued in
`docs/qa/linear-pending-writes.md` (since applied and deleted). Richard authorized the connector
the same afternoon and every item was applied from this session, **after** the three-axis
`list_issues(includeArchived: true)` dedupe (file path, symptom, route — `admin/sync`,
`SyncAnalyticsService`, `FieldOverrideForm`, `date_obtained`, `toLocaleDateString`,
`PerformanceGraphs`, `TimerIntegration` all empty; fuzzy hits were the known dead-code sweeps and
MYK9-311, a different DATE surface). Filed:

| Issue | Sev | Title |
| -- | -- | -- |
| [MYK9-373](https://linear.app/myk9-platform/issue/MYK9-373) | — | Parent: `Bug audit components/ rest 2026-09-04 — P2/P3 findings` |
| [MYK9-375](https://linear.app/myk9-platform/issue/MYK9-375) | P2 | `/admin/sync` renders `Math.random()` mock data as live sync health |
| [MYK9-376](https://linear.app/myk9-platform/issue/MYK9-376) | P2 | Class-creation "Overrides" tab strip pinned to Basic |
| [MYK9-377](https://linear.app/myk9-platform/issue/MYK9-377) | P3 | Judge qualification "Certified" date one day early west of UTC |
| [MYK9-374](https://linear.app/myk9-platform/issue/MYK9-374) | P3 | Dead code: `PerformanceGraphs` cluster + six zero-importer modules |

The same session applied the three older queued items: MYK9-365's residual section replaced,
MYK9-372's correction comment posted, and **MYK9-289 reopened (Done → In Review)** with
NCR-2026-09-04-04's root cause attached and #2018 linked — it had been closed on a logging change
(#1934), never a fix.

The reviewer's known-list was built from repo artefacts, not `list_issues`; it was sufficient
(every do-not-report item the reviewer landed on was on it), but that is a limitation of this run.

## Third pass on one scope in one week — how the brief was cut

The rotation selected this scope for the third consecutive run (09-02 baseline `6006dffa2`, 09-03
baseline `f558bc675`). Per the ledger lesson from yesterday, the reviewer was NOT asked to re-sweep.
The brief had three parts: **(A)** regression-check every fix merged since yesterday's baseline (14
commits, 57 files in `components/`), re-reading the _symptom's_ code path rather than the AC —
yesterday a fix satisfied its AC literally while the symptom survived via an OR'd sibling;
**(B)** review the new code in those commits for ordinary defects; **(C)** read the directories the
two prior Coverage sections marked only "skimmed" or "skipped", ordered by risk.

## Part A — every overnight fix holds

| Fix                                                                 | PR           | Verdict   | Evidence (re-read by the orchestrator)                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MYK9-359 club profile gate was `MOCK_USERS` + phantom permission    | #2002, #2021 | **holds** | `clubs/ClubDetails/clubPermissions.ts:33-43` matches the club-scoped `CLUB_ADMIN` role in `userWithRoles.scopes`; `useClubDetailsState.ts:85-103` no longer gates on `databaseUserId`; no `hasPermission(...)` operand remains                                                                                                                                                                     |
| MYK9-361 Create User with a club-scoped role and no club            | #2003        | **holds** | `CreateUserDialog.tsx:60-66` filters `CLUB_SCOPED_ROLES` out of the picker; `:120-138` partitions granted/failed; `ensureCreatedUserRole.ts:5-22` re-queries the grant and throws if absent; the invitation carries `roleLabels: grantedRoles` only (`:157-163`)                                                                                                                                   |
| MYK9-347 (reopened yesterday) paused profile query → `/onboarding`  | #2001        | **holds** | `ExhibitorOnboardingChecker.tsx:81 if (!profileSettled) return;` precedes `:83 if (needsOnboarding \|\| !onboardingCompleted)` — both operands gated; `useExhibitorProfile.ts:261-262 profileSettled: status === 'success'`                                                                                                                                                                        |
| MYK9-362 "Verify for entry" no handler                              | #1999        | **holds** | control and `CheckCheck` import gone from `DogIdentityRail.tsx`                                                                                                                                                                                                                                                                                                                                    |
| MYK9-363 health cards `onEventClick={() => {}}`                     | #1998        | **holds** | `HealthRecordsSection.tsx:430-442` no longer passes it; `HealthTimelineEvent.tsx:63-68` applies `cursor-pointer`/`onClick` only when truthy                                                                                                                                                                                                                                                        |
| MYK9-364 dead-code deletion                                         | #2000        | **holds** | 18 files deleted; `tsc -p tsconfig.app.json` exit 0; no barrel re-exports a deleted module                                                                                                                                                                                                                                                                                                         |
| MYK9-165 route guard prompts on a panel's own close                 | #2010        | **holds** | real navigation while dirty still blocks (`UnsavedChangesRouteGuard.tsx:140-146`, self-nav counter `:33-35`); own close goes through `closeWithoutRouteGuard` (`:312-315`). Pre-existing, not a regression: Escape/backdrop/X are _inert_ while dirty (`SlideOverPanel.tsx:193,236` gate on `preventClose`; `EditPanelWrapper.tsx:563`), only footer Cancel prompts — dates to the original import |
| MYK9-88 Add/Edit dog control names                                  | #2008        | **holds** | `BasicInfoTab.tsx:79,146,206`; `DogEditPanel.sections.tsx:176,234`                                                                                                                                                                                                                                                                                                                                 |
| registry details readable                                           | #2007        | **holds** | style-only change in `DogRegistryTable.tsx:20-34`                                                                                                                                                                                                                                                                                                                                                  |
| Career calendar dates preserved                                     | #2005        | **holds** | `UpcomingShowsSection.tsx:236` → `formatEntryDate`, calendar-date safe (`lib/format/dates.ts:76-89`)                                                                                                                                                                                                                                                                                               |
| MYK9-348 follow-up: Clear Cache gate → `services/cacheClearGate.ts` | #2016        | **holds** | click-time count of `PENDING_MUTATIONS` + `syncQueue` (`DataSettings.tsx:52-61`), re-checked inside the exclusive Web Lock at confirm (`:96-106`); `localStorage.clear()` is gone — five named keys only (`:73-76`)                                                                                                                                                                                |

Part B (the new code in those commits) was clean. One nit not filed: `withCacheClearLock` returns
`null` when `navigator.locks` is absent and `DataSettings.tsx:107-108` then says "Another cache
clear is already in progress" — wrong message, no shipping browser lacks Web Locks.

## Findings

| Issue          | Sev | Title                                                                                                                    | Evidence                                                                                                                                                                                     |
| -------------- | --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MYK9-373       | —   | `Bug audit components/ rest 2026-09-04 — P2/P3 findings`                                                                 | —                                                                                                                                                                                            |
| MYK9-375       | P2  | `/admin/sync` Sync Monitoring dashboard renders `Math.random()` mock data as live sync health                            | `sync/SyncMonitoringDashboard/index.tsx:28,57`; `services/analytics/SyncAnalyticsService.ts:545-551`; `sync-analytics-helpers.ts:235-260`; `ConflictsTab.tsx:41,48`; `NetworkTab.tsx:82,116` |
| MYK9-376       | P2  | Class-creation "Overrides" step pins its tab strip to Basic — Financial/Timing/Personnel/Rules overrides are unreachable | `templates/secretary/FieldOverrideForm.tsx:362`                                                                                                                                              |
| MYK9-377       | P3  | Judge qualification "Certified" date renders one day early west of UTC (MYK9-352 pattern, two surviving sites)           | `users/UserDetails/JudgeQualificationsCard.tsx:118`; `panels/edit/QualificationsTab.tsx:57`                                                                                                  |
| MYK9-374       | P3  | Dead code: `PerformanceGraphs` cluster orphaned by #1980 + six more zero-importer modules (~2.3k lines)                  | per-symbol table below                                                                                                                                                                       |

### F1 — `/admin/sync` reports randomly generated mock metrics as live sync health (P2, Bug)

- **Files:** `apps/myk9show/src/components/sync/SyncMonitoringDashboard/index.tsx:28,57`;
  `.../ConflictsTab.tsx:41,48`; `.../NetworkTab.tsx:78-82,112-116`;
  `apps/myk9show/src/services/analytics/SyncAnalyticsService.ts:202-284,545-551`;
  `apps/myk9show/src/services/analytics/sync-analytics-helpers.ts:235-260`;
  `apps/myk9show/src/routes/adminRoutes.tsx:194-201`; `apps/myk9show/src/pages/admin/supportDiagnosticActions.ts:134-136`.
- **Role/workflow:** site admin at `/admin/sync` — routed, `adminGuard`, in `routeRegistry.ts:33`
  and its `high` prefetch tier (`:174`), and linked from the support-diagnostics checklist as
  "Review sync monitoring" (`supportDiagnosticActions.ts:136`) and from `/admin/health` ("Open Sync").
- **Evidence:** `index.tsx:28` takes `SyncAnalyticsService.getInstance()` and `:57` calls
  `getMetrics(startTime, now)`. `SyncAnalyticsService.ts:545-551`:

  ```ts
  private async loadPersistedData(): Promise<void> {
    // In real implementation, this would load from IndexedDB
    // For now, generate some mock data for demo purposes
    const mockData = generateMockAnalyticsData();
    this.events.push(...mockData.events);
  ```

  `sync-analytics-helpers.ts:244-257` builds 100 events over the last 24h with `Math.random()`
  timestamps, durations, `status: Math.random() > 0.1 ? 'completed' : 'failed'`, random
  `bytesTransferred`. `getMetrics` (`:202-284`) folds only these arrays — nothing from
  `@myk9/replication`; `compressionRatio = 0.7 // Mock`. `ConflictsTab.tsx:41`
  `Math.floor(metrics.totalConflicts * 0.2)` ("Manual Resolution") and `:48` `* 0.05` ("Pending")
  are invented ratios. `NetworkTab.tsx:82` divides by `metrics.totalSyncs`, which is 0 whenever no
  random event lands in the `1h` window → renders `NaN KB/sync`; `:116` hard-codes a 24h
  denominator for every `TimeRange`. No `// INTENT:` comment; the page doc-comment
  (`SyncMonitoringPage.tsx:7-9`) promises "real-time metrics … for sync operations".

- **Failure scenario:** a show-day sync incident (e.g. the ringside OCC 40001 storm) → the support
  checklist sends the operator to `/admin/sync` → the health card shows ~90 "Healthy" (10% failure
  rate baked in), "Total Syncs ≈ 100", non-zero conflict counts, all changing on every 5-second
  refresh — none of it reflects any device's `pendingMutations` store or any real sync. The Export
  button (`index.tsx:80-108`) writes the fabricated numbers to a JSON file that looks like evidence.
- **Expected:** a monitoring page reads real replication state (pending-mutation count, last sync
  watermark, conflict log) or does not exist.
- **Suggested fix:** consolidation-phase answer is to delete the route, page,
  `components/sync/SyncMonitoringDashboard/*` and the mock path in `SyncAnalyticsService`, and drop
  the two support-checklist links; the fallback is a `import.meta.env.DEV` gate with a visible
  "demo data" banner until the service has a real event source.
- **Not deliberate:** the 09-02 remediation plan (`docs/superpowers/plans/2026-09-02-components-rest-batched-remediation.md:18,130`)
  says "preserve `sync/SyncMonitoringDashboard/` and `/admin/sync`" — that was a
  do-not-delete-as-dead instruction because the page is routed; nothing there or in
  `TECHNICAL_DEBT.md` records the data source as acceptable.

### F2 — Class-creation "Overrides" tabs can never open (P2, Bug)

- **Files:** `apps/myk9show/src/components/templates/secretary/FieldOverrideForm.tsx:362`
  (`:363-388` five `TabsTrigger`s; `:394-449` four `TabsContent`s that can never become active;
  `:87-92` an `other` group computed and never rendered). Mounted from
  `apps/myk9show/src/pages/secretary/ClassCreationPage.tsx:405-416`.
- **Role/workflow:** secretary, `/shows/:showId/classes/:trialId/create` (entered from
  `ClassManagementPage.tsx:240`), step 3 of 4 "Overrides".
- **Evidence:** `<Tabs value={'basic'} onValueChange={() => {}}>`. The file's only `useState` is
  `showAllFields` (`:50`); there is no active-tab state. `@/components/ui/tabs` → `packages/ui`
  `Tabs.tsx:19-33` forwards `value` to Base UI `TabsPrimitive.Root`, so the strip is controlled at
  `'basic'` and the no-op handler freezes it. `git log -S` → `35c3a1d4b` (original app import);
  only a class-token refactor (#712) has touched the line since. No `// INTENT:` comment.
  `docs/plan-template-authoring-removal.md` removes the `/admin/templates` _authoring_ surface and
  explicitly keeps class creation consuming templates, so this page stays live.
- **Failure scenario:** secretary picks a template and classes, reaches "Overrides", clicks
  "Financial" to set entry fees / `maxEntries` → nothing changes; the Basic fields stay on screen.
  Same for Timing, Personnel, Rules. Every field the `financial`/`timing`/`personnel`/`rules`/`other`
  groups classify (`:56-92`) is unreachable, so created classes always carry template defaults for
  fees, time limits, judges and search-area rules, and the "Override Summary" card only ever lists
  Basic fields.
- **Expected:** clicking a tab shows that group's editable fields.
- **Suggested fix:** `const [activeTab, setActiveTab] = useState<TabKey>('basic')` and
  `<Tabs value={activeTab} onValueChange={setActiveTab}>` (or `defaultValue="basic"` with no
  `value`); render `other` under an "Other" tab or fold it into Basic. Pin with a test that clicks
  "Financial" and asserts a fee input renders.

### F3 — Judge qualification "Certified" date renders one day early west of UTC (P3, Bug)

- **Files:** `apps/myk9show/src/components/users/UserDetails/JudgeQualificationsCard.tsx:118`;
  `apps/myk9show/src/components/panels/edit/QualificationsTab.tsx:57`.
- **Role/workflow:** site admin / secretary viewing a judge on `/people/:id` (card mounted from
  `UserDetailsView.tsx:374`) and in the Edit User panel's Qualifications tab (`UserEditPanel.tsx:231`).
- **Evidence:** both do `{new Date(qual.date_obtained).toLocaleDateString()}`.
  `judge_qualifications.date_obtained` is a Postgres `DATE` (`049_judge_qualifications_table.sql:15`,
  re-declared `date` in `20260902170000`, `20260902180000`, `20260903150000`), returned as
  `'YYYY-MM-DD'`; `new Date('YYYY-MM-DD')` parses as UTC midnight and `toLocaleDateString()` renders
  it in the viewer's zone. Same trap MYK9-352 fixed in `useClubDetailsState`; these two sites
  survived. The write path is unaffected: `JudgeQualificationPanel.tsx:57,73-75` round-trips the
  original `certificationDate` string before falling back to `toYYYYMMDD(dateObtained)`.
- **Failure scenario:** `date_obtained = '2024-05-01'` viewed from any US zone → "4/30/2024".
  Every certification date on both surfaces is one day early for every US viewer.
- **Expected:** "5/1/2024".
- **Suggested fix:** use the calendar-date formatter (`lib/format/dates.ts`) or
  `utils/date-format.toLocalDate`; grep `components/` for `new Date(<DATE column>)` +
  `toLocaleDateString` and pin. Cosmetic sibling worth fixing in the same sweep, not filed
  separately: `clubs/ClubDetails/utils.ts:15 getShowStatus(date)` does `new Date(show.startDate)`
  on a `'YYYY-MM-DD'` string, so the "Registration Open / Upcoming / This Week" label crosses its
  30-day / 0-day boundary a few hours early; the past/upcoming bucketing itself was already moved to
  `showDateRangeStatus` by MYK9-352.

### F4 — Dead code, one issue for the run (P3, Improvement)

Counts are `grep -rln "<symbol>" apps packages --include='*.ts' --include='*.tsx'`, re-run by the
orchestrator, excluding the module's own file and test files.

| module / symbol                                                                  | live importers | note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `analytics/PerformanceGraphs.tsx` (351) + `.helpers.ts` (108) + `.types.ts` (49) | **0**          | Orphaned by #1980 (`59e0668c8`), which deleted its last importer `EnhancedAnalyticsDashboard.tsx` — the same remediation whose plan said "preserve `PerformanceCharts`". `dogs/DogDetails/Statistics/charts.tsx:26` names it only in a comment (true at `6006dffa2` too, so the 09-02 report's "live via `charts.tsx`" was never the reason it was live). `analytics/index.ts` re-exports it but `from '@/components/analytics'` has 0 importers. Test file `src/test/components/analytics/PerformanceGraphs.test.tsx` goes with it. |
| `analytics/PerformanceCharts.tsx` (452)                                          | **0**          | Only importer is `PerformanceGraphs.tsx:80`, itself dead. Recorded as NOT-dead in MYK9-353 on 2026-09-03; that was correct on the 09-02 baseline and is no longer.                                                                                                                                                                                                                                                                                                                                                                   |
| `analytics/index.ts` barrel                                                      | 0              | every live consumer imports the file directly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `analytics/analytics-utils.ts` `findCleanSweepDogs`                              | 0              | already `@deprecated` (`:346`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `common/TimerIntegration.tsx` (356)                                              | **0**          | only mention is a comment, `features/premium/pdf/bodies/classOrder.ts:38`; `DualTimerDisplay` stays live via `scoring/ScentWorkScoresheet.tsx`                                                                                                                                                                                                                                                                                                                                                                                       |
| `common/ResetDataButton.tsx` (103)                                               | **0**          | DEV-gated but never mounted; only mention is a comment, `utils/debugUtils.ts:2`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `common/AdvancedSearchSuggestions.tsx` (115)                                     | **0**          | sibling of `AdvancedSearch.tsx`, which #2000 deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sync/SyncStatusIndicator.tsx` (219)                                             | 0 live         | `hooks/useGlobalSyncStatus.ts:2` imports only `type SyncStatus`; `entries/EntrySyncStatusBar.tsx:14` is a commented-out import; `sync/index.ts` barrel has 0 importers; `src/test/components/sync/SyncStatusIndicator.test.tsx` is test-only. The 09-02 plan §7B said "move or inline the `SyncStatus` type before deleting" — the move never happened.                                                                                                                                                                              |
| `sync/index.ts` barrel                                                           | 0              | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `sync/ConflictResolutionDialog.tsx` (97)                                         | 0 live         | imported only by `components/conflict/{index.ts,ConflictNotifications.tsx}`, and `components/conflict` is imported nowhere outside itself (show-ops scope; flagged here as the in-scope half)                                                                                                                                                                                                                                                                                                                                        |

~2.3k lines. Suggested fix: one deletion PR; re-grep each basename immediately before deleting.

## Dropped on verification

Nothing. All four reviewer findings survived the orchestrator's source re-read; no severity changed.

## Already known — found again, filed nothing

MYK9-371 open half (25 formerly-phantom permission codes — `20260904190000` now seeds the rows and
grants none; the sidebar config uses ROLE gates only, so no additional site in `layout/`), MYK9-99
(`SlideOverPanel.size`), MYK9-352 (sibling folded into F3), MYK9-165/88/347/359/361/362/363/364/348
(Part A). MYK9-365/372: not re-derived — measured on 2026-09-04 as not a defect.

## Coverage

**Read closely — Part A/B:** `clubs/ClubDetails/{clubPermissions,useClubDetailsState}`,
`context/authContextHelpers`, `auth/PermissionGuard`, `clubs/members/MemberList`,
`admin/users/{CreateUserDialog,CreateUserDialog.schema,ensureCreatedUserRole}`,
`services/rbac/{roleUiConstants,RoleManager.ensureUserHasRole}`, `exhibitor/ExhibitorOnboardingChecker`,
`hooks/useExhibitorProfile`, `dogs/DogDetailsMain/DogIdentityRail`,
`dogs/DogDetails/HealthRecords/{HealthRecordsSection,HealthTimeline,HealthTimelineEvent}`,
`navigation/UnsavedChangesRouteGuard`, `panels/SlideOverPanel`, `panels/edit/{EditPanelWrapper,useEditPanel}`,
`panels/edit/AddDogPanel/{BasicInfoTab,index}`, `panels/edit/DogEditPanel.sections`,
`dogs/common/DogRegistryTable`, `dogs/DogDetails/Competitions/UpcomingShows/UpcomingShowsSection`,
`lib/format/dates`, `preferences/{DataSettings,clearCacheGuard}`, `services/cacheClearGate`,
migration `20260904190000`, `test/database/permissionsVocabularyContract.test.ts`.

**Read closely — Part C:** `sync/*` (all 16, data path traced to the mock generator),
`common/{NetworkStatusProvider,ResetDataButton,LazyComponents,TimerIntegration,ListPagination,AdvancedSearchSuggestions}`,
`templates/secretary/FieldOverrideForm` + its mount and entry link, `analytics/analytics-utils.ts`,
`layout/{appShortcuts,sidebar/unifiedSidebarConfig,sidebar/useActivePath}`,
`dogs/DogDetails/Pedigree/{PedigreeCard,PedigreeTree}`, `dogs/DogDetails/Registrations/RegistrationsSection`
(`formatRegistrationDate`), `users/UserDetails/JudgeQualificationsCard`,
`panels/edit/{QualificationsTab,JudgeQualificationPanel}`, `clubs/ClubDetails/utils.ts`.

**Skimmed** (handlers, writes, liveness): `dogs/{DogStatusDialog,AddEditRegistrationDialog,browse/DogsBulkActionsBar}`,
`askq/AskQExampleQueries`, `exhibitor/{FirstRunZeroState,LiveResults,MultiDogSchedule,TitleProgressCard,CheckInStatusMenu}`,
`layout/{record/*,AppToaster,SignOutWarningDialog,AccountMenu,RoleSidebar,SidebarLayout}`,
`notifications/{NotificationBell,ToastContainer}`, `landing/v2/*`, `panels/index.ts`,
`common/{CalendarSkeleton,PhotoDialog,DatePickerField,BrowseCard,PageTransition,KeyboardShortcutsOverlay,EntitySidebar,DetailHero,ListControls,PremiumCard,PremiumButton,IconContainer,EmptyState,RecentSearches,SkeletonLoaders*}`
(importer counts ≥ 1; bodies not opened).

**Skipped (budget):** `dogs/DogDetails/{TrainingJournal,TitleTracking,Statistics}` bodies (no
`useMutation` there; writes go through hooks), `clubs/ClubDetails/{MembersTab,UpcomingShowsTab,PastShowsTab,AboutTab,BrandingTab,ClubDialogs}`
and `clubs/browse/*` bodies, `users/browse/*` bodies,
`templates/secretary/{SimpleClassSelector,ClassSelectionGrid,ClassBatchActions,OrganizationSelector}`
bodies (all four mounted; `onChange={() => {}}` on `ClassSelectionGrid:303,366` is a checkbox whose
click the parent row handles — not a dead control), `layout/{AppHeader,SidebarLayout,RoleSidebar}` bodies.

**Checked and found clean (do not repeat next rotation):**

- All 11 Part A fixes hold; none introduced a new defect.
- `20260904190000` seeds all 25 formerly-phantom `permissions` rows and grants none; `unifiedSidebarConfig` has no `PERMISSIONS.*` gate, so `layout/` contributes no additional MYK9-371 site.
- `appShortcuts` (9 targets, `/?wizard=true` is read by `routerComponents.tsx:27`), `unifiedSidebarConfig` (20 hrefs) and `/admin/sync` all resolve.
- `analytics-utils.ts`: every division guarded, empty sets → null/0, no NaN/Infinity path.
- `ListPagination` clamping; `useActivePath` query-aware matching; `NetworkStatusProvider` → `useOnlineStatus` (`navigator.onLine` + events), mounted in `App.tsx`.
- `ensureCreatedUserRole` PostgREST filter shape (`roles!inner` embed + `expires_at` OR); `RoleManager.ensureUserHasRole` unscoped path.
- `RegistrationsSection.formatRegistrationDate` and `formatEntryDate` are calendar-date safe.
- `LazyComponents`' three lazy targets exist (typecheck).

## Process notes

- **In-flight PRs checked by file** at dispatch and again before writing this report: the only
  open PR touching `components/` was #2011 (`clubs/ClubDetails/*`, `auth/PermissionGuard.tsx`,
  MYK9-371) — it was on the reviewer's do-not-report list and touches no file cited above. No open
  PR touches `components/sync`, `components/analytics`, `templates/secretary`,
  `users/UserDetails`, `panels/edit/QualificationsTab.tsx`, or the `common/` modules in F4.
- **Linear:** see the first section — filed later the same day once the connector was
  authorized; nothing remains unfiled.
- Labels/priority convention used: the workspace has no
  `p0`/`p1`/`source:*`/`audit:*` labels — use `Claude` + `Bug`/`Improvement`, priority field
  P2 → 3 Medium, P3 → 4 Low, P-level stated in the body.
- Budget rules held: one reviewer, Fable as the table names, no sub-agents, findings written
  incrementally, one scope.
