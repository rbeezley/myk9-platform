// Re-export shim — implementation moved to @myk9/ringside in PR E2a.
// See packages/ringside/src/pages/EntryList/hooks/useResetScore.ts and
// docs/plans/phase-0-ringside-package.md for the extraction plan.
//
// `handleResetScoreHook` is still injected by the caller (EntryList.tsx /
// CombinedEntryList.tsx pass their app-side reset action). The shim is
// a straight re-export — no binding needed because the hook never
// imported any app singletons.

export { useResetScore } from '@myk9/ringside';
