// Re-export shim — implementation moved to @myk9/ringside in PR E2a.
// See packages/ringside/src/pages/EntryList/sortableEntryCardUtils.ts and
// docs/plans/phase-0-ringside-package.md for the extraction plan.
//
// Existing callers (SortableEntryCard.tsx, SortableEntryCardComponents.tsx)
// import these helpers from this path; the shim keeps that import surface
// intact while the implementation lives in the shared package.

export type { StatusBorderClass, StatusConfig } from '@myk9/ringside';
export {
  normalizeResultText,
  getResultClassName,
  isNonQualifyingResult,
  getStatusBorderClass,
  getPlacementEmoji,
  getPlacementText,
  getStatusConfig,
  isNationalsCompetition,
  getDisplayTime,
} from '@myk9/ringside';
