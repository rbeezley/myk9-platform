# Wave 3 dead-code import inventory

Inventory date: 2026-09-02

This is the lead inventory for MYK9-308, MYK9-313, MYK9-322, and MYK9-328. The
scan covers TypeScript source in `apps/`, `packages/`, and `supabase/`, with
tests and build output excluded when deciding whether a production importer
exists. Barrels, dynamic string references, and test-only references were
checked separately before deletion.

## Decisions

| Area | Current result | Decision |
| --- | --- | --- |
| Hooks (MYK9-308) | 13 modules have no production importer; one is retained for compatibility tests | Delete the 12 unreferenced modules and their orphaned tests. |
| Features (MYK9-313) | Nine unmounted pipeline/message components/hooks have no live importer | Delete the unmounted cluster and its orphaned tests. |
| Services (MYK9-322) | Seven legacy modules have no source/test consumer; payment and scoring mappers remain test-backed | Delete the seven orphaned modules; retain test-backed services. |
| Packages (MYK9-328) | Several exports have no repository-local importer, but remain package API surface | Keep published barrels until an API compatibility decision is made. |

## Retained compatibility/live symbols

`useShowStoreCompat` is live: `useShowEntriesForUser.ts` and
`components/entries/OfflineEntryForm.tsx` import it, and store integration
tests exercise it. It must not be deleted based on stale issue evidence.

The scoring timer/calculation and scoring-ui exports remain package API until
the compatibility decision is explicit. The replication TTL machinery remains
unchanged because enabling expiry would create false-empty offline reads.

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
