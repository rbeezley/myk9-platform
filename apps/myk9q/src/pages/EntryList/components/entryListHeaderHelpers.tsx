// Re-export shim — implementation moved to @myk9/ringside in PR E2d-2a.
// See packages/ringside/src/pages/EntryList/components/entryListHeaderHelpers.tsx
// and docs/plans/phase-0-ringside-package.md.
//
// New code should import from `@myk9/ringside` directly. This shim
// stays for in-tree EntryListHeader.tsx that hasn't been moved yet
// (E2d-2b).
//
// The disable below is preserved from the pre-shim host file: the
// shim re-exports both React components (ActionsDropdownMenu,
// TrialInfo, ClassStatusBadge, SectionsBadge) AND a plain function
// (`getStatusBadge`), which trips `react-refresh/only-export-components`.
// With `--max-warnings 0` in apps/myk9q's lint script, that warning
// fails CI. The function will fold back into ringside-internal usage
// once E2d-2b moves EntryListHeader.tsx and this shim's last consumer
// disappears.

/* eslint-disable react-refresh/only-export-components */

// `TrialInfo` is aliased at the @myk9/ringside root barrel as
// `EntryListTrialInfo` to avoid collision with the ClassList type of
// the same name. The shim renames it back so existing in-app imports
// (`import { TrialInfo } from './entryListHeaderHelpers'`) stay green.
export {
  ActionsDropdownMenu,
  EntryListTrialInfo as TrialInfo,
  ClassStatusBadge,
  SectionsBadge,
  getStatusBadge,
} from '@myk9/ringside';
export type {
  PrintOption,
  ActionsMenuConfig,
} from '@myk9/ringside';
