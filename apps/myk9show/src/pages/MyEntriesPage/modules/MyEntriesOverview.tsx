/**
 * The two page-level summaries above the My Shows filter section: the
 * amount-due stat row and the dog strip.
 *
 * Extracted from `index.tsx` when MYK9-417 made the filter section render for a
 * wait-list-only exhibitor while these two stayed behind `entries.length > 0` —
 * a stat row of zeros and an empty dog strip are the noise `FirstRunZeroState`
 * exists to suppress. Lifting the pair out keeps the page shell under the
 * 500-line ratchet and puts their mobile ordering in one place.
 *
 * @module MyEntriesPage/modules/MyEntriesOverview
 */

import React from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { DogStrip, type DogStripDog } from '@/components/exhibitor/DogStrip';

/**
 * The shape `DogStrip` reads. Re-exported from the strip itself rather than
 * restated here — the page used to carry its own hand-written copy of this
 * object type inline in a cast, which is one more place to drift.
 */
export type OverviewDog = DogStripDog;

interface MyEntriesOverviewProps {
  /**
   * False when the balance summary is `unknown`. It hides the STAT ROW only.
   * Gating the whole component also removed the dog strip and its "Add a dog"
   * entry point — neither of which is money — from an exhibitor whose read
   * happened to be unconfirmed (MYK9-629 round 1).
   */
  showMoney: boolean;
  /** Explains why the money row is withheld instead of implying no balance. */
  moneyWarning?: boolean;
  currentFees: number;
  amountDue: number;
  hasPastBalance: boolean;
  /** Targets the SAME debt `amountDue` describes — see the page's derivation. */
  currentFeesHref: string;
  onNavigate: NavigateFunction;
  dogs: OverviewDog[];
  upcomingClassCountByDog: Record<string, number>;
  onAddDog: () => void;
}

export const MyEntriesOverview: React.FC<MyEntriesOverviewProps> = ({
  showMoney,
  moneyWarning = false,
  currentFees,
  amountDue,
  hasPastBalance,
  currentFeesHref,
  onNavigate,
  dogs,
  upcomingClassCountByDog,
  onAddDog,
}) => (
  <>
    {showMoney && (
      <div data-testid="entry-fee-balance" className="max-[720px]:order-2">
        <CompactStatsRow
          currentFees={currentFees}
          amountDue={amountDue}
          hasPastBalance={hasPastBalance}
          currentFeesHref={currentFeesHref}
          onNavigate={onNavigate}
        />
      </div>
    )}
    {moneyWarning && (
      <p role="status" className="text-sm text-muted-foreground">
        Some balances could not be confirmed with the server yet; the money total covers
        confirmed balances only.
      </p>
    )}

    {/* order-3 on mobile keeps the dog strip below the primary entry workflow.
      On desktop every sibling is order-0, so source order keeps the balance and
      dog strip above the entries. */}
    <div className="max-[720px]:order-3">
      <DogStrip dogs={dogs} upcomingClassCountByDog={upcomingClassCountByDog} onAddDog={onAddDog} />
    </div>
  </>
);

export default MyEntriesOverview;
