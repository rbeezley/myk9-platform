/**
 * One class row inside a dog card: class name · when · state.
 *
 * The state column is the whole point of the row — it is either what already
 * happened (a result) or the one control the exhibitor can use right now
 * (check in / change). It never carries both, and it never hides behind a
 * disclosure: at the gate, on a phone, an affordance you have to expand is an
 * affordance you do not have.
 *
 * Split out of `MyShowDogCard.tsx` so both files stay well under the 500-line
 * limit; every predicate is derived by `deriveClassRowState` (D4) and the row
 * only chooses copy and colour from the `kind` it is handed.
 *
 * @module MyEntriesPage/modules/MyShowClassRow
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { ResultBadge } from '@/components/common/ResultBadge';
import { PlacementPill } from '@/components/base/PlacementPill';
import { getStatusDescriptor } from '@/components/status/statusIconGrammar';
import {
  buildResultCardModel,
  buildResultCardVisibility,
  type ResultCardModel,
} from '@/features/result-card';
import { formatWeekdayMonthDay } from '@/lib/format/dates';
import { formatTrialLabel } from './myEntriesUtils';
import { canLeaveClass } from './leaveClassRow';
import { deriveClassRowState, type ClassRowKind } from './myShowDogState';
import type { DayCheckInContext } from './dayCheckIn';
import type { MyShowClass } from './groupEntriesByShow';
import type { MyEntry } from './my-entries-types';

/**
 * Copy and colour per state, chosen from the status vocabulary the rest of the
 * app already uses (`ENTRY_STATUS_DESCRIPTORS`) rather than a second palette.
 * `undefined` means the row renders something other than a plain word.
 */
const STATE_WORDS: Partial<Record<ClassRowKind, { text: string; status: string }>> = {
  'in-ring': { text: 'in the ring', status: 'in-ring' },
  'at-gate': { text: 'at gate', status: 'at-gate' },
  'come-to-gate': { text: 'come to gate', status: 'come-to-gate' },
  conflict: { text: 'conflict', status: 'conflict' },
  // MYK9-632 resolves the MYK9-582 deviation recorded here. The owner's ruling
  // is that scratch and pull are the SAME act, so both rows say "pulled" — but
  // they are that act at different MOMENTS (day-of at the gate vs. before the
  // show), and the two descriptors are byte-identical (`complete` /
  // `text-muted-foreground`), so a bare capitalisation difference would leave
  // nothing for a screen reader to announce. The day-of row therefore says WHEN
  // rather than taking a second word for the same act.
  pulled: { text: 'pulled at the show', status: 'pulled' },
  withdrawn: { text: 'withdrawn', status: 'withdrawn' },
  scratched: { text: 'pulled', status: 'scratched' },
  // A move-up's source row went somewhere; it was not pulled.
  moved: { text: 'moved', status: 'moved' },
  'not-accepted': { text: 'not accepted', status: 'not_accepted' },
  'checked-in': { text: 'checked in', status: 'checked-in' },
};

/** States that carry a "change" link into the existing check-in dialog. */
const CHANGEABLE: ReadonlySet<ClassRowKind> = new Set<ClassRowKind>([
  'at-gate',
  'come-to-gate',
  'conflict',
  'pulled',
  'checked-in',
]);

const LINK_CLASS =
  'inline-flex min-h-[44px] items-center rounded font-medium text-primary hover:underline ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

export interface MyShowClassRowProps {
  cls: MyShowClass;
  dogName: string;
  /** The order that owns this class row — the dialogs and result card key off it. */
  order: MyEntry | undefined;
  /** Everything the day gate needs; shared across the whole card. */
  checkInContext: DayCheckInContext;
  /** Drop the trial number when the show only ever had one trial. */
  showTrialNumber: boolean;
  /**
   * The show this row belongs to. Empty during the partial-replication window,
   * which is a guard the leave control needs — see `canLeaveClass`.
   */
  showId: string;
  seenResultReleaseKeys: Set<string>;
  onCheckInClass: (cls: MyShowClass) => void;
  onOpenCheckIn: (order: MyEntry, cls: MyShowClass) => void;
  /**
   * MYK9-631 AC3: open the Withdraw-or-Pull chooser for THIS class. A row verb
   * rather than a menu item, because leaving a class is per class — and the
   * order picker that used to stand in front of it is what AC3 deletes.
   */
  onLeaveClass: (cls: MyShowClass, classWhen: string) => void;
  onResultRevealClick?: ((model: ResultCardModel) => void) | undefined;
}

export const MyShowClassRow: React.FC<MyShowClassRowProps> = ({
  cls,
  dogName,
  order,
  checkInContext,
  showTrialNumber,
  showId,
  seenResultReleaseKeys,
  onCheckInClass,
  onOpenCheckIn,
  onLeaveClass,
  onResultRevealClick,
}) => {
  const state = deriveClassRowState(cls, checkInContext);
  const word = STATE_WORDS[state.kind];

  const when = [
    cls.trialDate ? formatWeekdayMonthDay(cls.trialDate) : null,
    showTrialNumber && cls.trialNumber ? formatTrialLabel(cls.trialNumber) : null,
  ].filter((part): part is string => Boolean(part));

  // All four terms live in `leaveClassRow.ts` so the rule is drivable without a
  // render. Deliberately NOT gated on the entry-close deadline — see that
  // module and `docs/plan-exhibitor-show-actions.md` §4 Q9.
  const canLeave = canLeaveClass({
    kind: state.kind,
    isPastShow: checkInContext.isPastShow,
    unresolved: Boolean(cls.unresolved),
    hasShowId: showId !== '',
  });
  // The same discriminator the row already shows. Two trials of one show can
  // run a class with the SAME display name, which is why RemoveFromClassDialog
  // keys its body on the class id — but the destructive control and all three
  // of the chooser's steps were naming the class by that ambiguous string
  // alone, so a screen-reader user got two identical buttons.
  const classWhen = when.join(' · ');

  return (
    <div className="myk9-entries-class-row">
      <span className="myk9-entries-class-name text-foreground">{cls.name}</span>
      <span className="myk9-entries-class-when">{when.join(' · ')}</span>
      <span className="myk9-entries-class-state">
        {state.kind === 'result' && renderResult()}
        {word && (
          <span className={`font-semibold ${getStatusDescriptor('entry', word.status).colorClass}`}>
            {word.text}
          </span>
        )}
        {CHANGEABLE.has(state.kind) && order && (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <button
              type="button"
              onClick={() => onOpenCheckIn(order, cls)}
              aria-label={`Change ${dogName}'s check-in for ${cls.name}`}
              className={LINK_CLASS}
            >
              change
            </button>
          </>
        )}
        {state.kind === 'check-in-available' && (
          <button
            type="button"
            onClick={() => onCheckInClass(cls)}
            aria-label={`Check in ${dogName} for ${cls.name}`}
            className={LINK_CLASS}
          >
            Check in
          </button>
        )}
        {state.kind === 'opens-later' && (
          <span className="text-muted-foreground">Check in on the day</span>
        )}
        {/* Ahead of the trial day AND not eligible for check-in that day
            either way (pending review, self check-in disabled, unresolved
            class) — no control to offer and no promise to make. The
            dog-level status and the row's own date already say what is
            true. */}
        {state.kind === 'not-yet-eligible' && null}
        {/* The trial day, but no control for this row: self check-in closed by
            the secretary, entry not accepted yet, or an unresolved class. The
            secretary owns check-in in every one of those cases. */}
        {state.kind === 'closed-today' && (
          <span className="text-muted-foreground">check in with the secretary</span>
        )}
        {state.kind === 'not-run' && <span className="text-muted-foreground">not run</span>}
        {/* Settled without a score — absent, excused, withdrawn. The existing
            ResultBadge already names each one; only a row whose outcome was
            never recorded falls back to the bare word. */}
        {state.kind === 'absent' &&
          (cls.resultStatus ? (
            <ResultBadge resultStatus={cls.resultStatus} />
          ) : (
            <span className="text-muted-foreground">absent</span>
          ))}
        {/* The one destructive verb on this page, anchored to the row that
            owns it. Muted rather than `text-destructive`: it sits beside a
            check-in control the exhibitor uses far more often, and the
            chooser it opens is where the consequences are stated. */}
        {canLeave && (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <button
              type="button"
              onClick={() => onLeaveClass(cls, classWhen)}
              // WCAG 2.5.3 Label in Name: the accessible name has to START with
              // the visible words, or a voice-control user saying "click Leave
              // class" does not reach the one destructive control on the page.
              // The two sibling controls this file renders already satisfy it
              // ("Check in …", "Change …"); this one did not.
              aria-label={
                classWhen
                  ? `Leave class: withdraw or pull ${dogName} from ${cls.name}, ${classWhen}`
                  : `Leave class: withdraw or pull ${dogName} from ${cls.name}`
              }
              className={`${LINK_CLASS} text-muted-foreground`}
            >
              Leave class…
            </button>
          </>
        )}
      </span>
    </div>
  );

  /**
   * A scored row. An unseen release replaces the static result with the same
   * "New result" reveal button the old details panel offered — the reveal is
   * the moment this page exists for, and a result the exhibitor has not opened
   * yet must not be spoiled by the row beside it.
   */
  function renderResult() {
    const resultModel = order
      ? buildResultCardModel({
          entry: { ...order, dogName, classes: [cls] },
          classEntry: cls,
          visibility: buildResultCardVisibility(cls),
        })
      : null;
    const unseen = resultModel != null && !seenResultReleaseKeys.has(resultModel.releaseKey);

    if (resultModel && unseen && onResultRevealClick) {
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onResultRevealClick(resultModel)}
          className="min-h-[44px] shrink-0 border-primary text-primary"
        >
          New result
        </Button>
      );
    }

    return (
      <>
        {cls.resultStatus && <ResultBadge resultStatus={cls.resultStatus} />}
        {cls.resultsReleasedAt &&
        cls.resultStatus === 'qualified' &&
        cls.finalPlacement != null &&
        cls.finalPlacement >= 1 ? (
          <PlacementPill placement={cls.finalPlacement} size="sm" />
        ) : null}
        {!cls.resultsReleasedAt && <span className="text-muted-foreground">preliminary</span>}
        {cls.searchTimeSeconds != null && (
          <span className="tabular-nums text-muted-foreground">
            {cls.searchTimeSeconds.toFixed(1)}s
          </span>
        )}
        {cls.totalFaults != null && cls.totalFaults > 0 && (
          <span className="font-medium text-warning">{cls.totalFaults}F</span>
        )}
        {resultModel && onResultRevealClick && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onResultRevealClick(resultModel)}
            className="min-h-[44px] shrink-0 border-border text-muted-foreground"
          >
            Result card
          </Button>
        )}
      </>
    );
  }
};
