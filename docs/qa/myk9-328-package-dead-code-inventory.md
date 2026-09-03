# MYK9-328 package dead-code inventory

> **Status:** In Progress — local implementation; not merged.

Inventory date: 2026-09-03. Baseline: `d5a495862`.
Branch: `codex/myk9-328-completion`.
Owner confirmed packages are **internal-only** ("Internal").
The previous temporary worktree disappeared; its recorded file patches were
recovered in the durable project worktree and verified afresh.

## Scope and decisions

- Scoring: remove unused timer/calculation/nationals cluster.
- Scoring UI: remove entry-mode sheets and unused hooks; retain live registry dispatch.
- Ringside/UI: remove orphaned ClassList cluster, unused badges/time/context
  helpers and deprecated novice aliases; trim barrels.
- Core/notifications/secretary: remove unused utilities, stub services,
  configuration/lookup/reset APIs. Preserve real logger warnings/errors,
  notification delivery, formatter auto-registration and sorted listing.
- Email: **types-only**. Remove all unused React renderers and token copies,
  their dedicated tests and React Email dependencies. Production HTML remains
  owned by existing Edge Function builders. Former parity tests retain their
  production-content assertions. No HTML behavior or deployment changes.
- Supabase package client cleanup already merged in #1977; do not repeat it.
- Replication TTL: removed after explicit public-test-boundary approval.
  No expiry activation, cache clear, or sync/eviction/deletion-policy change.

## Count method

167 removed source declarations are listed below. Counts are distinct
tracked production TypeScript files containing the whole-word symbol across
`apps`, `packages`, and `supabase`; exclude tests/specs, **tests**, dist,
and node_modules. Before uses `git grep -l -w <symbol> d5a495862`;
current uses the worktree. Definitions, barrels and comments count, so these
are **raw file counts, not caller counts**. Deep imports and dynamic registry
edges were checked separately.

Remaining matches are unrelated same-name app components/types: Dialog and
Collapsible are app-local/Base UI; ElementType is React; CompetitionDay and
TimerWarningState are retained scoring types; sortClasses, AnimationConfig,
DialogState and TimerState belong to independent app modules. None imports
the deleted package implementation.

| Defining file (under packages/)                                                    | Removed declaration                 | Before | Current raw files |
| ---------------------------------------------------------------------------------- | ----------------------------------- | -----: | ----------------: |
| `core/src/constants/check-in-status.ts`                                            | `SECRETARY_ONLY_STATUSES`           |      2 |                 0 |
| `core/src/constants/class-status.ts`                                               | `CLASS_STATUS_ORDER`                |      2 |                 0 |
| `core/src/constants/class-status.ts`                                               | `getNextClassStatus`                |      2 |                 0 |
| `core/src/helpers/class-display-status.ts`                                         | `shouldShowClassLifecycleChips`     |      2 |                 0 |
| `core/src/services/nationalsScoring.ts`                                            | `ElementType`                       |      5 |                 3 |
| `core/src/services/nationalsScoring.ts`                                            | `CompetitionDay`                    |      5 |                 2 |
| `core/src/services/nationalsScoring.ts`                                            | `NationalsScore`                    |      2 |                 0 |
| `core/src/services/nationalsScoring.ts`                                            | `NationalsRanking`                  |      2 |                 0 |
| `core/src/services/nationalsScoring.ts`                                            | `NationalsScoringInterface`         |      2 |                 0 |
| `core/src/services/nationalsScoring.ts`                                            | `nationalsScoring`                  |      3 |                 0 |
| `core/src/services/notificationSoundService.ts`                                    | `NotificationSoundServiceInterface` |      2 |                 0 |
| `core/src/services/notificationSoundService.ts`                                    | `notificationSoundService`          |      2 |                 0 |
| `core/src/services/voiceAnnouncementService.ts`                                    | `VoiceAnnouncementServiceInterface` |      2 |                 0 |
| `core/src/utils/deviceDetection.ts`                                                | `resetDeviceDetection`              |      2 |                 0 |
| `core/src/utils/logger.ts`                                                         | `configureLogger`                   |      2 |                 0 |
| `core/src/utils/logger.ts`                                                         | `setLogLevel`                       |      2 |                 0 |
| `core/src/utils/network.ts`                                                        | `RetryOptions`                      |      2 |                 0 |
| `core/src/utils/network.ts`                                                        | `withRetry`                         |      2 |                 0 |
| `core/src/utils/network.ts`                                                        | `RETRY_PRESETS`                     |      2 |                 0 |
| `core/src/utils/passcodes.ts`                                                      | `ShowPasscodeRole`                  |      2 |                 0 |
| `core/src/utils/passcodes.ts`                                                      | `generateRoleCode`                  |      2 |                 0 |
| `core/src/utils/passcodes.ts`                                                      | `generateShowPasscodes`             |      2 |                 0 |
| `core/src/utils/search.ts`                                                         | `createSearchFilter`                |      2 |                 0 |
| `core/src/utils/search.ts`                                                         | `filterBySearchTerm`                |      2 |                 0 |
| `core/src/utils/search.ts`                                                         | `normalizeSearchTerm`               |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isDefined`                         |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `assertDefined`                     |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `hasProperty`                       |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isString`                          |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isNumber`                          |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isBoolean`                         |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isArrayOf`                         |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isFunction`                        |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isDate`                            |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isPromise`                         |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `isNullish`                         |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `hasRequiredProperties`             |      2 |                 0 |
| `core/src/utils/typeGuards.ts`                                                     | `safeGet`                           |      2 |                 0 |
| `email/src/bannerTokens.ts`                                                        | `BN`                                |      3 |                 0 |
| `email/src/components/EmailButton.tsx`                                             | `EmailButton`                       |      4 |                 0 |
| `email/src/components/EmailLayout.tsx`                                             | `EmailLayout`                       |      5 |                 0 |
| `email/src/fieldGuideTokens.ts`                                                    | `FG`                                |      3 |                 0 |
| `email/src/gazetteTokens.ts`                                                       | `GZ`                                |      3 |                 0 |
| `email/src/headlineTokens.ts`                                                      | `HN`                                |      3 |                 0 |
| `email/src/heritageTokens.ts`                                                      | `HC`                                |      3 |                 0 |
| `email/src/magazineTokens.ts`                                                      | `MZ`                                |      3 |                 0 |
| `email/src/monogramTokens.ts`                                                      | `MG`                                |      3 |                 0 |
| `email/src/posterTokens.ts`                                                        | `PO`                                |      3 |                 0 |
| `email/src/templates/BannerConfirmationEmail.tsx`                                  | `BannerConfirmationEmail`           |      4 |                 0 |
| `email/src/templates/ConfirmEmail.tsx`                                             | `ConfirmEmail`                      |      2 |                 0 |
| `email/src/templates/FieldGuideConfirmationEmail.tsx`                              | `FieldGuideConfirmationEmail`       |      4 |                 0 |
| `email/src/templates/GazetteConfirmationEmail.tsx`                                 | `GazetteConfirmationEmail`          |      4 |                 0 |
| `email/src/templates/HeadlineConfirmationEmail.tsx`                                | `HeadlineConfirmationEmail`         |      2 |                 0 |
| `email/src/templates/HeritageConfirmationEmail.tsx`                                | `HeritageConfirmationEmail`         |      4 |                 0 |
| `email/src/templates/MagazineConfirmationEmail.tsx`                                | `MagazineConfirmationEmail`         |      4 |                 0 |
| `email/src/templates/MonogramConfirmationEmail.tsx`                                | `MonogramConfirmationEmail`         |      4 |                 0 |
| `email/src/templates/PosterConfirmationEmail.tsx`                                  | `PosterConfirmationEmail`           |      4 |                 0 |
| `email/src/templates/RegistrationConfirmation.tsx`                                 | `RegistrationConfirmation`          |      2 |                 0 |
| `email/src/templates/ResetPassword.tsx`                                            | `ResetPassword`                     |      2 |                 0 |
| `email/src/types.ts`                                                               | `ConfirmEmailProps`                 |      3 |                 0 |
| `email/src/types.ts`                                                               | `ResetPasswordProps`                |      3 |                 0 |
| `email/src/types.ts`                                                               | `RegistrationConfirmationProps`     |      3 |                 0 |
| `notifications/src/handlers.ts`                                                    | `buildAnnouncementPayload`          |      2 |                 0 |
| `notifications/src/push.ts`                                                        | `requestPushPermission`             |      2 |                 0 |
| `notifications/src/voice.ts`                                                       | `cancelSpeech`                      |      2 |                 0 |
| `ringside/src/context/RingsideContext.tsx`                                         | `useRingsideReplication`            |      3 |                 0 |
| `ringside/src/context/RingsideContext.tsx`                                         | `useRingsidePrefetch`               |      3 |                 0 |
| `ringside/src/context/useShowOrg.ts`                                               | `useShowOrg`                        |      3 |                 0 |
| `ringside/src/pages/ClassList/ClassCardSkeleton.tsx`                               | `ClassCardSkeleton`                 |      3 |                 0 |
| `ringside/src/pages/ClassList/ClassCardSkeleton.tsx`                               | `ClassCardSkeletonList`             |      3 |                 0 |
| `ringside/src/pages/ClassList/ClassList.helpers.ts`                                | `isMaxTimeSet`                      |      3 |                 0 |
| `ringside/src/pages/ClassList/ClassList.helpers.ts`                                | `shouldShowMaxTimeWarning`          |      3 |                 0 |
| `ringside/src/pages/ClassList/ClassList.helpers.ts`                                | `isEmptyDataError`                  |      3 |                 0 |
| `ringside/src/pages/ClassList/ClassList.helpers.ts`                                | `filterClasses`                     |      3 |                 0 |
| `ringside/src/pages/ClassList/ClassList.helpers.ts`                                | `sortClasses`                       |      6 |                 3 |
| `ringside/src/pages/ClassList/hooks/useClassDialogs.ts`                            | `PopupPosition`                     |      3 |                 0 |
| `ringside/src/pages/ClassList/hooks/useClassDialogs.ts`                            | `UseClassDialogsReturn`             |      3 |                 0 |
| `ringside/src/pages/ClassList/hooks/useClassDialogs.ts`                            | `useClassDialogs`                   |      3 |                 0 |
| `ringside/src/pages/ClassList/hooks/useFavoriteClasses.ts`                         | `UseFavoriteClassesReturn`          |      3 |                 0 |
| `ringside/src/pages/ClassList/hooks/useFavoriteClasses.ts`                         | `useFavoriteClasses`                |      3 |                 0 |
| `ringside/src/pages/ClassList/utils/noviceClassGrouping.ts`                        | `findPairedNoviceClass`             |      3 |                 0 |
| `ringside/src/pages/ClassList/utils/noviceClassGrouping.ts`                        | `groupNoviceClasses`                |      3 |                 0 |
| `ringside/src/pages/ClassList/utils/noviceClassGrouping.ts`                        | `isCombinedNoviceEntry`             |      3 |                 0 |
| `ringside/src/pages/ClassList/utils/statusFormatting.ts`                           | `getContextualPreview`              |      3 |                 0 |
| `ringside/src/pages/EntryList/components/entryListHeaderHelpers.tsx`               | `ClassStatusBadge`                  |      4 |                 0 |
| `ringside/src/pages/EntryList/components/entryListHeaderHelpers.tsx`               | `SectionsBadge`                     |      4 |                 0 |
| `ringside/src/pages/EntryList/hooks/useResetScore.ts`                              | `useResetScore`                     |      3 |                 0 |
| `ringside/src/pages/EntryList/quickAdvanceCandidates.ts`                           | `hasAnyGateStatus`                  |      3 |                 0 |
| `ringside/src/pages/EntryList/sortableEntryCardUtils.ts`                           | `getResultClassName`                |      3 |                 0 |
| `ringside/src/utils/timeInputParsing.ts`                                           | `timeToSeconds`                     |      2 |                 0 |
| `ringside/src/utils/timeInputParsing.ts`                                           | `secondsToTime`                     |      2 |                 0 |
| `ringside/src/utils/timeInputParsing.ts`                                           | `compareTime`                       |      2 |                 0 |
| `scoring-ui/src/components/scoresheets/AKC/AKCFastCatEntryScoresheet.tsx`          | `AKCFastCatEntryScoresheet`         |      3 |                 0 |
| `scoring-ui/src/components/scoresheets/AKC/AKCNationalsEntryScoresheet.tsx`        | `AKCNationalsEntryScoresheet`       |      3 |                 0 |
| `scoring-ui/src/components/scoresheets/AKC/AKCScentWorkEntryScoresheet.tsx`        | `AKCScentWorkEntryScoresheet`       |      4 |                 0 |
| `scoring-ui/src/components/scoresheets/ASCA/ASCAScentDetectionEntryScoresheet.tsx` | `ASCAScentDetectionEntryScoresheet` |      3 |                 0 |
| `scoring-ui/src/components/scoresheets/UKC/UKCNoseworkEntryScoresheet.tsx`         | `UKCNoseworkEntryScoresheet`        |      3 |                 0 |
| `scoring-ui/src/components/scoresheets/UKC/UKCObedienceEntryScoresheet.tsx`        | `UKCObedienceEntryScoresheet`       |      3 |                 0 |
| `scoring-ui/src/components/scoresheets/UKC/UKCRallyEntryScoresheet.tsx`            | `UKCRallyEntryScoresheet`           |      3 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `AnimationSettingsInput`            |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `AnimationSettingsProvider`         |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `AnimationConfig`                   |      3 |                 1 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `useAnimationSettings`              |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `useAnimationProps`                 |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `useAnimationDuration`              |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `useCanAnimate`                     |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `useSpringConfig`                   |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `useThrottledRaf`                   |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `usePrefersReducedMotion`           |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `useAnimationClasses`               |      2 |                 0 |
| `scoring-ui/src/hooks/useAnimationSettings.ts`                                     | `createAnimationSettingsProvider`   |      2 |                 0 |
| `scoring-ui/src/hooks/useDialogState.ts`                                           | `DialogState`                       |      3 |                 1 |
| `scoring-ui/src/hooks/useDialogState.ts`                                           | `useDialogState`                    |      2 |                 0 |
| `scoring-ui/src/hooks/useNotificationPermissions.ts`                               | `NotificationPermissionStatus`      |      2 |                 0 |
| `scoring-ui/src/hooks/useNotificationPermissions.ts`                               | `UseNotificationPermissionsOptions` |      2 |                 0 |
| `scoring-ui/src/hooks/useNotificationPermissions.ts`                               | `UseNotificationPermissionsReturn`  |      2 |                 0 |
| `scoring-ui/src/hooks/useNotificationPermissions.ts`                               | `useNotificationPermissions`        |      2 |                 0 |
| `scoring-ui/src/hooks/useSwipeGesture.ts`                                          | `SwipeDirection`                    |      2 |                 0 |
| `scoring-ui/src/hooks/useSwipeGesture.ts`                                          | `SwipeGestureOptions`               |      2 |                 0 |
| `scoring-ui/src/hooks/useSwipeGesture.ts`                                          | `SwipeGestureHandlers`              |      2 |                 0 |
| `scoring-ui/src/hooks/useSwipeGesture.ts`                                          | `useSwipeGesture`                   |      2 |                 0 |
| `scoring-ui/src/hooks/useSwipeGesture.ts`                                          | `SwipeToActionOptions`              |      2 |                 0 |
| `scoring-ui/src/hooks/useSwipeGesture.ts`                                          | `SwipeToActionHandlers`             |      2 |                 0 |
| `scoring-ui/src/hooks/useSwipeGesture.ts`                                          | `SwipeToActionReturn`               |      2 |                 0 |
| `scoring-ui/src/hooks/useSwipeGesture.ts`                                          | `useSwipeToAction`                  |      2 |                 0 |
| `scoring-ui/src/types/scoreData.ts`                                                | `EntryScoresheetProps`              |     11 |                 0 |
| `scoring/src/stores/timerStore.ts`                                                 | `createTimerStore`                  |      3 |                 0 |
| `scoring/src/stores/timerStore.ts`                                                 | `useTimerStore`                     |      3 |                 0 |
| `scoring/src/stores/timerStore.ts`                                                 | `TimerState`                        |      4 |                 1 |
| `scoring/src/utils/calculationUtils.ts`                                            | `calculateTotalAreaTime`            |      3 |                 0 |
| `scoring/src/utils/calculationUtils.ts`                                            | `formatTimeDisplay`                 |      3 |                 0 |
| `scoring/src/utils/calculationUtils.ts`                                            | `formatSecondsDisplay`              |      3 |                 0 |
| `scoring/src/utils/calculationUtils.ts`                                            | `calculateRemainingTime`            |      3 |                 0 |
| `scoring/src/utils/calculationUtils.ts`                                            | `calculateFastCatMph`               |      3 |                 0 |
| `scoring/src/utils/calculationUtils.ts`                                            | `calculateNationalsPoints`          |      3 |                 0 |
| `scoring/src/utils/nationalsUtils.ts`                                              | `mapElementToNationalsType`         |      3 |                 0 |
| `scoring/src/utils/nationalsUtils.ts`                                              | `getNationalsElementDisplayName`    |      3 |                 0 |
| `scoring/src/utils/nationalsUtils.ts`                                              | `getAllNationalsElementTypes`       |      3 |                 0 |
| `scoring/src/utils/nationalsUtils.ts`                                              | `isValidNationalsElement`           |      3 |                 0 |
| `scoring/src/utils/nationalsUtils.ts`                                              | `getNationalsMaxTime`               |      3 |                 0 |
| `scoring/src/utils/nationalsUtils.ts`                                              | `getNationalsMaxTimeFormatted`      |      3 |                 0 |
| `scoring/src/utils/nationalsUtils.ts`                                              | `isValidCompetitionDay`             |      3 |                 0 |
| `scoring/src/utils/nationalsUtils.ts`                                              | `getCompetitionDayName`             |      3 |                 0 |
| `secretary/src/results/registry.ts`                                                | `getFormatter`                      |      3 |                 0 |
| `secretary/src/results/registry.ts`                                                | `clearFormatters`                   |      3 |                 0 |
| `ui/src/components/ClassCard/WarningBanner.tsx`                                    | `WarningBannerVariant`              |      2 |                 0 |
| `ui/src/components/ClassCard/WarningBanner.tsx`                                    | `WarningBannerProps`                |      2 |                 0 |
| `ui/src/components/ClassCard/WarningBanner.tsx`                                    | `WarningBanner`                     |      2 |                 0 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `Dialog`                            |    133 |               129 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogPortal`                      |      4 |                 2 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogOverlay`                     |      4 |                 2 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogBackdrop`                    |      2 |                 0 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogTrigger`                     |      8 |                 6 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogClose`                       |      4 |                 2 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogContent`                     |     76 |                74 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogHeader`                      |     72 |                70 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogFooter`                      |     45 |                43 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogTitle`                       |     74 |                72 |
| `ui/src/components/Dialog/Dialog.tsx`                                              | `DialogDescription`                 |     31 |                29 |
| `ui/src/components/PageLayout/PageLayout.tsx`                                      | `PageLayoutProps`                   |      2 |                 0 |
| `ui/src/components/PageLayout/PageLayout.tsx`                                      | `PageLayout`                        |      3 |                 0 |
| `ui/src/components/TimerDisplay/TimerDisplay.tsx`                                  | `TimerWarningState`                 |      4 |                 2 |
| `ui/src/components/TimerDisplay/TimerDisplay.tsx`                                  | `TimerDisplayProps`                 |      2 |                 0 |
| `ui/src/components/TimerDisplay/TimerDisplay.tsx`                                  | `TimerDisplay`                      |      3 |                 0 |
| `ui/src/components/collapsible.tsx`                                                | `Collapsible`                       |     24 |                22 |
| `ui/src/components/collapsible.tsx`                                                | `CollapsibleTrigger`                |     21 |                19 |
| `ui/src/components/collapsible.tsx`                                                | `CollapsibleContent`                |     21 |                19 |

## Replication TTL symbol counts

The same baseline and production-file count method applies. These 17 symbols
include eight additional exported declarations plus constructor dependencies,
fields and methods; they are not 17 additional independent APIs.

| Removed symbol          | Before | Current raw files |
| ----------------------- | -----: | ----------------: |
| `DEFAULT_TTL_MS`        |      4 |                 1 |
| `SHOW_TTL_MS`           |      2 |                 0 |
| `TRIAL_TTL_MS`          |      2 |                 0 |
| `ENTRY_TTL_MS`          |      2 |                 0 |
| `RESULT_TTL_MS`         |      2 |                 0 |
| `GetTableTTL`           |      3 |                 0 |
| `getTableTTL`           |      2 |                 0 |
| `defaultGetTableTTL`    |      3 |                 0 |
| `customTTL`             |      1 |                 0 |
| `getTableTTLFn`         |      1 |                 0 |
| `getTtl`                |      1 |                 0 |
| `lastSuccessfulSyncAt`  |      1 |                 0 |
| `setLastSuccessfulSync` |      1 |                 0 |
| `isExpired`             |     13 |                 9 |
| `refreshTimestamps`     |      2 |                 0 |
| `cleanExpired`          |      2 |                 0 |
| `collectFreshLocalIds`  |      2 |                 0 |

The remaining `DEFAULT_TTL_MS` is the unrelated Edge Function money-lock
lifetime. The nine remaining `isExpired` matches belong to cart, countdown,
subscription and analytics UI. None references replica expiry. Existing
prefetch-cache TTL and RBAC/template lifetimes are outside this issue.

Four new public-boundary tests cover 45-day-old clean rows online/offline,
all read variants and subscriptions, dirty edits/server reconciliation, and
storage-failure recovery without emitting false empty snapshots. Characterization
passed before deletion; a temporary five-minute expiry mutation failed both
read cases; removing the mutation and TTL plumbing restores green. Full
replication suite: **536 tests / 38 files pass**. Existing capacity tests remain.

## Retained live boundaries (corrections to the original audit)

- `apps/myk9show/src/store/scoringStore.ts` uses the scoring store/types.
- `ScoresheetPage.tsx` and `AtShowScoresheetPage.tsx` dispatch **live** sheets;
  `UKCNoseworkLiveScoresheet.tsx` uses `useElementTimer`.
- `AtShowClassListPage.tsx` and its adapter/row use `ClassEntry`,
  `groupSectionedClasses`, and `getClassIds`. Retain their transitive helpers
  `findPairedSectionedClass`, `shouldCombineAllSections`, `isCombinedEntry`.
- `ClassCompletionPresentation` mounts `ClassPodium`; `ResultBadges` mounts
  `PlacementBadge`, `NationalsResultBadges`, `RegularResultBadges`.
- `quickAdvanceCandidates`, `gateRank`, and `gateStatusLabel` use
  `gatePromotedPending`, `gateStatusOf`, `GATE_PRIORITY_STATUSES`.
- `createEntryStore` constructs the live `useEntryStore`.
- `EntryListHeader.tsx` uses `getStatusBadge`.
- `apps/myk9show/src/components/ui/tabs/index.ts` re-exports shared Tabs.
- Core `getDeviceTier` calls `detectDeviceCapabilities`.
- Secretary `results/index.ts` auto-registers the live formatter;
  `listFormatters` remains consumed by the app.
- App Heritage/Magazine prop builders import email data types. Edge builders,
  not package React components, are the production rendering authority.

## Verification and remaining gates

Eight affected package builds pass. Retained tests: scoring 66, scoring-ui 198,
ringside 371, UI 249, core 253, notifications 54, secretary 140: **1,331**.
Email has no runtime tests after becoming types-only; its build/typecheck and
the **174** passing production email tests provide verification.

See `openspec/changes/internal-package-dead-code/verification.md` for current
broad-check evidence. Do not reuse the previous temporary worktree's test totals
as current evidence. TTL removal, monorepo typecheck/lint and the quality ratchet pass. Remaining:
required CI and approved publication/merge, then Linear completion/archive.
Full app suite: 18,717 passed, 9 existing skips. Independent review: APPROVED.
