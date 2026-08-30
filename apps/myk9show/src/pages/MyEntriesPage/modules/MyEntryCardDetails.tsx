/**
 * Expanded "Show details" panel for `MyEntryCard` — confirmation number,
 * post-deadline "Entries close" line, class rows (results, placements,
 * per-class check-in controls), and secondary actions. Split out of
 * `MyEntryCard.tsx` to keep both files under the 500-line limit; all
 * predicates are computed by the card and passed down so behavior stays
 * identical.
 *
 * @module MyEntriesPage/modules/MyEntryCardDetails
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ListOrdered,
  Eye,
  Edit,
  Download,
  User,
  MessageSquare,
} from 'lucide-react';
import { ResultBadge } from '@/components/common/ResultBadge';
import { PlacementPill } from '@/components/base/PlacementPill';
import {
  buildResultCardModel,
  buildResultCardVisibility,
  type ResultCardModel,
} from '@/features/result-card';
import { formatConfirmationNumberLabel } from '@/features/registration/confirmationNumberDisplay';
import type { MyEntry, EntryClass } from './my-entries-types';
import { formatTrialLabel } from './myEntriesUtils';
import { formatMonthDay, formatShortDate } from '@/lib/format/dates';
import { toDogEntryView } from './myEntryDogView';
import { isClassCheckInEligible } from './entryNextAction';
import { getSharedClassFacts } from './classGroupFacts';

interface MyEntryCardDetailsProps {
  entry: MyEntry;
  /** `id` matching the toggle's `aria-controls`. */
  detailsId: string;
  isTerminalStatus: boolean;
  canEdit: boolean;
  canViewRunOrder: boolean;
  canRequestPostDeadlineHelp: boolean;
  canShowReceipt: boolean;
  /** When the summary band's next action is already "View Show", omit the duplicate link here. */
  summaryShowsViewShow: boolean;
  selfCheckinByClassId: Record<string, boolean>;
  seenResultReleaseKeys: Set<string>;
  onCheckInClick: (entry: MyEntry, classEntry: EntryClass) => void;
  onEditClick: (entry: MyEntry) => void;
  onReceiptClick: (entry: MyEntry) => void;
  onResultRevealClick?: ((model: ResultCardModel) => void) | undefined;
  /** Opens the card's calendar dialog; the control lives here, the dialog on the card. */
  onAddToCalendarClick: () => void;
}

export const MyEntryCardDetails: React.FC<MyEntryCardDetailsProps> = ({
  entry,
  detailsId,
  isTerminalStatus,
  canEdit,
  canViewRunOrder,
  canRequestPostDeadlineHelp,
  canShowReceipt,
  summaryShowsViewShow,
  selfCheckinByClassId,
  seenResultReleaseKeys,
  onCheckInClick,
  onEditClick,
  onReceiptClick,
  onResultRevealClick,
  onAddToCalendarClick,
}) => {
  // Edit/Receipt dialogs still expect a single `dogName` paired with `classes`
  // — but a multi-dog order's `classes` spans every dog. Passing the raw
  // order would misattribute other dogs' classes to the lead dog's name, so
  // multi-dog orders get a joined name and no single armband instead. The
  // grouped model itself (stats/filters read top-level fields) is untouched.
  const editReceiptEntry: MyEntry =
    entry.dogs.length > 1
      ? { ...entry, dogName: entry.dogs.map(dog => dog.dogName).join(' & '), armband: undefined }
      : entry;

  // Facts common to every class row on this order, hoisted so they are stated
  // once rather than repeated per row. A three-class order used to print the
  // trial date three times below the show date, the trial number three times,
  // and the handler three times.
  const sharedFacts = getSharedClassFacts(entry.classes);
  const sharedFactsLine: { key: string; label: string }[] = [
    ...(sharedFacts.trialNumber
      ? [{ key: 'trial', label: formatTrialLabel(sharedFacts.trialNumber) }]
      : []),
    ...(sharedFacts.trialDate
      ? [{ key: 'date', label: formatMonthDay(sharedFacts.trialDate) }]
      : []),
    ...(sharedFacts.handler
      ? [{ key: 'handler', label: `Handled by ${sharedFacts.handler}` }]
      : []),
  ];

  return (
    <div id={detailsId} className="myk9-entries-details-panel">
      <div className="myk9-entries-detail-item">
        <span>
          {formatConfirmationNumberLabel(
            entry.confirmationNumber || (isTerminalStatus ? '—' : 'Pending')
          )}
        </span>
      </div>

      {/* Once editing has closed, "Entries close" moves here instead of
          the summary band (task 3.3). */}
      {!canEdit && entry.entryCloseDate && (
        <div className="myk9-entries-detail-item">
          <CalendarClock className="h-4 w-4" />
          <span>
            <span className="text-sm text-muted-foreground">Entries close </span>
            {formatShortDate(entry.entryCloseDate)}
          </span>
        </div>
      )}

      {/* Classes. The separate "N classes entered" counter that used to sit
          here is gone: the toggle above now reads "Entered Classes (N)", so
          the count was stated twice and then demonstrated by the list itself.
          The visible "Classes Entered:" heading went with it for the same
          reason — the control that opened this panel already says it — but the
          h4 stays, screen-reader-only, so the h3 → h4 structure is intact.

          A single-dog order renders a flat list; an order spanning several
          dogs groups classes under each dog's name. Each dog's check-in click
          is scoped via `toDogEntryView` so the dialog shows that dog's
          identity, not the order's lead dog. */}
      <div className="myk9-entries-classes-section">
        <h4 className="sr-only">Entered classes</h4>

        {/* Facts every row agrees on, stated once. A row prints its own trial
            date, trial number or handler only when it differs from the group
            — see `getSharedClassFacts`. */}
        {sharedFactsLine.length > 0 && (
          <p className="myk9-entries-shared-facts">
            {sharedFactsLine.map((fact, index) => (
              <React.Fragment key={fact.key}>
                {index > 0 && <span aria-hidden="true">·</span>}
                <span>{fact.label}</span>
              </React.Fragment>
            ))}
          </p>
        )}

        {entry.dogs.length > 1 ? (
          // Two columns at most, and only from `lg`. The old
          // `xl:grid-cols-5` was keyed to the viewport while the column is
          // narrowed by a 288px sidebar, leaving ~171px per dog group and
          // ellipsing class names like "Novice Container A #12 (16in)" down
          // to a few characters.
          <div className="myk9-entries-dogs-grid grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
            {entry.dogs.map(dog => (
              <div key={dog.dogId} className="myk9-entries-dog-group">
                {/* Name only. The armband is on the always-visible band above,
                    which is what gets read at the gate; repeating it here made
                    every dog's identity appear twice on one card. */}
                <div className="myk9-entries-dog-group-name">{dog.dogName}</div>
                <div className="myk9-entries-classes-list">
                  {dog.classes.map(cls => renderClassRow(cls, toDogEntryView(entry, dog)))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="myk9-entries-classes-list">
            {entry.classes.map(cls => renderClassRow(cls, entry))}
          </div>
        )}
      </div>

      {/* Secondary actions — everything besides the single summary-band
          next action lives here, reachable once details are expanded. */}
      <div className="myk9-entries-actions">
        <div className="myk9-entries-action-buttons">
          {!summaryShowsViewShow && (
            <Button
              variant="outline"
              asChild
              className="min-h-[44px] text-primary transition-all duration-state"
            >
              <Link to={`/shows/${entry.showId}`}>
                <Eye className="h-5 w-5 mr-1.5" />
                View Show
              </Link>
            </Button>
          )}

          {canEdit && (
            <Button
              variant="outline"
              onClick={() => onEditClick(editReceiptEntry)}
              className="min-h-[44px] hover:bg-muted transition-all duration-state"
            >
              <Edit className="h-5 w-5 mr-1.5" />
              Edit Entry
            </Button>
          )}

          {canViewRunOrder && (
            <Button
              variant="outline"
              asChild
              className="min-h-[44px] hover:bg-muted transition-all duration-state"
            >
              <Link to={`/shows/${entry.showId}?tab=classes`}>
                <ListOrdered className="h-5 w-5 mr-1.5" />
                View run order
              </Link>
            </Button>
          )}

          {canRequestPostDeadlineHelp && (
            <Button
              variant="outline"
              asChild
              className="min-h-[44px] hover:bg-muted transition-all duration-state"
            >
              <Link to={`/messages/${entry.showId}`}>
                <MessageSquare className="h-5 w-5 mr-1.5" />
                Message the show team
              </Link>
            </Button>
          )}

          {/* Moved off the summary band, where it was a second outline button
              competing with the single next action. The `entry.showId` guard
              moves WITH it: an empty showId is the partial-replication window
              (see the payment INTENT on MyEntryCard), and AddToCalendarDialog
              issues a subscription for the id as soon as it opens — so an
              unguarded button would fire `issue('')` and offer a control that
              cannot work. */}
          {entry.showId && (
            <Button
              variant="outline"
              onClick={onAddToCalendarClick}
              className="min-h-[44px] hover:bg-muted transition-all duration-state"
            >
              <CalendarPlus className="h-5 w-5 mr-1.5" />
              Add to Calendar
            </Button>
          )}

          {canShowReceipt && (
            <Button
              variant="outline"
              onClick={() => onReceiptClick(editReceiptEntry)}
              className="min-h-[44px] hover:bg-muted transition-all duration-state"
            >
              <Download className="h-5 w-5 mr-1.5" />
              Receipt
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  /**
   * Renders one class row. `dogView` is the order scoped down to the dog that
   * owns `cls` — a single-dog order passes `entry` itself unchanged (identical
   * markup to before this task); a multi-dog order passes a `toDogEntryView`
   * projection per dog so the aria-label and check-in click target the right
   * dog, not the order's lead dog.
   */
  function renderClassRow(cls: EntryClass, dogView: MyEntry) {
    const resultModel = buildResultCardModel({
      entry: dogView,
      classEntry: cls,
      visibility: buildResultCardVisibility(cls),
    });
    const showNewResult = resultModel != null && !seenResultReleaseKeys.has(resultModel.releaseKey);
    const showResultCardAction = resultModel != null && onResultRevealClick != null;

    return (
      <div key={cls.id} className="myk9-entries-class-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className="myk9-entries-class-name"
              title={`${cls.name}${cls.number ? ` #${cls.number}` : ''}${
                cls.jumpHeight ? ` (${cls.jumpHeight})` : ''
              }`}
            >
              {cls.name}
              {cls.number ? ` #${cls.number}` : ''}
              {cls.jumpHeight && ` (${cls.jumpHeight})`}
            </span>
            {/* Only what makes THIS row different from the hoisted line above.
                When every row shares a trial date / number / handler the
                shared line carries it and these render nothing. */}
            {((cls.trialDate && !sharedFacts.trialDate) ||
              (cls.trialNumber && !sharedFacts.trialNumber)) && (
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {cls.trialDate && !sharedFacts.trialDate && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-medium">
                    <CalendarDays className="h-3 w-3" />
                    {formatMonthDay(cls.trialDate)}
                  </span>
                )}
                {cls.trialNumber && !sharedFacts.trialNumber && (
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">
                    {formatTrialLabel(cls.trialNumber)}
                  </span>
                )}
              </span>
            )}
            {cls.handler && !sharedFacts.handler && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <User className="h-3 w-3 flex-shrink-0" />
                {cls.handler}
              </span>
            )}
          </div>

          {/* Result badge for scored entries */}
          {cls.isScored && cls.resultStatus && (
            <div className="flex items-center gap-1.5">
              <ResultBadge resultStatus={cls.resultStatus} />
              {/* Show the finishing rank for every qualifying run. 1st–4th are the official
                AKC ribbon placements (PlacementPill gives them medal colors); 5th+ render
                as a muted participation rank — nice to know where you came in (not capped
                at 4th). final_placement is only set once the whole class is scored and
                ranked by the trigger; exclude null and the 0 default so an un-ranked row
                never renders "0th". */}
              {cls.resultStatus === 'qualified' &&
                cls.finalPlacement != null &&
                cls.finalPlacement >= 1 && (
                  <PlacementPill placement={cls.finalPlacement} size="sm" />
                )}
            </div>
          )}

          {showResultCardAction && resultModel && onResultRevealClick && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onResultRevealClick(resultModel)}
              className={
                showNewResult
                  ? 'min-h-[44px] w-full shrink-0 border-primary text-primary sm:w-auto'
                  : 'min-h-[44px] w-full shrink-0 border-border text-muted-foreground sm:w-auto'
              }
            >
              {showNewResult ? 'New result' : 'Result card'}
            </Button>
          )}

          {/* Check-in Status Controls — gated by the secretary's
              self-check-in toggle (cascade resolved per class; defaults
              open). When off, show a non-interactive indicator with a
              reason instead of a tappable button the RPC would reject.
              An `unresolved` placeholder row (class join not yet replicated)
              gets the same non-interactive treatment: its `classId` is
              missing because the class isn't known yet, not because the
              toggle is open. */}
          {(cls.unresolved || isClassCheckInEligible(dogView, cls)) &&
            (!cls.unresolved &&
            (cls.classId ? (selfCheckinByClassId[cls.classId] ?? true) : true) ? (
              <button
                type="button"
                onClick={() => onCheckInClick(dogView, cls)}
                aria-label={`Update check-in for ${dogView.dogName} in ${cls.name}`}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background px-2 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-transform"
              >
                <CheckInStatusIndicator
                  status={cls.checkInStatus || 'no-status'}
                  size="sm"
                  showLabel={true}
                  showTooltip={true}
                />
              </button>
            ) : (
              // The reason is rendered as text, not a `title=` tooltip. This
              // audience is on a phone, outdoors — a hover-only explanation is
              // unreachable for them (PRODUCT.md bans hover-only affordances).
              // `opacity-60` is gone too: it pushed this text to ~2.5:1.
              // The aria-label stays: it is the accessible name for the whole
              // non-interactive cluster, and a test asserts its ABSENCE when
              // check-in IS available — dropping it would make that assertion
              // pass vacuously.
              <span
                className="flex flex-col items-end gap-1 text-right"
                aria-label="Self check-in not available"
              >
                <CheckInStatusIndicator
                  status={cls.checkInStatus || 'no-status'}
                  size="sm"
                  showLabel={true}
                  showTooltip={false}
                />
                <span className="text-xs text-muted-foreground">
                  {cls.unresolved ? 'Still syncing' : 'Check-in not open'}
                </span>
              </span>
            ))}
        </div>
        <div className="flex items-center gap-2">
          {cls.isScored && cls.searchTimeSeconds != null && (
            <span className="text-xs text-muted-foreground">
              {cls.searchTimeSeconds.toFixed(1)}s
            </span>
          )}
          {cls.isScored && cls.totalFaults != null && cls.totalFaults > 0 && (
            <span className="text-xs text-warning">{cls.totalFaults}F</span>
          )}
        </div>
      </div>
    );
  }
};
