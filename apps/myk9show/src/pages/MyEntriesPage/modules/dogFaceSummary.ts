/**
 * The phase-aware model for a dog's always-visible line on `MyEntryCard`.
 *
 * The card used to name a dog and stop there: which classes it was entered in,
 * whether it was checked in, and whether it qualified all sat behind the
 * collapsed details panel. That put the two questions this page is actually
 * opened for — "am I checked in?" on Saturday morning, "did she qualify?" on
 * Saturday afternoon — one click away, every time.
 *
 * So the face line carries the answer for whichever phase a class is in:
 * before it runs, its check-in state; once it is scored, its result. One line,
 * two phases. This module is READ-ONLY derivation — it renders no controls and
 * opens no write path. Check-in writes stay on the summary band's single next
 * action and the per-class control inside the panel, both of which route
 * through the same `onCheckInClick(entry, cls)` handler
 * (see the INTENT comment in `MyEntryCard`).
 *
 * @module MyEntriesPage/modules/dogFaceSummary
 */

import type { CheckInStatus } from '@/types/check-in-types';
import type { ResultStatus } from '@/components/common/ResultBadge';
import type { EntryClass, MyEntry, MyEntryDogGroup } from './my-entries-types';

/**
 * Check-in states that mean the exhibitor has presented the dog. `at-gate`,
 * `come-to-gate` and `in-ring` are set ringside and all imply arrival;
 * `completed` means the run is done. `no-status` is the not-yet default, and
 * `pulled` / `conflict` are exceptions the exhibitor must not read as "done".
 */
const ARRIVED_STATUSES: ReadonlySet<CheckInStatus> = new Set<CheckInStatus>([
  'checked-in',
  'at-gate',
  'come-to-gate',
  'in-ring',
  'completed',
]);

/** Row statuses that take a class out of the day — it will not run. */
const WITHDRAWN_ROW_STATUSES: ReadonlySet<EntryClass['status']> = new Set<EntryClass['status']>([
  'scratched',
  'absent',
  'moved',
]);

export interface DogFaceClassView {
  id: string;
  name: string;
  /** Set once the class is scored — the face shows the result instead of check-in. */
  resultStatus?: ResultStatus | undefined;
  /** Official ribbon placement, only ever alongside a qualifying result. */
  finalPlacement?: number | undefined;
  /** The exhibitor has presented this dog for this class. Pre-run only. */
  arrived: boolean;
  /** This class still awaits its run, so its check-in state is meaningful. */
  awaitingRun: boolean;
}

export interface DogFaceSummary {
  classes: DogFaceClassView[];
  /** Classes still due to run — the denominator of the check-in count. */
  awaitingRun: number;
  /** How many of those the exhibitor has presented. */
  arrived: number;
  /** At least one class has a result, so the line is showing results. */
  hasResults: boolean;
}

function isArrived(status: CheckInStatus | undefined): boolean {
  return status !== undefined && ARRIVED_STATUSES.has(status);
}

/**
 * Build one dog's face line.
 *
 * An `unresolved` row is omitted entirely rather than named: its class
 * identity has not replicated, so there is no class name to print and no
 * check-in state that could be honest about which class it belongs to. It
 * remains visible in the expanded panel, which renders it as an explicit
 * still-syncing placeholder.
 */
export function buildDogFaceSummary(classes: EntryClass[]): DogFaceSummary {
  const views: DogFaceClassView[] = [];

  for (const cls of classes) {
    if (cls.unresolved) continue;
    const name = cls.name?.trim();
    if (!name) continue;

    const scored = Boolean(cls.isScored && cls.resultStatus);
    const awaitingRun = !scored && !WITHDRAWN_ROW_STATUSES.has(cls.status);

    views.push({
      id: cls.id,
      name,
      ...(scored ? { resultStatus: cls.resultStatus } : {}),
      ...(scored && cls.resultStatus === 'qualified' && (cls.finalPlacement ?? 0) >= 1
        ? { finalPlacement: cls.finalPlacement }
        : {}),
      arrived: awaitingRun && isArrived(cls.checkInStatus),
      awaitingRun,
    });
  }

  const awaiting = views.filter(v => v.awaitingRun);

  return {
    classes: views,
    awaitingRun: awaiting.length,
    arrived: awaiting.filter(v => v.arrived).length,
    hasResults: views.some(v => v.resultStatus !== undefined),
  };
}

/**
 * The one-line check-in tally, or `null` when it would say nothing useful.
 *
 * Suppressed when no class is still due to run (there is nothing to check in
 * for) and when the show has not opened check-in at all — a card that reads
 * "Checked in 0 of 3" days before the show is an accusation, not information.
 */
export function formatCheckInTally(summary: DogFaceSummary): string | null {
  if (summary.awaitingRun === 0) return null;
  if (summary.arrived === 0) return null;
  return `Checked in ${summary.arrived} of ${summary.awaitingRun}`;
}

/** Every class on the order, flattened, for a single-dog card's face line. */
export function dogGroupsForFace(entry: MyEntry): MyEntryDogGroup[] {
  return entry.dogs.length > 0
    ? entry.dogs
    : [
        {
          id: entry.id,
          dogId: entry.dogId,
          dogName: entry.dogName,
          ...(entry.armband ? { armband: entry.armband } : {}),
          classes: entry.classes,
          entryStatus: entry.entryStatus,
        },
      ];
}
