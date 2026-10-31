import { ChevronRight, Clock3, User } from 'lucide-react';
import { getEffectiveClassStatus, type ClassEntry } from '@myk9/ringside';
import { StatusBadge } from '@/components/status';
import { cn } from '@/lib/utils';
import { formatAtShowClassTime } from './atShowClassTiming';
import {
  AtShowClassStatusInfo,
  OfflineScoringBadge,
  statusCarriesTime,
} from './AtShowClassStatusInfo';
import { AtShowClassCardFooter } from './AtShowClassCardFooter';
import type { RingDayBucket } from './orderRingClassesByDay';
import {
  isEmptyNextUpPreview,
  isLiveNextUpStatus,
  type AtShowNextUpPreview,
} from './atShowNextUpPreview';

export interface AtShowClassRowProps {
  entry: ClassEntry;
  isExhibitorOnly: boolean;
  onClick: (entry: ClassEntry) => void;
  trialTimeZone: string;
  /**
   * "<trial label> · <date>" (`formatAtShowTrialHeading`). Passed only where
   * cards from several trials share one flat list (Your ring, MYK9-1165), so a
   * multi-day show's identical class names stay tellable apart.
   */
  trialHeading?: string | undefined;
  /**
   * Day relative to the trial's local today (MYK9-1224), only for Your ring.
   * 'today' gets a label; 'past' is rendered quieter but stays tappable.
   */
  dayBucket?: RingDayBucket | undefined;
  /** The trial's date is today; only this shows the Today label (a live class may sort as today without it). */
  isToday?: boolean | undefined;
  /** In-ring / next-up preview for this card; omitted when unknown. */
  nextUp?: AtShowNextUpPreview | undefined;
  /**
   * Whether this class's entry rows have actually been read (MYK9-637).
   * `false` means the counts are UNKNOWN, not zero -- see the counter below.
   *
   * REQUIRED, with no default, on purpose: a defaulted `true` let both call
   * sites be deleted while everything still compiled and stayed green, which
   * silently reinstated `0 / 0` (LESSONS last-hop-drop).
   */
  entryCountsAvailable: boolean;
  /**
   * Scores queued on this device for this class (MYK9-1506). Above zero the card
   * shows the upload indicator and the Offline Scoring badge; zero shows neither.
   */
  queuedScoreCount?: number | undefined;
  /** The heart. Omitted, the card has no favorite control. */
  onToggleFavorite?: ((entry: ClassEntry) => void) | undefined;
  /** The info icon. Omitted, the card has none. */
  onShowDetails?:
    ((entry: ClassEntry, anchor: HTMLElement, countsTrusted: boolean) => void) | undefined;
  /** The ellipsis. Omitted for roles that may not open Class Options. */
  onOpenOptions?: ((entry: ClassEntry, anchor: HTMLElement) => void) | undefined;
}

/** The props every card shares; the lists add the entry and, for Your ring, its day facts. */
export type AtShowClassCardProps = Omit<
  AtShowClassRowProps,
  'entry' | 'trialTimeZone' | 'trialHeading' | 'dayBucket' | 'isToday'
>;

/**
 * The "who's in the ring, who's next" line.
 *
 * INTENT: this exists so an exhibitor or gate steward can decide "do I need to
 * head to the ring?" without opening the entry list — glanceable, not a table.
 * The in-ring indicator is AMBER (`--at-show-in-ring`) on purpose: Ring Green
 * (#4e7c53) is reserved exclusively for live judging surfaces and must not
 * appear here. The token the comment always named now exists -- the colour was
 * hardcoded #f59e0b, which computes to 2.15:1 on a white card and so failed the
 * 3:1 non-text floor in light mode. Amber is preserved; only its light-mode
 * value moved.
 */
function AtShowClassRowNextUp({ preview }: { preview: AtShowNextUpPreview }) {
  return (
    // `aria-label` on a plain div is dropped by AT (generic role), and the
    // "Next" span was additionally aria-hidden -- so the one line telling a
    // steward who is in the ring reached no screen reader at all. The visible
    // text now carries its own meaning via sr-only qualifiers instead.
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {preview.inRingArmband && (
        <span className="flex items-center gap-1 font-semibold text-foreground">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--at-show-in-ring)]"
          />
          <span className="sr-only">Armband </span>#{preview.inRingArmband}
          <span className="sr-only"> in the ring</span>
        </span>
      )}
      {preview.nextArmbands.length > 0 && (
        <span className="truncate text-muted-foreground">
          Next {preview.nextArmbands.map(armband => `#${armband}`).join(' · ')}
        </span>
      )}
      {preview.total > 0 && (
        <span className="text-muted-foreground">
          {preview.remaining} of {preview.total} remaining
        </span>
      )}
    </div>
  );
}

export function AtShowClassRow({
  entry,
  isExhibitorOnly,
  onClick,
  trialTimeZone,
  trialHeading,
  dayBucket,
  isToday,
  nextUp,
  entryCountsAvailable,
  queuedScoreCount = 0,
  onToggleFavorite,
  onShowDetails,
  onOpenOptions,
}: AtShowClassRowProps) {
  const status = getEffectiveClassStatus(entry);
  const showNextUp = isLiveNextUpStatus(status) && !isEmptyNextUpPreview(nextUp);

  return (
    <li data-class-id={entry.id} data-day-bucket={dayBucket}>
      <div
        className={cn(
          'rounded-xl border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md',
          // #923 tokenized the favorite (theme-aware, calm in dark). The
          // background tint is gone: it lightened the dark card just enough to
          // drop text-muted-foreground to 4.26:1, under AA. The filled heart and
          // the primary border already carry the state, so this loses no signal.
          entry.is_favorite && 'border-primary',
          // Past days are quieter by surface only (no shadow; the border stays so the
          // card still reads as a card); never opacity, which drops muted text
          // below AA (see counter comment).
          dayBucket === 'past' && 'shadow-none'
        )}
      >
        {/* INTENT: in-ring gloved taps want ~48px rows — hence min-h-12. */}
        <button
          type="button"
          onClick={() => onClick(entry)}
          className={cn(
            'flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.99]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{entry.class_name}</span>
            </div>
            {trialHeading && (
              <div className="mt-0.5 flex items-center gap-2 text-sm font-medium text-foreground/80">
                <span className="truncate">{trialHeading}</span>
                {isToday && (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    Today
                  </span>
                )}
              </div>
            )}
            {entry.judge_name && entry.judge_name !== 'No Judge Assigned' && (
              <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                <User size={13} className="shrink-0" />
                {entry.judge_name}
              </div>
            )}
            <AtShowClassStatusInfo entry={entry} status={status} trialTimeZone={trialTimeZone} />
            {entry.start_time && !statusCarriesTime(entry, status) && (
              <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Clock3 size={13} className="shrink-0" aria-hidden />
                {entry.revised_expected_start ? 'Expected' : 'Scheduled'}{' '}
                {formatAtShowClassTime(entry.start_time, trialTimeZone)}
              </div>
            )}
            {!isExhibitorOnly && entry.actual_start_time && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                Started {formatAtShowClassTime(entry.actual_start_time, trialTimeZone)}
                {entry.actual_end_time
                  ? ` · Finished ${formatAtShowClassTime(entry.actual_end_time, trialTimeZone)}`
                  : ''}
              </div>
            )}
            {showNextUp && nextUp && <AtShowClassRowNextUp preview={nextUp} />}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {status === 'offline-scoring' || queuedScoreCount > 0 ? (
              <OfflineScoringBadge />
            ) : (
              <StatusBadge
                family="class"
                status={status}
                className="px-2 py-0.5 text-xs font-medium"
              />
            )}
            {/*
            INTENT: an unknown count must never be spelled as a zero. On the
            judge's landing screen "0 of 0 scored" is a claim that the class is
            empty and finished; before the show's entry replica has been read
            that claim is simply unfounded (MYK9-637).
          */}
            {/*
            MYK9-1184: an exhibitor's replica never holds every entry in a
            class (RLS admits only their own), so for them the count can never
            load and "not loaded" would be permanent. Omit the line instead.
          */}
            {(entryCountsAvailable || !isExhibitorOnly) && (
              <span className="text-xs text-muted-foreground">
                {entryCountsAvailable ? (
                  <>
                    <span aria-hidden>
                      {entry.completed_count} / {entry.entry_count}
                    </span>
                    <span className="sr-only">
                      {entry.completed_count} of {entry.entry_count} scored
                    </span>
                  </>
                ) : (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">Entry count not loaded yet</span>
                  </>
                )}
              </span>
            )}
          </div>
          <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
        </button>
        <AtShowClassCardFooter
          entry={entry}
          showProgress={entryCountsAvailable}
          queuedScoreCount={queuedScoreCount}
          onToggleFavorite={onToggleFavorite}
          onShowDetails={onShowDetails}
          onOpenOptions={onOpenOptions}
        />
      </div>
    </li>
  );
}
