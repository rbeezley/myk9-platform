# Bug audit — `components/` rest — 2026-09-02

- **Week:** 36 (`date +%V`) → `IDX = 36 % 10 = 6` → scope 7 in the SKILL.md table, **`components/` rest**, model **Fable**.
- **Baseline:** `6006dffa2` (== `origin/main` at run time).
- **Worktree:** `/private/tmp/myk9-bug-audit-components-rest`, cut from `origin/main`, bootstrapped.
- **Reviewer:** one Fable agent, `run_in_background: false`, read-only, no sub-agents. 427,732 subagent tokens, 74 tool calls, 25 min.
- **Scope:** `apps/myk9show/src/components/` excluding the show-ops directories (`shows`, `classes`, `entries`, `scoring`, `secretary`, `schedule`, `reports`, `trials`, `checkin`, `offline-checkin`, `stewards`, `judges`, `results`, `conflict`, `waitlist`, `volunteers`, `announcements`) — those belong to scope 6.

Every finding below was re-read against source by the orchestrator before filing. Two of the
reviewer's claims were checked empirically against the installed dependencies (zod 4.5.4's strip
behaviour, `@tanstack/query-core@5.102.8`'s `isLoading` derivation) rather than taken on trust.

## Filed

| Issue | Sev | Title | Evidence |
| -- | -- | -- | -- |
| [MYK9-346](https://linear.app/myk9-platform/issue/MYK9-346) | P1 | Show Edit → Fees tab: schema/form drift — "Nationals event" never saves, Max Entries bricks Save | `components/panels/edit/ShowEditFeesTab.tsx:126,138,157-171`; `lib/validation.ts:149-193`; `hooks/useFormValidation.ts:119-152`; `components/panels/edit/EditPanelWrapper.tsx:461-464` |
| [MYK9-347](https://linear.app/myk9-platform/issue/MYK9-347) | P1 | Cold offline boot redirects every onboarded exhibitor to `/onboarding` | `components/exhibitor/ExhibitorOnboardingChecker.tsx:51-71`; `hooks/useExhibitorProfile.ts:90-119,255`; `lib/queryClient.ts:67`; `App.tsx:221` |
| [MYK9-348](https://linear.app/myk9-platform/issue/MYK9-348) | P1 | "Clear Cache" deletes the replication outbox and unsynced scores | `components/preferences/DataSettings.tsx:14-58,74-78`; `packages/replication/src/constants.ts:11`; `store/offlineScoringStore.ts:262` |
| [MYK9-349](https://linear.app/myk9-platform/issue/MYK9-349) | — | Parent: P2/P3 findings | — |
| [MYK9-350](https://linear.app/myk9-platform/issue/MYK9-350) | P2 | Edit User → Role Management is the third role-write surface MYK9-152 did not reach | `components/panels/edit/personRolesService.ts:8-25,55-63,73-93`; `BasicInfoTab.tsx:24-44,202-224`; migration `102:79-97` |
| [MYK9-351](https://linear.app/myk9-platform/issue/MYK9-351) | P2 | Judge qualifications save is delete-all-then-insert with no transaction | `components/panels/edit/JudgeQualificationPanel.tsx:232-258`; `services/database/judges/reads.ts:86-98,191-197` |
| [MYK9-352](https://linear.app/myk9-platform/issue/MYK9-352) | P3 | Club profile files a show as "past" from ~7pm local the evening before its last day | `components/clubs/ClubDetails/useClubDetailsState.ts:134,151-155` |
| [MYK9-353](https://linear.app/myk9-platform/issue/MYK9-353) | P3 | Dead-code sweep, components (non-show-ops): ~26k lines | see the issue's per-symbol table |

### The three that matter most

**MYK9-346 — schema/form drift on the Show Edit Fees tab.** `EditPanelWrapper`'s schema path hands
`schema.safeParse(data).data` to `onSave`, and `showSchemas.edit` has no `isNationals` key, so zod
strips the checkbox's value before the write. Confirmed empirically:

```
$ node -e "const {z}=require('zod'); console.log(JSON.stringify(
    z.object({a:z.string()}).safeParse({a:'x', isNationals:true})))"
{"success":true,"data":{"a":"x"}}
```

`ShowEditPanel.helpers.ts:90` then emits `isNationals: undefined` and `showStore.ts:409/456` skip
it. PR #760 touched every file in the feature except `lib/validation.ts`, and its test calls
`formDataToShow` directly, so it never crosses the schema. The second half of the same drift:
`handleInputChange` stores `e.target.value` (a string) into two `z.number()` fields, `safeParse`
fails, and the three things that would surface it are all absent — no `error` prop on either
`FormField`, no `onValidationFail`, and `EditPanelWrapper.tsx:461-464` deliberately drops `!isValid`
from the Save button's `disabled` expression on the schema path.

**MYK9-347 — paused query read as absence.** `needsOnboarding = !isLoading && user && !profile`.
With `networkMode: 'online'` (the client default) and no query persister anywhere in the app, a cold
offline boot parks the profile query at `fetchStatus: 'paused'`. `isLoading` is
`isPending && isFetching` (verified in `@tanstack/query-core@5.102.8`,
`build/modern/queryObserver.js:240`), and a paused query is not fetching — so `isLoading` is `false`,
`profile` is `undefined`, and the checker redirects. It wraps the whole tree at `App.tsx:221` and
re-fires on every route change, so the exhibitor is parked on `/onboarding` for the duration of the
outage. Staff roles are exempt, which is why nobody has hit it in testing.

**MYK9-348 — Clear Cache destroys the outbox.** `localStorage.clear()` plus a loop over
`indexedDB.databases()` deleting every one, with a confirm that says "cached data … settings and
login preserved." `myK9_Replication` holds `PENDING_MUTATIONS`, the offline write outbox; the
localStorage sweep takes `myk9show-offline-scoring-storage`'s `syncQueue` and the cart hold with it.
MYK9-202 built exactly this kind of guard for sign-out; Clear Cache is the sibling control on the
same account surface and is strictly more destructive.

## Dropped on verification

- **`analytics/PerformanceCharts.tsx` claimed dead.** It is not: `PerformanceGraphs.tsx:80` imports
  it, and `PerformanceGraphs` is live through
  `dogs/DogDetails/Statistics/charts.tsx` → `PerformanceStatisticsSection` → `DogDetailsMain/CareerSection`.
  Removed from the dead-code table and recorded there as explicitly NOT dead, so the next sweep does
  not re-add it.
- The reviewer's initial out-of-directory grep counts for the panel-stack symbols were inflated by a
  path-prefix filter that did not match ugrep's output format (it printed `components/panels/...`,
  not `./components/panels/...`). Re-run correctly, the counts are zero — the conclusion held, the
  arithmetic did not. Same correction applied to `common/LazyComponents.tsx`, which is *partly* live
  (`VenuePinMap`, `ShowCalendar`, `ShowsMapView`), not wholly dead.
- **Three P3s the reviewer explicitly declined to file**, and I agree: `DeletedEntitySection` showing
  a failed list fetch as "No deleted X found" (the count badge still shows the true number);
  `LogManualResultPanel`'s module-level `today` computed in UTC (affects a default, not a saved
  value); `element` optional in that panel's schema while the UI marks it required. Recorded here so
  the next reviewer does not spend budget re-deriving them.

## Already known — found again, filed nothing

Per the task's reconciliation rule, these were encountered and left alone. None had new evidence
worth a comment.

- MYK9-99 (`SlideOverPanel` inert `size`) — deliberate, closed.
- MYK9-297 (FeatureGate `onUpgrade`) and MYK9-298 (14 dead files + `CartSummary` `/checkout`
  fallback) — both **verified fixed** in this tree. `components/live/`, `rbac/RBACMigrationStatus`,
  `rbac/RBACUtilityComponents`, `security/SecurityProvider`, `scoring/JudgeClassInterface`,
  `exhibitor/RingMonitor`, `judges/JudgeScoringInterface` are gone; `CartSummary.handleCheckout` no
  longer has the `/checkout` fallback; `featureUtils.useFeatureAccess` is deleted. No recurrence.
- MYK9-338, MYK9-336, MYK9-341, MYK9-314, MYK9-316, MYK9-320, MYK9-339 — open, unchanged.
- MYK9-308 / MYK9-313 / MYK9-322 / MYK9-328 — dead-code sweeps for other scopes; their contents were
  excluded from MYK9-353 rather than restated.

## Coverage

**Read closely** — `cart/*`; `subscription/*`; `panels/{PanelStack, PanelContext, hooks,
EntityCreationPanel, PanelTestComponent}`; `panels/edit/{ShowEditFeesTab, ShowEditForm, ShowEditPanel,
ShowEditPanel.helpers/.types, ShowEditPremiumTab, ComplimentaryPremiumSection,
complimentaryPremium{Dates,GrantStatus}, UserEditPanel(+helpers), personRolesService, BasicInfoTab,
TrialEditPanel, LogManualResultPanel(+helpers), ClassEditPanel(.helpers), ClassEditForm,
DogEditPanel(+helpers), ShowOfficialsEditor, EditPanelWrapper, useEditPanel, JudgeQualificationPanel,
ClubEditPanel}`; `admin/DataLifecycleManagement/*`; `admin/users/{useBulkActions, bulkRoleRunner,
AdminDeleteUserDialog, UserTable/buildUserRowActions}`; `admin/LoadTestDashboard`;
`rbac/PermissionGuard`; `auth/PermissionGuard`; `security/TurnstileChallenge`;
`providers/ShowDataProvider`; `users/{AccountStatusDialog, UserDetails/useSendUserInvitation,
UserDetailsView}`; `exhibitor/{ExhibitorOnboardingChecker, ClassCheckIn, ClubContextGate}`;
`clubs/ClubDetails/useClubDetailsState`; `clubs/members/AddMemberDialog`;
`preferences/{DataSettings, SecuritySettings}`; `notifications/NotificationSettings`;
`dogs/DogDetails/Competitions/ShowCard`.

**Skimmed** (handlers, nav targets, persistence only) — `admin/permissions/*`,
`admin/users/{CreateUserDialog, UserFilters, BulkRoleDialog, BulkActionsBar, UserTable/*}`, `sync/*`,
`offline/*`, `analytics/*`, `templates/*`, `notifications/{RingAlertsSettings, MessageCenterPanel}`,
`preferences/{ThemeSelector, CompetitionSettings, InstallAppSettings}`, `dogs/*`, `clubs/*`,
`club-admin/*`, `users/browse/*`, `common/*`, `layout/*`, `navigation/*`, `landing/*`, `askq/*`,
`status/*`, `pwa/*`, `panels/entities/*`, `panels/edit/{AddDogPanel/*, DogEditPanel.sections,
ClubEditPanel/PremiumTemplatesTab, ContactInfoTab, QualificationsTab}`.

**Skipped** beyond a zero-importer scan — `ui/*`, `base/*`, `layouts/*`, `shared/*`, `icons/*`.

**Checked and found clean** (do not repeat next rotation):

- Cart money math — `CartSummary` subtotal/fee/total against `calculatePlatformFeeCents`;
  waitlist/blocked gating; `/fees` route exists.
- `SubscriptionManager` — paid-only billing card, admin-scoped customer lookup, reachable `past_due`
  copy, `/pricing-page` route exists.
- `user_roles` **writes are server-gated** (migration 079 `is_platform_admin()`, 099 show-scoped
  secretary policies), so the "Admin Only" role UI is not a client-only gate. `bulkRoleRunner` is
  scope-aware — which is the contrast that made MYK9-350 visible.
- `dogs_update` RLS mirrors the client `isAdminRole` owner-change gate; health/training premium
  writes are server-gated (`20260724120000`).
- Deleted-entity restore / hard-delete paths — every service ignores `restoredBy`, so none of them
  hits the `people.id ≠ auth.uid()` trap; all RPC-backed.
- `TrialEditPanel` status values match `trials_status_check` (071); `ShowEditBasicInfoTab` matches
  `shows_status_check` (072).
- `ClassEditForm` fee inputs parse to numbers — they do **not** have the MYK9-346 §2 defect.
- All 91 literal and template `to=` / `navigate(` / `href=` targets in scope resolve to a route
  pattern in `routes/*.tsx` + `routeRegistry.ts`.
- `TurnstileChallenge` script lifecycle; `useSendUserInvitation` double-send guard;
  `AdminDeleteUserDialog` owns-dogs guard; `useBulkActions` partial-failure handling;
  `ComplimentaryPremiumSection` local-day parsing and in-flight refs.

## Process notes

- **In-flight PRs checked by file, twice** — at dispatch (none touching `components/`) and again
  immediately before filing, after #1973, #1974 and #1975 appeared. None of the three touches any
  file cited in a finding; #1973/#1974 do reshape `components/dogs/{DogDetailsMain,browse,common}/`,
  which is noted in MYK9-353 as a re-grep-before-deleting caveat.
- **Linear reconciliation** used `includeArchived: true` throughout (340 issues across two pages),
  and each finding was searched on file path, symptom, and route separately. MYK9-350 is the one
  that nearly duplicated: MYK9-152 describes the identical defect on a different component, and
  `git log` on `personRolesService.ts` was what established the Edit User panel as an untouched
  third surface rather than a re-file.
- No Linear write failed; nothing is unfiled.
