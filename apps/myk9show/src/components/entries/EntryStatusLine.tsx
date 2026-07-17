import { StatusBadge } from '@/components/status';
import { cn } from '@/lib/utils';
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
 *  - SHAPE + COLOUR come from the shared status grammar using `mapEntryStatus`
 *    (the UI-enum projection), NOT from the derived `kind`. This is load-bearing:
 *    `getEntryStatusKind('paid')` is `accepted`, but a paid-yet-unreviewed entry
 *    stays in the PENDING / needs-review lane (the owner-approved "paid stays
 *    pending" decision). Keying the grammar by kind would silently move it out
 *    of that lane.
 */

export interface EntryStatusLineProps {
  /** Raw DB `entry_status` — drives the voice-aware wording. */
  rawEntryStatus?: string | null | undefined;
  /** Payment status (enum string) — only consulted for the refund fallback. */
  paymentStatus?: string | null | undefined;
  /** Explicit refund columns (secretary ground truth); optional on the exhibitor path. */
  refundAmount?: number | null | undefined;
  refundedAt?: string | null | undefined;
  /**
   * The only production caller (EntriesTableView, secretary-facing Entries
   * Management) always passes 'secretary'. Narrowed from a wider
   * 'secretary' | 'exhibitor' union after a grep for viewer="exhibitor"
   * usages of THIS component came up empty (S8.2 cleanup) — the exhibitor
   * voice itself is still live and tested via deriveEntryPresentation
   * (see ActivityTab.tsx), just not through this wrapper.
   */
  viewer: 'secretary';
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

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <StatusBadge family="entry" status={uiStatus} label={statusLine} className="w-fit" />
      {actionHint && <span className="text-xs text-muted-foreground">{actionHint}</span>}
    </div>
  );
}
