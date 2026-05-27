/**
 * Shim — implementation moved to @myk9/ringside in PR E2a.
 *
 * See packages/ringside/src/pages/EntryList/hooks/useDragAndDropEntries.ts
 * and docs/plans/phase-0-ringside-package.md for the extraction plan.
 *
 * The package hook takes `updateExhibitorOrder` as a required injected
 * prop so it doesn't depend on app singletons. This shim binds the
 * app-side `updateExhibitorOrder` (from `services/entryService`) and
 * forwards the rest of the options through, so existing callers in
 * EntryList.tsx and CombinedEntryList.tsx keep working unchanged.
 *
 * When PR E2b adds a formal `services` slot on RingsideProvider, this
 * shim and its `updateExhibitorOrder` import disappear — the page-level
 * components inside ringside will pull the mutation via the slot.
 */

import { useDragAndDropEntries as useDragAndDropEntriesBase } from '@myk9/ringside';
import { updateExhibitorOrder } from '../../../services/entryService';
import type { Entry } from '../../../stores/entryStore';

type RingsideHookOptions = Parameters<typeof useDragAndDropEntriesBase>[0];

// Strip the injected mutation from the public app surface — callsites
// shouldn't need to know it gets wired here.
type AppHookOptions = Omit<RingsideHookOptions, 'updateExhibitorOrder'>;

export function useDragAndDropEntries(options: AppHookOptions) {
  return useDragAndDropEntriesBase({
    ...options,
    // Cast: entryService.updateExhibitorOrder returns Promise<boolean>;
    // the package's hook accepts Promise<unknown> so this is a widening.
    updateExhibitorOrder: updateExhibitorOrder as (entries: Entry[]) => Promise<unknown>,
  });
}
