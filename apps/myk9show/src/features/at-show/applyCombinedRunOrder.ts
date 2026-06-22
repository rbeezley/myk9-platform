/**
 * applyCombinedRunOrder — preset run-order persistence for the COMBINED
 * Section A/B at-show entry list (`AtShowCombinedEntryListPage`). The
 * section-aware sibling of the single-class preset path in
 * `useAtShowEntryListHandlers.handleApplyRunOrder`.
 *
 * The combined RunOrderDialog contract is richer than the single class: it
 * hands back `(preset, scope, renumberMode)` so a preset can target one
 * section (A/B) or the whole class. We translate the wide ringside preset to
 * myK9Show's supported set, compute the new order with the section-aware
 * `calculateCombinedRunOrder`, then persist each entry's `run_order`.
 *
 * Persistence (`run_order` → `ringside_update_entry` SECURITY DEFINER RPC,
 * offline-first, allowed for assigned judges/stewards) is shared with the
 * single-class preset path via `persistRunOrderResults`. The manual drag path
 * lives separately (it receives an already-reordered slice); this owns the
 * preset path only.
 */

import type { Entry, RunOrderPreset, RunOrderScope, RenumberMode } from '@myk9/ringside';
import { calculateCombinedRunOrder, toMyK9ShowRunOrderPreset } from '@/lib/runOrderUtils';
import { persistRunOrderResults } from './persistRunOrderResults';

export async function applyCombinedRunOrder(
  entries: Entry[],
  preset: RunOrderPreset,
  scope: RunOrderScope = 'all',
  renumberMode: RenumberMode = 'renumber'
): Promise<void> {
  const results = calculateCombinedRunOrder(
    entries.map(e => ({
      id: e.id,
      armband: e.armband != null ? String(e.armband) : null,
      section: e.section ?? null,
    })),
    // ringside's union carries members myK9Show's dialog doesn't model
    // (notably `random-all` → `random`); a bare cast would let them fall to
    // the armband-asc default branch — silently wrong.
    toMyK9ShowRunOrderPreset(preset),
    scope,
    renumberMode
  );

  await persistRunOrderResults(results);
}
