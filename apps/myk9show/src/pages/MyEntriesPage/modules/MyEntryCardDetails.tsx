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
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import {
  Calendar,
  CalendarDays,
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
          <Calendar className="h-4 w-4" />
          <span>
            <span className="text-sm text-muted-foreground">Entries close </span>
            {formatShortDate(entry.entryCloseDate)}
          </span>
        </div>
      )}

      <div className="myk9-entries-detail-item">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary/10 px-1 text-sm font-bold text-primary">
          {entry.classes.length}
        </span>
        <span>
          {entry.classes.length === 1
            ? '1 class entered'
            : `${entry.classes.length} classes entered`}
        </span>
      </div>

      {/* Classes — a single-dog order renders a flat list (unchanged markup);
          an order spanning several dogs (D1/D2) groups classes under each
          dog's name in a wrapping grid capped at 5 columns, never
          overflow-x. Each dog's check-in click is scoped via `toDogEntryView`
          so the dialog shows that dog's identity, not the order's lead dog. */}
      <div className="myk9-entries-classes-section">
        <h5 className="myk9-entries-classes-title">Classes Entered:</h5>
        {entry.dogs.length > 1 ? (
          <div className="myk9-entries-dogs-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {entry.dogs.map(dog => (
              <div
                key={dog.dogId}
                className="myk9-entries-dog-group rounded-lg border border-border/60 p-3"
              >
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  {dog.armband && (
                    <ArmbandBadge armband={dog.armband} className="size-6 rounded text-[10px]" />
                  )}
                  <span>{dog.dogName}</span>
                </div>
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
              className="min-h-[44px] border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200"
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
              className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
            >
              <Edit className="h-5 w-5 mr-1.5" />
              Edit Entry
            </Button>
          )}

          {canViewRunOrder && (
            <Button
              variant="outline"
              asChild
              className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
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
              className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
            >
              <Link to={`/messages/${entry.showId}`}>
                <MessageSquare className="h-5 w-5 mr-1.5" />
                Message the show team
              </Link>
            </Button>
          )}

          {canShowReceipt && (
            <Button
              variant="outline"
              onClick={() => onReceiptClick(editReceiptEntry)}
              className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
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
            {(cls.trialDate || cls.trialNumber) && (
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {cls.trialDate && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-2 py-1 font-medium">
                    <CalendarDays className="h-3 w-3" />
                    {formatMonthDay(cls.trialDate)}
                  </span>
                )}
                {cls.trialNumber && (
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">
                    {formatTrialLabel(cls.trialNumber)}
                  </span>
                )}
              </span>
            )}
            {cls.handler && (
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
                  ? 'min-h-[44px] w-full shrink-0 border-primary/30 text-primary sm:w-auto'
                  : 'min-h-[44px] w-full shrink-0 border-muted-foreground/25 text-muted-foreground sm:w-auto'
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
          {!cls.isScored &&
            cls.entryStatusKind !== 'completed' &&
            (!cls.unresolved &&
            (cls.classId ? (selfCheckinByClassId[cls.classId] ?? true) : true) ? (
              <button
                type="button"
                onClick={() => onCheckInClick(dogView, cls)}
                aria-label={`Update check-in for ${dogView.dogName} in ${cls.name}`}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border/60 bg-background px-2 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-transform"
              >
                <CheckInStatusIndicator
                  status={cls.checkInStatus || 'no-status'}
                  size="sm"
                  showLabel={true}
                  showTooltip={true}
                />
              </button>
            ) : (
              <span
                className="cursor-not-allowed opacity-60"
                title={
                  cls.unresolved
                    ? 'This class is still syncing — check-in will be available shortly.'
                    : "Self check-in isn't available for this class right now."
                }
                aria-label="Self check-in not available"
              >
                <CheckInStatusIndicator
                  status={cls.checkInStatus || 'no-status'}
                  size="sm"
                  showLabel={true}
                  showTooltip={false}
                />
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
