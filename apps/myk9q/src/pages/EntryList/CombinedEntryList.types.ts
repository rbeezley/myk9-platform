// Re-export shim — implementation moved to @myk9/ringside in PR E2a.
// See packages/ringside/src/pages/EntryList/types.ts and
// docs/plans/phase-0-ringside-package.md for the extraction plan.
//
// The package re-exports `SortOrder` and `PrintDialogType` /
// `PrintDialogState` under EntryList-prefixed names to avoid collision
// with the equivalent ClassList types at the package root. This shim
// renames them back to their pre-move names so existing in-app imports
// (e.g. `import type { SortOrder, PrintDialogState } from './CombinedEntryList.types'`)
// stay green without callsite changes.

export type {
  EntryListSortOrder as SortOrder,
  EntryListPrintDialogType as PrintDialogType,
  EntryListPrintDialogState as PrintDialogState,
  ResetConfirmState,
  OrgData,
} from '@myk9/ringside';
