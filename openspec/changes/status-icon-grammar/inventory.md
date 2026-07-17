## Status inventory

### Entry family

Canonical lifecycle values from `types/entry-lifecycle.ts`:

`no-status`, `draft`, `submitted`, `paid`, `confirmed`, `scheduled`,
`checked-in`, `at-gate`, `in-ring`, `competing`, `completed`, `withdrawn`,
`not_accepted`, `scratched`, `absent`, `moved`, `scratch-requested`,
`move-up-requested`, `pending-payment`, `promotion-expired`.

Additional UI/check-in values rendered by existing entry surfaces:

`not-opened`, `in-progress`, `pending`, `accepted`, `waitlist`, `waitlisted`,
`rejected`, `missing_info`, `come-to-gate`, `conflict`, and `pulled`, plus the
persisted request aliases `scratch_requested` and `move_up_requested` and the
live-view aliases `checked_in`, `not_checked_in`, `at_gate`, and `in_ring`.

The registration UI enum aliases `not_accepted` as `not_accepted` and
withdrawal as `withdrawn`; those raw values therefore remain the grammar keys.

### Class family

Canonical values from `@myk9/core`:

`Scheduled`, `Upcoming`, `In Progress`, `Completed`, `Cancelled`.

Replicated/ringside aliases that are rendered before normalization:

`no-status`, `none`, `setup`, `briefing`, `break`, `in_progress`,
`offline-scoring`, `offline`, `upcoming`, `completed`, `not-started`,
`in-progress`, `not_started`, `pending`, `paused`, `cancelled`, `start_time`,
and `start-time`.

Accepted legacy aliases from `LEGACY_STATUS_MAP` are normalized to the same
shape and semantic color as their canonical value. The non-canonical aliases
are `scheduled`, `upcoming`, `Pending`, `pending`, `Planned`, `planned`,
`Published`, `published`, `check_in`, `scoring`, `draft`, `accepting_entries`,
`closed`, `unpublished`, `setup`, `in progress`, `in_progress`, `InProgress`,
`inProgress`, `completed`, `Complete`, `complete`, `cancelled`, `Canceled`, and
`canceled`.

### Trial family

Derived composite values from `deriveTrialCompositeStatus`:

`no-classes`, `not-started`, `in-progress`, `completed`, `cancelled`.

Unknown or missing trial values use the neutral `no-status` fallback; they do
not imply that the trial has no classes.

### Existing renderers and maps

The complete in-scope renderer inventory migrated to the shared grammar is:

- Check-in: `components/checkin/CheckInClassRow.tsx`,
  `CheckInExhibitorCard.tsx`, `CheckInProgressBar.tsx`,
  `components/common/CheckInManagementOverlay.tsx`, `CheckInStatusBadge.tsx`,
  `CheckInStatusDialog.tsx`, `CheckInStatusIndicator.tsx`,
  `StatusPickerDialog.tsx`, `components/exhibitor/CheckInStatusMenu.tsx`,
  `ClassCheckIn.tsx`, `components/offline-checkin/CheckInEntryList.tsx`, and
  `features/at-show/slots/CheckinStatusDialog.tsx`.
- Class details and management: `components/classes/ClassCompactHeader.tsx`,
  `ClassDetailsPopover.tsx`, `ClassesTableView.tsx`,
  `ClassResultsTable/StatusBadge.tsx`, `components/shows/tabs/ClassCard.tsx`,
  `ClassesTab.tsx`, `pages/ClassDetailsPage/ClassReadinessStrip.tsx`,
  `SecretaryRunSheet/RunSheetRow.tsx`, and
  `pages/secretary/ClassManagementPage.tsx`.
- Entry and exhibitor lifecycle: `components/entries/EntryStatusHistory.tsx`,
  `EntryStatusLine.tsx`, `EntryStatusStepper.tsx`,
  `management/EntryListCard.tsx`, `components/exhibitor/MultiDogSchedule.tsx`,
  `components/live/EntryRow.tsx`, `LiveClassCard.tsx`,
  `pages/MyEntriesPage/modules/myEntriesUtils.tsx`, and
  `pages/scoring/components/ScoringEntryCard.tsx`.
- Schedule, scoring, and operational summaries:
  `components/schedule/ElementAccordion.tsx`, `ElementCard.tsx`,
  `StatusDot.tsx`, `components/scoring/ResultEntryNavigation.tsx`,
  `components/secretary/SecretaryClassDashboard.tsx`,
  `components/templates/secretary/RunOrderBoard.tsx`,
  `features/pipeline/components/ClassPipelineCard.tsx`,
  `ScoringDaySummary.tsx`, and
  `features/show-desk-people-roster/ShowDeskPeopleRoster.tsx`.
- Trial and show-map surfaces: `components/shows/tabs/TrialsTab.tsx`,
  `components/trials/TrialDetail/TrialClassesCards.tsx`,
  `TrialClassesTable.tsx`, `TrialEntriesTable.tsx`,
  `features/show-map/ShowMapStatusBadge.tsx`,
  `ShowMapSortableEntryRow.tsx`, `ShowMapStructureCells.tsx`,
  `pages/TrialDetailsPage.tsx`, and `pages/JudgeDashboard.tsx`.
- At-show and TV surfaces: `features/at-show/AtShowClassListPage.tsx`,
  `AtShowMyEntriesToday.tsx`, `slots/ClassDetailsPopoverSlot.tsx`,
  `pages/TVDisplay/TVClassCard.tsx`, and `TVMobileClassCard.tsx`.
- Shared/ringside renderers: `packages/ui/src/components/ClassCard/ClassCard.tsx`,
  `packages/ringside/src/components/DogCard.tsx`,
  `pages/EntryList/SortableEntryCard.tsx`,
  `SortableEntryCardComponents.tsx`, and
  `components/entryListHeaderHelpers.tsx`.

The inventoried presentation maps/helpers removed or reduced to operational
state derivation are `constants/live-status-config.ts`,
`types/check-in-types.ts`, `utils/entryManagementUtils.ts`,
`packages/core/src/constants/check-in-status.ts`,
`packages/core/src/constants/class-status.ts`,
`packages/core/src/helpers/class-display-status.ts`,
`packages/core/src/helpers/trial-status.ts`,
`packages/ringside/src/pages/ClassList/utils/statusFormatting.ts`, and
`packages/ringside/src/utils/classStatus.ts`.

The owning grammar and icon component now live in
`packages/ui/src/components/StatusIcon/`; myK9Show re-exports them from its
local status module, and ringside imports them directly from `@myk9/ui`.

`components/shows/EntryStatusBadge.tsx` was inventoried but is not an Entry
lifecycle renderer: it describes whether a Show is accepting entries. It stays
separate so “show availability” is not mislabeled as an Entry state.

### Explicitly out of scope

- Payment and refund status
- Show-entry availability (`accepting`, `closing_soon`, `closed`, and related
  values)
- Email-delivery status
- Promo-code status
- System-health and operator-alert status
- Scoring-result qualification (`qualified`, `not-qualified`, `excused`)
