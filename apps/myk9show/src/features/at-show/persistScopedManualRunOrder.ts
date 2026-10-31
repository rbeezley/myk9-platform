/**
 * persistScopedManualRunOrder — the drop handler's writer for a SINGLE-SECTION
 * manual drag on the combined A/B list. The drag hook hands back the dragged
 * slice; this turns it into the same preserve/renumber result the scoped presets
 * produce (`calculateManualScopedRunOrder`) and queues it through the one shared
 * writer, so it is offline-first and diffed exactly like every other run-order
 * write.
 */

import type { Entry, RenumberMode } from '@myk9/ringside';
import { calculateManualScopedRunOrder, storedRunOrder } from '@/lib/runOrderUtils';
import { persistRunOrderResults } from './persistRunOrderResults';

export interface ScopedManualDrag {
  section: string;
  renumberMode: RenumberMode;
}

export async function persistScopedManualRunOrder(
  allEntries: Entry[],
  reordered: Entry[],
  { section, renumberMode }: ScopedManualDrag
): Promise<void> {
  const results = calculateManualScopedRunOrder(
    allEntries.map(e => ({
      id: e.id,
      armband: e.armband != null ? String(e.armband) : null,
      section: e.section ?? null,
      runOrder: storedRunOrder(e),
    })),
    section,
    reordered.map(e => e.id),
    renumberMode
  );
  await persistRunOrderResults(results, allEntries);
}
