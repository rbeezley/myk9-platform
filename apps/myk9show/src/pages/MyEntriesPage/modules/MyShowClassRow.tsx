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
  pulled: { text: 'pulled', status: 'pulled' },
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
  seenResultReleaseKeys: Set<string>;
  onCheckInClass: (cls: MyShowClass) => void;
  onOpenCheckIn: (order: MyEntry, cls: MyShowClass) => void;
  onResultRevealClick?: ((model: ResultCardModel) => void) | undefined;
}

export const MyShowClassRow: React.FC<MyShowClassRowProps> = ({
  cls,
  dogName,
  order,
  checkInContext,
  showTrialNumber,
  seenResultReleaseKeys,
  onCheckInClass,
  onOpenCheckIn,
  onResultRevealClick,
}) => {
  const state = deriveClassRowState(cls, checkInContext);
  const word = STATE_WORDS[state.kind];

  const when = [
    cls.trialDate ? formatWeekdayMonthDay(cls.trialDate) : null,
    showTrialNumber && cls.trialNumber ? formatTrialLabel(cls.trialNumber) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="myk9-entries-class-row">
      <span className="break-words text-foreground">{cls.name}</span>
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
              aria-label={`Change check-in for ${cls.name}`}
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
          <span className="text-muted-foreground">
            {state.weekday ? `opens ${state.weekday}` : 'not yet open'}
          </span>
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
