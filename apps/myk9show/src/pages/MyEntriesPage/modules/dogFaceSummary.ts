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

/**
 * Check-in states the exhibitor may set that mean "this dog will not run in
 * this class". `pulled` is a CHECK-IN status, not a row status, so it is
 * invisible to WITHDRAWN_ROW_STATUSES below — without this, pulling one of
 * three classes left the tally reading "Checked in 2 of 3" forever, nagging
 * about a class the exhibitor had already withdrawn from.
 */
const PULLED_STATUSES: ReadonlySet<CheckInStatus> = new Set<CheckInStatus>(['pulled']);

/** Row statuses that take a class out of the day — it will not run. */
const WITHDRAWN_ROW_STATUSES: ReadonlySet<EntryClass['status']> = new Set<EntryClass['status']>([
  'scratched',
  'absent',
  'moved',
]);

/**
 * What the face shows for a class that has not run yet. Mirrors the subset of
 * check-in statuses an exhibitor can actually set (see
 * EXHIBITOR_SELECTABLE_STATUSES in CheckInStatusDialog); `arrived` also covers
 * the ringside-set states, since a dog the ring has called is certainly there.
 */
export type DogFaceCheckInState = 'arrived' | 'pulled' | 'conflict' | 'none';

export interface DogFaceClassView {
  id: string;
  name: string;
  /** Set once the class is scored — the face shows the result instead of check-in. */
  resultStatus?: ResultStatus | undefined;
  /** Official ribbon placement, only ever alongside a qualifying result. */
  finalPlacement?: number | undefined;
  /** Search time in seconds, shown beside the result. */
  searchTimeSeconds?: number | undefined;
  /** Fault count, shown beside the result only when non-zero. */
  totalFaults?: number | undefined;
  /** The exhibitor has presented this dog for this class. Pre-run only. */
  arrived: boolean;
  /**
   * The pre-run check-in state, so `pulled` and `conflict` are VISIBLE on the
   * face rather than looking identical to a class nobody has checked in for.
   */
  checkInState: DogFaceCheckInState;
  /** This class still awaits its run, so its check-in state is meaningful. */
  awaitingRun: boolean;
}

/**
 * One trial's worth of a dog's classes.
 *
 * A show can run TWO trials on the same day with the same class list, so a
 * flat list of names would render "Novice Container, Novice Container" with
 * nothing to tell them apart — and a check mark on one of them would be
 * unattributable. Classes are therefore grouped by (trial date, trial
 * number), which is the pair that identifies a trial.
 */
export interface DogFaceTrialGroup {
  /** Stable identity for the group; also the React key. */
  key: string;
  trialNumber?: string | undefined;
  trialDate?: Date | undefined;
  classes: DogFaceClassView[];
}

export interface DogFaceSummary {
  groups: DogFaceTrialGroup[];
  /**
   * Whether the groups must be labelled with their trial. False for the
   * ordinary single-trial order, where a heading would restate what the card
   * already says; true the moment there is more than one trial to tell apart.
   */
  showTrialHeadings: boolean;
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
  const views: { view: DogFaceClassView; cls: EntryClass }[] = [];

  for (const cls of classes) {
    if (cls.unresolved) continue;
    const name = cls.name?.trim();
    if (!name) continue;

    const scored = Boolean(cls.isScored && cls.resultStatus);
    const pulled = cls.checkInStatus !== undefined && PULLED_STATUSES.has(cls.checkInStatus);
    // A pulled class will not run, so it is not something the exhibitor still
    // owes a check-in for — it must not sit in the tally's denominator.
    const awaitingRun = !scored && !pulled && !WITHDRAWN_ROW_STATUSES.has(cls.status);
    const arrived = awaitingRun && isArrived(cls.checkInStatus);

    const checkInState: DogFaceCheckInState = scored
      ? 'none'
      : pulled
        ? 'pulled'
        : cls.checkInStatus === 'conflict'
          ? 'conflict'
          : arrived
            ? 'arrived'
            : 'none';

    views.push({
      cls,
      view: {
        id: cls.id,
        name,
        ...(scored ? { resultStatus: cls.resultStatus } : {}),
        ...(scored && cls.resultStatus === 'qualified' && (cls.finalPlacement ?? 0) >= 1
          ? { finalPlacement: cls.finalPlacement }
          : {}),
        // Time and faults belong to the result, so they ride with it onto the
        // face. Faults only when there are any — "0F" is noise on a clean run.
        ...(scored && cls.searchTimeSeconds != null
          ? { searchTimeSeconds: cls.searchTimeSeconds }
          : {}),
        ...(scored && cls.totalFaults != null && cls.totalFaults > 0
          ? { totalFaults: cls.totalFaults }
          : {}),
        arrived,
        checkInState,
        awaitingRun,
      },
    });
  }

  // Group by the (date, number) pair that identifies a trial. Insertion order
  // is preserved so the groups appear in the order the rows arrived, then
  // sorted by date; a class carrying no trial information at all forms its own
  // group rather than being folded into a real trial's.
  const groups = new Map<string, DogFaceTrialGroup>();
  for (const { view, cls } of views) {
    const dateKey = cls.trialDate ? String(cls.trialDate.getTime()) : 'no-date';
    const trialKey = cls.trialNumber ?? 'no-trial';
    const key = `${dateKey}::${trialKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.classes.push(view);
    } else {
      groups.set(key, {
        key,
        ...(cls.trialNumber ? { trialNumber: cls.trialNumber } : {}),
        ...(cls.trialDate ? { trialDate: cls.trialDate } : {}),
        classes: [view],
      });
    }
  }

  const ordered = Array.from(groups.values()).sort((a, b) => {
    // Undated groups sort last; otherwise chronological, then by trial number.
    const at = a.trialDate?.getTime();
    const bt = b.trialDate?.getTime();
    if (at !== bt) {
      if (at === undefined) return 1;
      if (bt === undefined) return -1;
      return at - bt;
    }
    return (a.trialNumber ?? '').localeCompare(b.trialNumber ?? '', undefined, { numeric: true });
  });

  const all = views.map(v => v.view);
  const awaiting = all.filter(v => v.awaitingRun);

  return {
    groups: ordered,
    // Only label when there is genuinely something to tell apart.
    showTrialHeadings: ordered.length > 1,
    awaitingRun: awaiting.length,
    arrived: awaiting.filter(v => v.arrived).length,
    hasResults: all.some(v => v.resultStatus !== undefined),
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
