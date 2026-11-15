/**
 * The page-level summary above the My Shows filter section: the dog strip, and
 * the note that some balances could not be confirmed.
 *
 * Money owed is not summed here. Each show card states its own balance with its
 * own Pay button (MYK9-2030); the all-shows total was removed because two totals
 * on one page disagreed.
 *
 * Extracted from `index.tsx` when MYK9-417 made the filter section render for a
 * wait-list-only exhibitor while this stayed behind `entries.length > 0` — an
 * empty dog strip is the noise `FirstRunZeroState` exists to suppress.
 *
 * @module MyEntriesPage/modules/MyEntriesOverview
 */

import React from 'react';
import { countUpcomingClassesByDog, countUnpublishedClassesByDog } from './myEntriesStats.helpers';
import type { MyEntry } from './my-entries-types';
import { DogStrip, type DogStripDog } from '@/components/exhibitor/DogStrip';

/**
 * The shape `DogStrip` reads. Re-exported from the strip itself rather than
 * restated here — the page used to carry its own hand-written copy of this
 * object type inline in a cast, which is one more place to drift.
 */
export type OverviewDog = DogStripDog;

interface MyEntriesOverviewProps {
  /**
   * True when a balance is unknown or unresolved. Explains why a show card may
   * show less money than expected instead of implying nothing is owed.
   */
  moneyWarning?: boolean;
  dogs: OverviewDog[];
  /**
   * The one source of the dog strip's class counts. Required: an optional
   * default of `[]` rendered "No upcoming classes" on every dog with no type
   * error (MYK9-1210).
   */
  entries: MyEntry[];
  onAddDog: () => void;
  /**
   * False from lg, where My Dogs is its own tab beside My Shows and the strip would only push the
   * shows list down the page. Below lg the strip stays (docs/plan-sidebar-browse-pane.md, phase 4).
   */
  showDogStrip?: boolean;
}

export const MyEntriesOverview: React.FC<MyEntriesOverviewProps> = ({
  moneyWarning = false,
  dogs,
  entries,
  onAddDog,
  showDogStrip = true,
}) => {
  const scheduleCounts = React.useMemo(
    () => ({
      upcoming: countUpcomingClassesByDog(entries),
      unpublished: countUnpublishedClassesByDog(entries),
    }),
    [entries]
  );
  return (
    <>
      {moneyWarning && (
        <p role="status" className="text-sm text-muted-foreground">
          Some balances could not be confirmed yet; each show lists only the amounts we could
          confirm.
        </p>
      )}

      {/* order-3 on mobile keeps the dog strip below the primary entry workflow.
      On desktop every sibling is order-0, so source order keeps the dog strip
      above the entries. */}
      {showDogStrip && (
        <div className="max-[720px]:order-3">
          <DogStrip
            dogs={dogs}
            upcomingClassCountByDog={scheduleCounts.upcoming}
            unpublishedClassCountByDog={scheduleCounts.unpublished}
            onAddDog={onAddDog}
          />
        </div>
      )}
    </>
  );
};

export default MyEntriesOverview;
