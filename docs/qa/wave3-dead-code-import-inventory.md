# Wave 3 dead-code import inventory

Inventory date: 2026-09-02

This is the lead inventory for MYK9-308, MYK9-313, MYK9-322, and MYK9-328. The
scan covers TypeScript source in `apps/`, `packages/`, and `supabase/`, with
tests and build output excluded when deciding whether a production importer
exists. Barrels, dynamic string references, and test-only references were
checked separately before deletion.

## Decisions

| Area                | Current result                                                                                            | Decision                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Hooks (MYK9-308)    | 13 modules have no production importer; one is retained for compatibility tests                           | Delete the 12 unreferenced modules and their orphaned tests.                                           |
| Features (MYK9-313) | Nine unmounted pipeline/message components/hooks have no live importer                                    | Delete the unmounted cluster and its orphaned tests.                                                   |
| Services (MYK9-322) | Seven legacy modules have no source/test consumer; payment and scoring mappers remain test-backed         | Delete the seven orphaned modules; retain test-backed services.                                        |
| Packages (MYK9-328) | Owner confirmed internal-only packages; fresh scans distinguish dead exports from live internal consumers | Local removal is in progress; see the [per-symbol inventory](myk9-328-package-dead-code-inventory.md). |

## Retained compatibility/live symbols

`useShowStoreCompat` is live: `useShowEntriesForUser.ts` and
`components/entries/OfflineEntryForm.tsx` import it, and store integration
tests exercise it. It must not be deleted based on stale issue evidence.

The owner answered "Internal" on 2026-09-02, resolving external-package
compatibility. Verified scoring timer/calculation and unused scoring-ui APIs
are now removed locally on `codex/myk9-328-completion`; live consumers
and remaining slices are recorded in the package inventory. This follow-up is
not yet merged. Replication TTL remains unchanged pending its behavioral-test
boundary; enabling expiry would create false-empty offline reads.

The live pipeline boundary is `SecretaryDashboardPage` →
`useMissionControlData` and the lazy `TrialPipelineDetail` route. The deleted
pipeline cluster was not imported by either surface. The live messages
boundary is `ChatPage`/`SecretaryMessagesPage`; both render message bubbles
and inputs directly, so `ThreadDetail` was not a route-level component.

The command-menu context is now registered by `EntryManagementPage` with the
resolved show and optional trial scope. `CommandPalette` remains the read-only
renderer, and the existing contextual-command tests cover the canonical
Entry Management/Class Management links. The premium style flag module and
its test were deleted because no production code imported either export;
premium styles are selected directly by the live template flow.

The following application dead exports were also removed after a repository-wide
symbol sweep found only their definitions and/or tests: the two legacy payment
summary helpers, `isPaidPaymentStatus`, the reviewed lifecycle alias and guard,
`isSupersededFailure`, and `KNOWN_PARAMETERIZED_PATTERNS`. The live payment
ledger total and authoritative payout selector remain covered and exported.

The following database exports were also removed after whole-repository
verification found no production or test consumer: `findRegistrationByExactIdentity`,
`joinWaitlist`, and `getManualResultById`. Their authoritative replacement
surfaces remain available through the existing replicated/RPC-backed flows.

Additional database exports removed after the same verification were
`deleteJudgeAvailability`, `getJudgeCertificationsByPersonId`,
`getOFAScreeningById`, and `getGeneticScreeningById`. The day-of
`getShowDogs` lookup was also definition/barrel-only and was removed; the live
late-entry dog creation path and its workbench test remain.

`getRegistrationByConfirmationNumber` was removed with its dedicated tests
after confirming it had no production caller; registration creation and
show/handler lookup remain live.

`getConfirmationNumbersForEntries` was removed with its dedicated tests after
the same no-production-caller check; live confirmation data is still returned
by the registration/show query paths.

`getRegistrationsForShow` was removed with its dedicated tests after confirming
no production caller; the live show/handler registration lookup remains.

`getTrialStatistics` and its PostgREST helper were removed with their
dedicated tests after confirming no production caller; trial list and timeline
queries remain available.

`getTrialsByDateRange` and its PostgREST helper were removed with dedicated
tests after confirming no production caller; the live trial list/show queries
remain available.

`getTrialsByStatus` and its PostgREST helper were removed with dedicated tests
after confirming no production caller; upcoming-trial and trial-by-show paths
remain available.

`searchTrials` and its PostgREST helper were removed with dedicated tests after
confirming no production caller; the live trial list and show-scoped queries
remain available.

`getUpcomingTrials` and its PostgREST helper were removed with dedicated tests
after confirming no production caller; callers should use the live trial list
query and apply their existing show scope.

`getWaitlistPosition` was removed with its dedicated tests after confirming no
production caller; waitlist joins, class counts, promotions, and removals stay
available through the live waitlist flows.

`getWaitlistByShow` was removed with dedicated tests after confirming no
production caller; class-scoped waitlist reads remain available.

`getEntryArmbandById` was removed with its dedicated test and stale test-mock
entries after confirming no production caller; armband assignment and next
number generation remain available.

`getDogsWithUpcomingShows` and its PostgREST helper were removed with their
dedicated tests after confirming no production caller; the live dog list,
owner, search, and statistics queries remain available.

`uploadShowLogo` was removed with its dedicated branding tests after
confirming no production caller; club/show cover uploads remain available.

`resolveClassVisibilityForTrial` was removed with its wrapper-only tests after
confirming no production caller; the live `resolveVisibilityForClassRows`
resolver remains intact.

The unimplemented organization-override methods were removed from
`RBACService`; they had no callers and target a nonexistent table. Existing
role/permission cache and audit behavior remains unchanged.

The unused Supabase client health, current-user, and batch-operation helpers
were removed with the test-only connection diagnostic module and stale global
mocks; auth/session and query logging helpers remain available.

The unreferenced query-client helpers `optimisticUpdates`, `handleQueryError`,
and `withPerformanceTracking` were removed; the live query client, key map, and
invalidation helpers remain available.

The inert performance helpers `setupQueryPerformanceMonitoring`,
`smartCacheInvalidation`, and `preloadNavigationTargets` were removed from the
live utility module; its mounted `prefetchCriticalData` path remains.

The unreferenced `getManagedShows` and `getJudgingShows` selectors were removed
from show-management tracking; relationship synchronization and performance
monitoring remain available.

The unreferenced `createBulkActions` factory and base-barrel export were
removed; `BulkAction` remains available for the mounted `BulkActionsBar`.

The unreferenced `logLazyLoadingReport` development helper was removed; the
mounted lazy-component start/end/retry metrics remain available.

The unreferenced lazy `batchPreload` helper and realtime optimization entry
points for pooled subscriptions, batched/compressed messages, listener setup,
frequency tuning, and aggregate stats were removed. The live presence setup
and adaptive heartbeat path remain.

The unreferenced optimistic-ID helpers and date-range show filter were removed;
the live ID generator and show statistics calculation remain.

## Deleted hook set

These files had no production importer after excluding the file itself and
tests, and no dynamic/path references were found in the repository:

- `hooks/useMineToggle.ts`
- `hooks/ui/useModal.ts`
- `hooks/ui/useFilterState.ts`
- `hooks/ui/useTableState.ts`
- `hooks/useEmailNotifications.ts`
- `hooks/useDogRegistrations.ts`
- `hooks/usePreventPanelClose.ts`
- `hooks/useHealthDialogs.ts`
- `hooks/useTitles.ts`
- `hooks/mutations/useGenericMutations.ts`
- `hooks/useRoutePrefetch.ts`
- `hooks/useShowSelection.ts`

Feature/message files deleted:

- `features/pipeline/components/{AnnouncementsCard,ClassPipelineColumn,QuickActionsSection,ShowContextRow,ShowSettingsPanel,TrialContextRow}.tsx`
- `features/pipeline/hooks/{useClassPipelineDragEnd,useQuickActionStats}.ts`
- `features/messages/components/ThreadDetail.tsx`

Their component/hook tests were deleted with the unmounted subjects.

Service files deleted:

- `services/database/compression-utils.ts`
- `services/security/KeyManagementService.ts`
- `services/scoresheets/areaInitialization.ts`
- `services/sync/{offlineManager,SyncOptimizationService,ConflictResolutionService,InitialSyncOrchestrator}.ts`

`PaymentService.ts` and `services/mappers/scoringMappers.ts` remain because
their test suites import them directly. `RouterPageViewTracking.ts` remains
because `main.tsx` installs it at application boot.

The `useMineToggle` and `useModal` test files were test-only coverage for
unmounted compatibility hooks and were removed with their subjects.
`useUserStoreCompat` remains because store/integration tests still import it;
no live barrel entry references the deleted set.

## Verification map

The final sweep must show no source import of every deleted basename, while
the following live boundaries remain resolvable: `useShowStoreCompat`, the
dog-detail performance chart chain, `/at-show`, `/admin/sync`, and package
root barrels. Whole-repo typecheck, lint, code-quality ratchet, and focused
tests are the acceptance gate for this inventory.
