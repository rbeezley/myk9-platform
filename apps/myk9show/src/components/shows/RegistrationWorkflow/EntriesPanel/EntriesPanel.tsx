import React, { useState } from 'react';
import { ChevronDown, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlatformFeeRates } from '@/store/cartStore.helpers';
import { usePlatformFeeRates } from '@/hooks/queries/usePlatformFeeRates';
import { useRegisterActionBar } from '@/hooks/useRegisterActionBar';
import type { PaymentMethod } from '@/types/show-registration-types';
import type { FeeCalculationResult } from '../PaymentStep/types';
import {
  computePaymentTotals,
  countPanelLines,
  formatAmountDue,
  sumPanelFeeCents,
  type PanelDogGroup,
} from './EntriesPanel.helpers';
import { EntriesPanelLines } from './EntriesPanel.lines';
import { useRemoveLineConfirm } from './EntriesPanel.removeConfirm';
import { EntriesPanelTotals } from './EntriesPanel.totals';

/** CSS variable the shell pads the content with so the bar covers nothing. */

export interface EntriesPanelProps {
  /** Itemised cart, from `groupCartByDogAndDay`. */
  groups: PanelDogGroup[];
  /** `payment` adds subtotal / service fee / total due and the remove controls. */
  variant?: 'default' | 'payment';
  /** Back/Next for the phone bar. The in-card footer hides below `lg`. */
  navigation?: React.ReactNode;
  paymentMethod?: PaymentMethod | '' | undefined;
  feeCalculation?: FeeCalculationResult | undefined;
  capacityReady?: boolean | undefined;
  capacityUnavailable?: boolean | undefined;
  waiveFees?: boolean | undefined;
  feeOverride?: number | null | undefined;
  waitlistClassIds?: ReadonlySet<string> | undefined;
  onRemoveLine?: ((dogId: string, classId: string) => void | Promise<void>) | undefined;
  removingLineKey?: string | null | undefined;
  /** Injectable for tests; defaults to the live platform-fee rates. */
  rates?: PlatformFeeRates | undefined;
}

/**
 * "Your entries" — the wizard's single running total.
 *
 * One component, two renderings of the SAME numbers: a sticky 320px aside from
 * `lg` up, and a fixed bottom bar below it that owns Back/Next (design.md
 * decisions 3 and 4). It is read-only over the cart store and the replicated
 * dog/class/trial records the wizard already holds — no new data path.
 *
 * INTENT: exhibitor — "that took 30 seconds". The cost of the entry is never
 * something you have to go and look for.
 */
export const EntriesPanel: React.FC<EntriesPanelProps> = ({
  groups,
  variant = 'default',
  navigation,
  paymentMethod = '',
  feeCalculation,
  capacityReady = true,
  capacityUnavailable,
  waiveFees = false,
  feeOverride = null,
  waitlistClassIds,
  onRemoveLine,
  removingLineKey,
  rates,
}) => {
  const liveRates = usePlatformFeeRates();
  const resolvedRates = rates ?? liveRates;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isPayment = variant === 'payment' && !!feeCalculation;
  const totals = isPayment
    ? computePaymentTotals({
        paymentMethod,
        feeCalculation,
        capacityReady,
        waiveFees,
        feeOverride,
        rates: resolvedRates,
      })
    : undefined;

  const classCount = countPanelLines(groups);
  // ALWAYS the sum of the lines rendered above it. `totals.entryFeeCents` is the
  // staff override when one is set, which made "Entry fees" and "Subtotal"
  // contradict the itemisation directly beneath them (Codex #2210 round 6 P2).
  // The override still decides what is OWED; it is reconciled as its own row.
  const entryFeeCents = sumPanelFeeCents(groups);
  const adjustmentCents = totals ? totals.entryFeeCents - entryFeeCents : 0;
  // The SAME string the totals block shows — one derivation, two widths.
  const headline = formatAmountDue({
    capacityReady,
    capacityUnavailable,
    totals,
    entryFeeCents,
    classCount,
  });

  // Removing a line asks first; `requestRemove` opens the confirmation and the
  // confirmation calls `onRemoveLine` with the very same arguments.
  const { requestRemove, dialog: removeConfirmDialog } = useRemoveLineConfirm(groups, onRemoveLine);
  const actionBarRef = useRegisterActionBar<HTMLDivElement>();
  const showRemove = isPayment && !!onRemoveLine;

  const lines = (
    <EntriesPanelLines
      groups={groups}
      capacityReady={capacityReady}
      capacityUnavailable={capacityUnavailable}
      waitlistClassIds={waitlistClassIds}
      {...(showRemove ? { onRemoveLine: requestRemove, removingLineKey } : {})}
    />
  );

  const totalsBlock = (
    <EntriesPanelTotals
      classCount={classCount}
      entryFeeCents={entryFeeCents}
      capacityReady={capacityReady}
      capacityUnavailable={capacityUnavailable}
      {...(isPayment ? { discounts: feeCalculation.discounts } : {})}
      {...(adjustmentCents !== 0 ? { adjustmentCents } : {})}
      {...(totals ? { payment: { totals, paymentMethod, rates: resolvedRates } } : {})}
    />
  );

  return (
    <>
      {/* The aside STRETCHES to the row height (the grid's default alignment,
          which is why the shell must not set `items-start`); the card inside it
          is the sticky element. A sticky box can only travel inside its
          containing block, so a content-height column would scroll away with
          the page however the sticky is written. */}
      <aside
        data-testid="entries-panel"
        aria-label="Your entries"
        className="hidden h-full lg:block"
      >
        <div className="sticky top-[calc(var(--registration-header-height,0px)+1.5rem)] space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Your entries</h2>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">{lines}</div>
          {totalsBlock}
        </div>
      </aside>

      <div
        // Sticky to the bottom of the wizard's OWN scrollport (the shell root),
        // not fixed to the viewport: it stays inside the main area, so it can never
        // paint over the app sidebar at tablet widths, and it occupies flow space
        // at the end of the step, so nothing needs to reserve its height.
        //
        // The PAGE does not need to reserve that height; the sonner stack does.
        // Back/Next live in this bar below 1024px and the toaster is docked to
        // the same bottom edge, so "Draft saved" landed on Next and intercepted
        // the tap (MYK9-517). Registering here is the mechanism that already
        // exists for exactly this (`actionBarStore`); it beats a route-scoped
        // toaster position, and it costs nothing at lg, where the bar is
        // display:none and therefore measures 0.
        ref={actionBarRef}
        data-testid="entries-panel-bar"
        aria-label="Your entries"
        className="sticky bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      >
        {detailsOpen && (
          <div
            id="entries-panel-details-list"
            data-testid="entries-panel-details-list"
            className="max-h-[45vh] space-y-4 overflow-y-auto border-b border-border px-4 py-3"
          >
            {lines}
            {totalsBlock}
          </div>
        )}
        <div className="flex min-h-11 items-center gap-2 px-4 py-1.5">
          <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span data-testid="entries-panel-total" className="min-w-0 truncate text-sm font-medium">
            {classCount} class{classCount === 1 ? '' : 'es'} ·{' '}
            <span className="tabular-nums">{headline}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="touch"
            data-testid="entries-panel-details"
            aria-expanded={detailsOpen}
            aria-controls="entries-panel-details-list"
            onClick={() => setDetailsOpen(open => !open)}
            className="ml-auto gap-1 px-2 text-sm"
          >
            Details
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')}
            />
          </Button>
        </div>
        {navigation && <div className="px-4 pb-3">{navigation}</div>}
      </div>

      {/* Once per panel: the line list above is rendered twice (aside + bar). */}
      {showRemove && removeConfirmDialog}
    </>
  );
};
