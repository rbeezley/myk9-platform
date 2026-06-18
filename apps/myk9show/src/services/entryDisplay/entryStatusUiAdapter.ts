/**
 * Bridge: canonical entry-status KIND  →  the legacy UI `EntryStatus` enum.
 *
 * The selectors in `entryDisplaySelectors.ts` classify a raw `entry_status`
 * string into a presentation-neutral `EntryStatusKind` and intentionally do NOT
 * import the UI enum (different, lossier domain). This file is the one place
 * that projects a kind onto the UI `EntryStatus` the page + secretary surfaces
 * still key on (filters, predicates, badges). Keeping it INSIDE
 * `services/entryDisplay/` means every raw-string classification — including the
 * two owner-approved bucket overrides below — lives in this single directory,
 * which is exactly the invariant the guard test enforces.
 *
 * Why an adapter instead of using `statusKind` everywhere: the UI enum is lossy
 * (it folds `withdrawn`+`cancelled`, has no `in_ring`/`absent`), and the
 * exhibitor My Entries page intentionally buckets a *paid-but-unreviewed* entry
 * as PENDING. If the badge keyed off the raw `statusKind` (`paid → accepted`)
 * while the filter kept the projection (`paid → PENDING`), the surface would
 * disagree with itself — recreating the divergence this whole effort removes. So
 * both label and filter ride this one projection.
 */

import { EntryStatus } from '@/types/show-registration-types';
import { getEntryStatusKind, type EntryStatusKind } from './entryDisplaySelectors';

/**
 * Project a canonical kind onto the UI `EntryStatus` enum.
 *
 * `pending`, `in_ring`, `absent`, and `unknown` all land on PENDING: the UI enum
 * has no dedicated value for the day-of (`in_ring`) or `absent` kinds, and the
 * current UI buckets them — like any unrecognized status — into the "needs
 * review" lane. Preserved as-is (no UI enum widening in this pass).
 */
export function mapEntryStatusKindToUi(kind: EntryStatusKind): EntryStatus {
  switch (kind) {
    case 'accepted':
      return EntryStatus.ACCEPTED;
    case 'waitlist':
      return EntryStatus.WAITLIST;
    case 'completed':
      return EntryStatus.COMPLETED;
    case 'withdrawn':
      return EntryStatus.CANCELLED;
    case 'not_accepted':
      return EntryStatus.REJECTED;
    case 'scratched':
      return EntryStatus.SCRATCHED;
    case 'moved':
      return EntryStatus.MOVED;
    case 'move_up_requested':
      return EntryStatus.MOVE_UP_REQUESTED;
    case 'pending':
    case 'in_ring':
    case 'absent':
    case 'unknown':
    default:
      return EntryStatus.PENDING;
  }
}

/**
 * Map a raw DB `entry_status` string to the UI `EntryStatus` enum, deriving the
 * KIND from the single classifier so the page + secretary surfaces can never
 * disagree with the exhibitor tab.
 *
 * Owner-approved bucket overrides (2026-06-18) — both keep an entry in the
 * secretary's "Pending / needs review" lane rather than letting the classifier
 * move it out:
 *   - `paid`: payment is not acceptance; a paid entry still awaits the
 *     secretary's accept/reject decision. (Classifier kind would be `accepted`.)
 *   - `promotion-expired`: kept in the review lane, not surfaced as a decline.
 *     (Classifier kind would be `not_accepted`.)
 * These are the ONLY raw-string special cases; everything else flows through the
 * classifier. One intentional change from the prior hand-rolled switch: the
 * underscore `move_up_requested` spelling now resolves to MOVE_UP_REQUESTED like
 * its hyphen twin (it formerly fell through to PENDING).
 */
export function mapEntryStatus(status?: string | null): EntryStatus {
  if (status === 'paid' || status === 'promotion-expired') {
    return EntryStatus.PENDING;
  }
  return mapEntryStatusKindToUi(getEntryStatusKind(status));
}
