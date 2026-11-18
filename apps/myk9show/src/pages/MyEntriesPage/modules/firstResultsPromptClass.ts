/**
 * MYK9-1944: "asked once" means one prompt on the page, not one per placed row.
 * The list picks the first row that would show it and hands only that row the
 * flag. A row whose result is still behind the "New result" reveal is skipped,
 * because that row shows the reveal button and must not spoil the placement.
 * A show whose results the club keeps private (or whose setting is unknown) is
 * skipped too: its row renders no prompt, so it must not take the page's only
 * slot from a later show that can ask (MYK9-2174).
 */
import { buildResultCardModel, buildResultCardVisibility } from '@/features/result-card';
import type { MyShowClass, MyShowGroup } from './groupEntriesByShow';
import type { MyEntry } from './my-entries-types';

export function isPlacedReleasedClass(cls: MyShowClass): boolean {
  return cls.isScored === true && Boolean(cls.resultsReleasedAt) && (cls.finalPlacement ?? 0) > 0;
}

export function firstResultsPromptClassId(
  groups: readonly MyShowGroup[],
  seenResultReleaseKeys: ReadonlySet<string>,
  revealEnabled: boolean,
  promptableShowIds: ReadonlySet<string>
): string | null {
  for (const group of groups) {
    if (!group.showId || !promptableShowIds.has(group.showId)) continue;
    const ordersById = new Map<string, MyEntry>(group.orders.map(order => [order.id, order]));
    for (const dog of group.dogs) {
      for (const cls of dog.classes) {
        if (!isPlacedReleasedClass(cls)) continue;
        const order = ordersById.get(cls.orderId);
        if (revealEnabled && order) {
          const model = buildResultCardModel({
            entry: { ...order, dogName: dog.dogName, classes: [cls] },
            classEntry: cls,
            visibility: buildResultCardVisibility(cls),
          });
          if (model && !seenResultReleaseKeys.has(model.releaseKey)) continue;
        }
        return cls.id;
      }
    }
  }
  return null;
}
