## Status inventory

### Entry family

Canonical lifecycle values from `types/entry-lifecycle.ts`:

`no-status`, `draft`, `submitted`, `paid`, `confirmed`, `scheduled`,
`checked-in`, `at-gate`, `in-ring`, `competing`, `completed`, `withdrawn`,
`not_accepted`, `scratched`, `absent`, `moved`, `scratch-requested`,
`move-up-requested`, `pending-payment`, `promotion-expired`.

Additional UI/check-in values rendered by existing entry surfaces:

`pending`, `accepted`, `waitlist`, `missing_info`, `come-to-gate`, `conflict`,
`pulled`, plus the live-view aliases `checked_in`, `not_checked_in`, `at_gate`,
and `in_ring`.

The registration UI enum aliases `not_accepted` as `not_accepted` and
withdrawal as `withdrawn`; those raw values therefore remain the grammar keys.

### Class family

Canonical values from `@myk9/core`:

`Scheduled`, `Upcoming`, `In Progress`, `Completed`, `Cancelled`.

Replicated/ringside aliases that are rendered before normalization:

`no-status`, `setup`, `briefing`, `break`, `in_progress`, `offline-scoring`,
`completed`, `not-started`, `in-progress`, `not_started`, `pending`, `paused`,
`cancelled`, and `start_time`.

Accepted legacy aliases from `LEGACY_STATUS_MAP` are normalized to the same
shape and semantic color as their canonical value. This includes casing and
separator variants such as `scheduled`, `in progress`, `InProgress`,
`inProgress`, `complete`, `canceled`, plus setup/publish workflow spellings.

### Trial family

Derived composite values from `deriveTrialCompositeStatus`:

`no-classes`, `not-started`, `in-progress`, `completed`.

### Existing renderers and maps

- `components/common/CheckInStatusBadge.tsx`
- `components/exhibitor/CheckInStatusBadge.tsx`
- `components/common/CheckInStatusIndicator.tsx`
- `components/classes/ClassResultsTable/StatusBadge.tsx`
- `components/entries/management/EntryListCard.tsx`
- `components/shows/tabs/ClassesTab.tsx`
- `components/shows/tabs/TrialsTab.tsx`
- `constants/live-status-config.ts`
- `types/check-in-types.ts`
- `utils/entryManagementUtils.ts`
- `packages/core/src/constants/check-in-status.ts`
- `packages/core/src/constants/class-status.ts`
- `packages/core/src/helpers/class-display-status.ts`
- `packages/core/src/helpers/trial-status.ts`
- `packages/ringside/src/pages/ClassList/utils/statusFormatting.ts`
- `packages/ringside/src/pages/EntryList/components/entryListHeaderHelpers.tsx`
- `packages/ringside/src/pages/EntryList/SortableEntryCardComponents.tsx`

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
