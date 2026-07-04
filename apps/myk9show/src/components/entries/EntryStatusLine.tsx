import { Badge } from '@/components/ui/badge';
import { chipClasses } from '@/components/base/chipClasses';
import type { ChipColor } from '@/components/base/Chip';
import { cn } from '@/lib/utils';
import { EntryStatus } from '@/types/show-registration-types';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { deriveEntryPresentation } from '@/services/entryDisplay/entryPresentation';

/**
 * ONE composed entry-status line + at most ONE action hint (UX walk
 * remediation 2.B(2)) — replaces the up-to-4-chip stacks on Entry Management
 * and My Entries.
 *
 * Two derivations, deliberately split:
 *  - WORDING comes from `deriveEntryPresentation`, which is voice-aware
 *    (a secretary sees "Needs review"; the exhibitor sees "Submitted — you're
 *    in") and folds the refund atom into the line ("Withdrawn · Refunded $30").
 *  - COLOUR comes from `mapEntryStatus` (the UI-enum projection), NOT from the
 *    derived `kind`. This is load-bearing: `getEntryStatusKind('paid')` is
 *    `accepted`, but a paid-yet-unreviewed entry stays in the amber PENDING /
 *    needs-review lane (the owner-approved "paid stays pending" decision).
 *    Colouring by kind would tint it teal and silently move it out of that lane.
 */

const STATUS_CHIP_COLOR: Record<EntryStatus, ChipColor> = {
  [EntryStatus.ACCEPTED]: 'teal',
  [EntryStatus.PENDING]: 'amber',
  [EntryStatus.WAITLIST]: 'amber',
  [EntryStatus.MISSING_INFO]: 'amber',
  [EntryStatus.MOVE_UP_REQUESTED]: 'amber',
  [EntryStatus.REJECTED]: 'red',
  [EntryStatus.CANCELLED]: 'stone',
  [EntryStatus.SCRATCHED]: 'stone',
  [EntryStatus.MOVED]: 'stone',
  [EntryStatus.COMPLETED]: 'blue',
};

export interface EntryStatusLineProps {
  /** Raw DB `entry_status` — drives the voice-aware wording. */
  rawEntryStatus?: string | null | undefined;
  /** Payment status (enum string) — only consulted for the refund fallback. */
  paymentStatus?: string | null | undefined;
  /** Explicit refund columns (secretary ground truth); optional on the exhibitor path. */
  refundAmount?: number | null | undefined;
  refundedAt?: string | null | undefined;
  viewer: 'secretary' | 'exhibitor';
  className?: string | undefined;
}

export function EntryStatusLine({
  rawEntryStatus,
  paymentStatus,
  refundAmount,
  refundedAt,
  viewer,
  className,
}: EntryStatusLineProps) {
  const { statusLine, actionHint } = deriveEntryPresentation(
    {
      entryStatus: rawEntryStatus ?? null,
      paymentStatus: paymentStatus ?? null,
      refundAmount: refundAmount ?? null,
      refundedAt: refundedAt ?? null,
    },
    { viewer }
  );

  const uiStatus = mapEntryStatus(rawEntryStatus ?? null);
  const color = STATUS_CHIP_COLOR[uiStatus] ?? 'stone';

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <Badge className={cn('w-fit border', chipClasses(color, { border: true }))}>
        {statusLine}
      </Badge>
      {actionHint && <span className="text-xs text-muted-foreground">{actionHint}</span>}
    </div>
  );
}
