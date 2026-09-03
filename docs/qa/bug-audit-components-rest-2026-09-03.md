# Bug audit — `components/` rest — 2026-09-03

- **Week:** 36 (`date +%V`) → `IDX = 36 % 10 = 6` → scope 7 in the SKILL.md table, **`components/` rest**, model **Fable**.
- **Baseline:** `f558bc675` (== `origin/main` at run time).
- **Reviewer:** one Fable agent, `run_in_background: false`, read-only, no sub-agents. 324,083 subagent tokens, 100 tool calls, 14.5 min.
- **Scope:** `apps/myk9show/src/components/` excluding the show-ops directories (`shows`, `classes`, `entries`, `scoring`, `secretary`, `schedule`, `reports`, `trials`, `checkin`, `offline-checkin`, `stewards`, `judges`, `results`, `conflict`, `waitlist`, `volunteers`, `announcements`).

## Why this scope ran twice in one week

The rotation selected the same scope as yesterday (`docs/qa/bug-audit-components-rest-2026-09-02.md`,
baseline `6006dffa2`). Between the two runs every one of that report's findings (MYK9-346..353)
was fixed and merged — #1980, #1989, #1991, #1992, #1984 — and 207 files in `components/` changed
(31,982 deletions, 1,350 insertions). Re-sweeping the same ground would have been waste, so the
brief was cut in three prioritised parts instead: **(A)** a regression check on every overnight
fix, **(B)** the code that landed since (#1973 registry-card, #1974 passport-rail, #1978 mobile
entry filters), and **(C)** the directories yesterday's Coverage section marked only "skimmed" or
"skipped". Yesterday's "read closely" set was excluded except where Part A needed it.

Every finding below was re-read against source by the orchestrator before filing; one severity
was corrected on that re-read (see MYK9-361).

## Part A — did the overnight fixes hold?

| Fix | Verdict | Evidence |
| -- | -- | -- |
| MYK9-346 Fees tab schema drift | **holds** | `lib/validation.ts:149-193` carries every `ShowEditFormData` key the mapper reads; `EditPanelWrapper.tsx:461-465` gates Save on `!isValid`; `tsc -p tsconfig.app.json` exit 0 |
| MYK9-347 paused profile → `/onboarding` | **partial → recurrence** | see below |
| MYK9-348 Clear Cache outbox | **holds** | guard re-runs at click and at confirm (`DataSettings.tsx:54-72, 93-115`); `DISPOSABLE_DATABASES` never names `myK9_Replication` |
| MYK9-350 scope-blind role write | **holds** | `personRolesService.ts` deleted; `BasicInfoTab.tsx:146-150` links to permissions instead of writing |
| MYK9-351 / MYK9-354 judge qualifications | **holds** | `JudgeQualificationPanel.tsx:232-258` → `replace_judge_qualifications` RPC, error toasted; migration `20260903150000` gates on `is_site_admin() OR has_role('secretary')` |
| MYK9-352 UTC end-date parse | **holds** | `useClubDetailsState.ts:134` → `showDateRangeStatus` → `toLocalDate` |
| MYK9-353 / #1984 dead-code deletion | **holds** | every row confirmed gone; barrels re-export only live modules; typecheck clean |

## Findings

| Issue | Sev | Title | Evidence |
| -- | -- | -- | -- |
| [MYK9-359](https://linear.app/myk9-platform/issue/MYK9-359) | P1 | Club Details permission gate is backed by `MOCK_USERS` fixtures and a permission code no migration seeds — every real club admin gets a read-only `/clubs/:id` | `services/clubAdminService.ts:96-105`; `clubs/ClubDetails/useClubDetailsState.ts:113-130`; `clubs/members/MemberList.tsx:70-72`; `layout/sidebar/unifiedSidebarConfig.ts:298-302` |
| [MYK9-347](https://linear.app/myk9-platform/issue/MYK9-347) | P1 | **Recurrence** — #1980 gated `needsOnboarding` but not the `\|\| !onboardingCompleted` operand, so a paused query still redirects | `exhibitor/ExhibitorOnboardingChecker.tsx:65-67`; `hooks/useExhibitorProfile.ts:258-260` — commented on the original and reopened to Todo, no new id |
| [MYK9-360](https://linear.app/myk9-platform/issue/MYK9-360) | — | Parent: P2/P3 findings | — |
| [MYK9-361](https://linear.app/myk9-platform/issue/MYK9-361) | P2 | Create User offers club-scoped roles with no club; the grant is rejected by migration 102's trigger; the dialog still toasts success and emails an invitation naming the role | `admin/users/CreateUserDialog.tsx:99-108, 154-168, 180`; `services/rbac/RoleManager.ts:305-336`; `102_fix_trial_secretary_rls_bypass.sql:78-97` |
| [MYK9-362](https://linear.app/myk9-platform/issue/MYK9-362) | P3 | Passport rail's primary secretary action "Verify for entry" has no handler (pre-existing, promoted by #1974) | `dogs/DogDetailsMain/DogIdentityRail.tsx:205-209` |
| [MYK9-363](https://linear.app/myk9-platform/issue/MYK9-363) | P3 | Health timeline cards styled clickable with `onEventClick={() => {}}` | `dogs/DogDetails/HealthRecords/HealthRecordsSection.tsx:433`; `HealthTimelineEvent.tsx:62-67` |
| [MYK9-364](https://linear.app/myk9-platform/issue/MYK9-364) | P3 | Dead-code residue: 15 zero-importer modules (~3.1k lines) + `LazyDogCard` orphaned via two unimported show-ops steps | per-symbol grep table in the issue; counts re-run by the orchestrator, all 0 |

### The two that matter

**MYK9-359 — a permission gate computed from dev fixtures.** `ClubAdminService.isClubAdmin` does
`Object.values(MOCK_USERS).find(u => u.id === userId)` — eight hand-written fixtures with ids like
`'club-admin-user'`, never a `people.id` — and the fallback arm checks `club:manage_members`, a
permission code that `grep -rln` over `supabase/` and `scripts/` shows no migration or seed has ever
created. Both arms are structurally false for every real account, so `computeClubPermissions`
returns all-false for anyone who is not `site_admin`, while `clubs_update` RLS would allow the
write. The sidebar's "Club Profile" item sends club admins straight to that page. The file has not
changed since the app was imported; the reason nothing caught it is MYK9-137 — until 2026-08-05 the
e2e `clubAdmin` fixture *was* the site admin.

**MYK9-347 recurrence — the fix satisfied its acceptance criterion literally.** The AC asked for
`needsOnboarding === false` when the query is paused, and #1980 delivered exactly that. The
redirect is `needsOnboarding || !onboardingCompleted`, and `onboardingCompleted` is
`!!profile?.onboarding_completed_at` — `false` whenever `profile` is undefined, which it is while
paused. Same cold-offline boot, same `/onboarding` destination, second operand. The test file's
`needsOnboarding:false, onboardingCompleted:false` case models a *present but incomplete* profile
(where redirecting is correct), so the fix has to distinguish "row with null completion" from "row
unknown" — gate the whole redirect on `status === 'success'`.

## Corrected on verification

- **MYK9-361 was filed at P2, not the reviewer's P1.** The reviewer's headline scenario was a
  `club_id IS NULL` `secretary` row that `has_role()`'s `OR ur.club_id IS NULL` arm (migration
  082:64) would honour platform-wide. That row cannot exist: migration 102's constraint trigger
  `enforce_club_id_for_scoped_roles` raises `check_violation` for `secretary`/`trial_secretary`/
  `club_admin` with a null club, and no later migration touches it (`grep -ln` over
  `supabase/migrations/` returns only 102). What stands is the silent-failure half — grant rejected,
  error swallowed at `:158-160`, success toast at `:165-168`, invitation email built with
  `roleLabels: validatedData.roles` at `:180`. Wrong but recoverable from Manage Roles, on an
  admin-only surface: P2.

## Dropped on verification

Nothing. All seven reviewer findings survived a source re-read; the only change was the severity
above.

## Already known — found again, filed nothing

MYK9-99 (SlideOverPanel `size`), MYK9-350/152 (same class as MYK9-361, different file — cited as
related), MYK9-219 (`showOwner` in `DogsGridView`), MYK9-124 (DogStrip add-dog placement),
MYK9-138 (ClubSwitcher), MYK9-202 (sign-out guard), MYK9-153 (removed-user rows), MYK9-131 (Create
User invitation). All Done; none reproducing.

**Not a second MYK9-348 hole:** `layout/AccountMenuContent`'s Developer submenu is
`NODE_ENV === 'development'`-gated and `clearDevelopmentCache` refuses outside DEV.

## Coverage

**Part B — read in full:** `dogs/DogDetailsMain/{DogIdentityRail, TitleProgressSection, index,
DogDetailsTabs, types}`, `dogs/common/{DogRegistryTable, dogRegistryModel, dogStatusBadges}`,
`dogs/browse/DogsGridView`, `exhibitor/{CompactStatsRow, DogStrip, DogStripCard}`. Clean apart
from MYK9-362: owner resolution goes store → `people` query with an `id:'loading'` sentinel;
`/people/:id` and `/shows` resolve; `?section=career&view=titles` is a valid `CareerView`;
`DogStrip`'s snake_case cast matches `getDogsByOwner`'s DB-row shape; registry model handles both
`registration_number` and `registrationNumber`; `DOG_STATUS_BADGES[...]` lookups are null-guarded.
`CareerSection ownerId={user?.id}` (auth uid) is **deliberate** — `manual_results.owner_id`
references `auth.users` (migration 042, `b2ec1b147`); not the `people.id ≠ auth.uid()` trap.

**Part C — read closely:** `admin/permissions/*` (all 11), `admin/users/{CreateUserDialog,
BulkRoleDialog, BulkActionsBar, UserTable/index, columns, utils, RowActions}`,
`notifications/{RingAlertsSettings, MessageCenterPanel}`, `preferences/{ThemeSelector,
InstallAppSettings, DataSettings, clearCacheGuard}`, `clubs/ClubDetails/{useClubDetailsState,
ClubHeader, index}`, `clubs/members/MemberList`, `club-admin/ClubSwitcher`,
`services/clubAdminService` (as the gate's backend), `dogs/DogDetails/Registrations/{AddRegistrationPanel,
RegistrationsSection}`, `dogs/DogDetails/HealthRecords/{HealthRecordsSection, HealthTimelineEvent}`,
`dogs/LazyDogCard`, `layout/AccountMenuContent`.

**Part C — skimmed** (handlers, nav targets, error paths): `users/browse/*`, `layout/{AppHeader,
SidebarLayout, signOutGuard, sidebar/unifiedSidebarConfig}`, `common/{CommandPalette,
CheckInStatusDialog, CascadingDeleteDialog, InlineEditableField, SyncStatusIndicator,
CheckInManagementOverlay, AboutDialog, ErrorBoundary}`, `landing/v2/{ClubOnboarding,
WaitlistFormLanding}`, `askq/AskQPanel`, `pwa/PWAInstallBanner`, `navigation/UnsavedChangesRouteGuard`,
`status/*`, `panels/edit/{AddDogPanel/*, DogEditPanel.sections, ClubEditPanel/PremiumTemplatesTab,
ContactInfoTab, QualificationsTab}`, `dogs/DogDetails/{TrainingJournal, Pedigree, TitleTracking,
Competitions, HealthRecords/AddHealthItemDialog, HealthImportDialog}`,
`dogs/{AddEditRegistrationDialog, DogStatusDialog, browse/DogsTableView, browse/DogsBulkActionsBar}`,
`clubs/ClubDetails/{MembersTab, UpcomingShowsTab, PastShowsTab, AboutTab, BrandingTab, ClubDialogs}`,
`clubs/browse/*`.

**Targeted pass only:** `ui/*` (62 files — zero-importer scan found 3, in MYK9-364; inert-prop scan
on `size`/`variant` found nothing beyond MYK9-99), `base/*`, `layouts/*`, `shared/*`, `icons/*`
(importer counts all ≥ 1).

**Skipped:** `common/{UnifiedSidebar, TimerIntegration, DualTimerDisplay, IconContainer, EmptyState,
SkeletonLoaders*, RecentSearches, EntitySidebar, DetailHero, ListControls, PremiumCard,
PremiumButton}` bodies, `askq/*` other than the panel, `landing/v2/*` static sections,
`dogs/DogDetails/Statistics/*`, `templates/*` beyond the dead-code scan. Yesterday's "read closely"
set was not re-read (see the first section).

**Checked and found clean (do not repeat next rotation):**

- Every literal `to=` / `navigate(` / `href=` / `<Navigate to=` target and every `path|href|to: '/…'`
  config literal in scope (70 unique) resolves against `routeRegistry.ts` + `routes/*.tsx`.
- No permanently-true `disabled` in scope other than loading-state selects; no-op handlers are
  exactly MYK9-362, MYK9-363, and a harmless `onSetRecentUpdate={() => {}}` (celebration copy).
- `dog_registrations.status` has no CHECK constraint (only a column comment), so the UI's
  `Active/Pending/Expired/Under review` vocabulary is not rejected server-side.
- `platform_waitlist` anon INSERT grant exists (migration 197:41).

## Process notes

- **In-flight PRs checked by file:** `gh pr list --state open` returned **no open PRs at all** at
  dispatch, and none appeared before filing. Nothing cited here is in flight.
- **Linear reconciliation** used `includeArchived: true` throughout (350 issues across two pages);
  each finding was searched on file path, symptom, and route separately (`club admin edit club`,
  `clubAdminService`, `MOCK_USERS`, `CreateUserDialog`, `onboarding offline`, `Verify for entry`,
  `health timeline`). MYK9-313 named only `useClubAdmin` as a dead export of `clubAdminService`,
  never the mock-backed gate; MYK9-62/120/138 cover the same page's tabs, show-access RPCs and
  site-admin routing, not this gate.
- **Labels:** the workspace has no `p0`/`p1`/`source:*`/`audit:*` labels; used the `Claude` +
  `Bug`/`Improvement` convention plus the priority field, with the P-level in each body.
- **MYK9-347 was reopened (Done → Todo) by this run**, not merely commented — the recurrence would
  otherwise sit invisible under a Done issue that auto-archives. Noted here so the choice is
  reviewable.
- No Linear write failed; nothing is unfiled.
