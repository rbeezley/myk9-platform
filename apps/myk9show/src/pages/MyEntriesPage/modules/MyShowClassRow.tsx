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

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ResultsPublicPrompt } from '@/components/preferences/ResultsPublicPrompt';
import { ResultBadge } from '@/components/common/ResultBadge';
import { getStatusDescriptor } from '@/components/status/statusIconGrammar';
import {
  buildResultCardModel,
  buildResultCardVisibility,
  formatOwnResultLine,
  type ResultCardModel,
} from '@/features/result-card';
import { formatWeekdayMonthDay } from '@/lib/format/dates';
import { formatTrialLabel } from '@myk9/core';
import { ClassRequirementsDialog } from '@/features/at-show/slots/RequirementsDialog';
import { formatStartTime } from '@/components/schedule/schedule-timeline.utils';
import { canLeaveClass } from './leaveClassRow';
import { canChangeClass } from './changeClassRow';
import { ClassChangeRowControls } from './ClassChangeRowControls';
import type { ClassRowKind } from './myShowDogState';
import { CLASS_ROW_TEXT, classRowDisplay } from './classRowStatusText';
import type { DayCheckInContext } from './dayCheckIn';
import type { MyShowClass } from './groupEntriesByShow';
import type { MyEntry } from './my-entries-types';

/**
 * Kinds of a class the dog has yet to run: the running order means something for these only. A
 * posted order (`runOrder` set) is the secretary's published number, shown as a plain fact. It
 * is not a place in line: that needs the day's progress and stays in Ringside (MYK9-2138).
 */
const RUN_ORDER_KINDS: ReadonlySet<ClassRowKind> = new Set<ClassRowKind>([
  'not-yet-eligible',
  'opens-later',
  'check-in-available',
  'closed-today',
  'checked-in',
  'at-gate',
  'come-to-gate',
]);

function runOrderText(kind: ClassRowKind, runOrder: number | undefined): string | null {
  return RUN_ORDER_KINDS.has(kind) && runOrder != null && runOrder > 0
    ? `Running order ${runOrder}`
    : null;
}

/** States that carry a "change" link into the existing check-in dialog. */
const CHANGEABLE: ReadonlySet<ClassRowKind> = new Set<ClassRowKind>([
  'at-gate',
  'come-to-gate',
  'conflict',
  'pulled',
  'checked-in',
]);

const LINK_BASE_CLASS =
  'inline-flex min-h-[44px] items-center rounded font-medium ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

/** Brand link colour: "change" and "Check in". */
const LINK_CLASS = `${LINK_BASE_CLASS} text-primary hover:underline`;

/**
 * The leave verb: the status text's grey, underlined at rest so it still reads
 * as a link. Its own variant rather than `LINK_CLASS` plus an override, because
 * two colour utilities on one element are decided by stylesheet order, and
 * `text-primary` won.
 */
const MUTED_LINK_CLASS = `${LINK_BASE_CLASS} text-muted-foreground underline`;

export interface MyShowClassRowProps {
  cls: MyShowClass;
  /** The class's judge, when known; nothing renders otherwise. */
  judgeName?: string | undefined;
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
  /** This row is the page's one place to ask the results-public question (MYK9-1944). */
  showResultsPrompt?: boolean | undefined;
  onCheckInClass: (cls: MyShowClass) => void;
  onOpenCheckIn: (order: MyEntry, cls: MyShowClass) => void;
  /**
   * MYK9-631 AC3: open the Withdraw-or-Pull chooser for THIS class. A row verb
   * rather than a menu item, because leaving a class is per class — and the
   * order picker that used to stand in front of it is what AC3 deletes.
   */
  onLeaveClass: (cls: MyShowClass, classWhen: string) => void;
  /** Every class this dog is entered in at this show: the class change sheet skips them. */
  dogClassIds?: ReadonlySet<string> | undefined;
  /** Re-read the entries after a class change request is sent or taken back. */
  onClassChanged?: (() => void | Promise<void>) | undefined;
  onResultRevealClick?: ((model: ResultCardModel) => void) | undefined;
}

const NO_CLASS_IDS: ReadonlySet<string> = new Set();

export const MyShowClassRow: React.FC<MyShowClassRowProps> = ({
  cls,
  judgeName,
  dogName,
  order,
  checkInContext,
  showTrialNumber,
  showId,
  seenResultReleaseKeys,
  showResultsPrompt = false,
  onCheckInClass,
  onOpenCheckIn,
  onLeaveClass,
  dogClassIds = NO_CLASS_IDS,
  onClassChanged,
  onResultRevealClick,
}) => {
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const state = classRowDisplay(cls, checkInContext);
  const word = state.word;

  const when = [
    cls.trialDate ? formatWeekdayMonthDay(cls.trialDate) : null,
    showTrialNumber && (cls.trialName || cls.trialNumber)
      ? formatTrialLabel({ name: cls.trialName, trialNumber: cls.trialNumber })
      : null,
  ].filter((part): part is string => Boolean(part));
  // Judge and time sit on their own line: both are optional and the judge's
  // name can be long, while the date stays on one line (never "TBD").
  const detail = [
    judgeName ? `Judge ${judgeName}` : null,
    formatStartTime(cls.startTime ?? null),
    runOrderText(state.kind, cls.runOrder),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  // All five terms live in `leaveClassRow.ts` so the rule is drivable without a
  // render. Deliberately NOT gated on the entry-close deadline — see that
  // module and `docs/plan-exhibitor-show-actions.md` §4 Q9.
  const canLeave = canLeaveClass({
    kind: state.kind,
    isPastShow: checkInContext.isPastShow,
    isShowClosedOut: Boolean(order?.isShowClosedOut),
    unresolved: Boolean(cls.unresolved),
    hasShowId: showId !== '',
  });
  const canChange = canChangeClass({
    kind: state.kind,
    isPastShow: checkInContext.isPastShow,
    isShowClosedOut: Boolean(order?.isShowClosedOut),
    unresolved: Boolean(cls.unresolved),
    hasShowId: showId !== '',
    entryStatus: cls.entryStatus,
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
      <span className="myk9-entries-class-when">
        {classWhen}
        {detail && <span className="myk9-entries-class-when-detail">{detail}</span>}
      </span>
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
            {CLASS_ROW_TEXT.checkIn}
          </button>
        )}
        {state.kind === 'opens-later' && (
          <span className="text-muted-foreground">{CLASS_ROW_TEXT.opensLater}</span>
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
          <span className="text-muted-foreground">{CLASS_ROW_TEXT.closedToday}</span>
        )}
        {state.kind === 'day-unknown' && (
          <span className="text-muted-foreground">{CLASS_ROW_TEXT.dayUnknown}</span>
        )}
        {state.kind === 'not-run' && (
          <span className="text-muted-foreground">{CLASS_ROW_TEXT.notRun}</span>
        )}
        {/* Settled without a score — absent, excused, withdrawn. The existing
            ResultBadge already names each one; only a row whose outcome was
            never recorded falls back to the bare word. */}
        {state.kind === 'absent' &&
          (state.outcomeStatus ? (
            <ResultBadge resultStatus={state.outcomeStatus} />
          ) : (
            <span className="text-muted-foreground">{CLASS_ROW_TEXT.absent}</span>
          ))}
        {/* The one destructive verb on this page, anchored to the row that
            owns it. Muted rather than `text-destructive`: it sits beside a
            check-in control the exhibitor uses far more often, and the
            chooser it opens is where the consequences are stated. */}
        <ClassChangeRowControls
          cls={cls}
          dogName={dogName}
          showId={showId}
          dogClassIds={dogClassIds}
          canChange={canChange}
          onChanged={onClassChanged}
        />
        {/* MYK9-2137: the same read-only Requirements view Ringside's class card opens. */}
        {cls.classId && !cls.unresolved && (
          <>
            {/* First child of the row means nothing precedes it: no dangling dot. */}
            <span aria-hidden="true" className="text-muted-foreground first:hidden">
              ·
            </span>
            <button
              type="button"
              onClick={() => setRequirementsOpen(true)}
              aria-label={`Requirements for ${cls.name}`}
              aria-haspopup="dialog"
              className={LINK_CLASS}
            >
              requirements
            </button>
          </>
        )}
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
                  ? `Pull or withdraw: ${dogName} from ${cls.name}, ${classWhen}`
                  : `Pull or withdraw: ${dogName} from ${cls.name}`
              }
              className={MUTED_LINK_CLASS}
            >
              Pull or withdraw…
            </button>
          </>
        )}
      </span>
      {requirementsOpen && cls.classId && (
        <ClassRequirementsDialog
          isOpen
          onClose={() => setRequirementsOpen(false)}
          showEntryCount={false}
          perAreaFromClass
          {...(cls.trialTimezone ? { timeZone: cls.trialTimezone } : {})}
          classData={{
            id: cls.classId,
            element: '',
            level: '',
            class_name: cls.name,
            entry_count: 0,
          }}
        />
      )}
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

    // One sentence, shared with Ringside: "Qualified, 0:52.40, 2nd of 14". A placement is
    // claimed only after release; before it the line carries "preliminary" and none.
    const resultLine = formatOwnResultLine({
      resultStatus: cls.resultStatus,
      searchTimeSeconds: cls.searchTimeSeconds,
      finalPlacement: cls.finalPlacement,
      resultsReleasedAt: cls.resultsReleasedAt,
      ranCount: cls.classScoredCount,
    });

    return (
      <>
        {resultLine && (
          <span className="font-medium tabular-nums" data-testid="own-result-line">
            {resultLine.text}
          </span>
        )}
        {resultLine?.isPreliminary && <span className="text-muted-foreground">preliminary</span>}
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
        {showResultsPrompt && showId !== '' && (
          <ResultsPublicPrompt
            showId={showId}
            dogName={dogName}
            className={cls.name}
            placement={cls.finalPlacement}
            handlerName={cls.handler}
            handlerId={cls.handlerId}
            ownerId={cls.dogOwnerId}
            coOwnerId={cls.dogCoOwnerId}
            isReleased={Boolean(cls.resultsReleasedAt)}
          />
        )}
      </>
    );
  }
};
