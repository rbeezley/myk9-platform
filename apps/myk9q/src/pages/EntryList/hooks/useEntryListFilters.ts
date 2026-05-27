// Re-export shim — implementation moved to @myk9/ringside in PR E2a.
// See packages/ringside/src/pages/EntryList/hooks/useEntryListFilters.ts and
// docs/plans/phase-0-ringside-package.md for the extraction plan.
//
// Existing callers (EntryList.tsx, CombinedEntryList.tsx, and the
// hooks/index.ts barrel) import from this path; the shim keeps that
// import surface intact while the implementation lives in the shared
// package.

export { useEntryListFilters } from '@myk9/ringside';
export type { TabType, SortType, SectionFilter } from '@myk9/ringside';
