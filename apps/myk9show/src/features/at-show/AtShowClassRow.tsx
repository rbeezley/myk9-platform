import { ChevronRight, Clock3, Star, User } from 'lucide-react';
import { getEffectiveClassStatus, type ClassEntry } from '@myk9/ringside';
import { StatusBadge } from '@/components/status';
import { cn } from '@/lib/utils';
import { formatAtShowClassTime } from './atShowClassTiming';
import {
  isEmptyNextUpPreview,
  isLiveNextUpStatus,
  type AtShowNextUpPreview,
} from './atShowNextUpPreview';

interface AtShowClassRowProps {
  entry: ClassEntry;
  isExhibitorOnly: boolean;
  onClick: (entry: ClassEntry) => void;
  trialTimeZone: string;
  /** In-ring / next-up preview for this card; omitted when unknown. */
  nextUp?: AtShowNextUpPreview | undefined;
}

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
  nextUp,
}: AtShowClassRowProps) {
  const status = getEffectiveClassStatus(entry);
  const showNextUp = isLiveNextUpStatus(status) && !isEmptyNextUpPreview(nextUp);

  return (
    <li>
      {/* INTENT: in-ring gloved taps want ~48px rows — hence min-h-12. */}
      <button
        type="button"
        onClick={() => onClick(entry)}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // #923 tokenized the favorite (theme-aware, calm in dark). The
          // background tint is gone: it lightened the dark card just enough to
          // drop text-muted-foreground to 4.26:1, under AA. The filled Star and
          // the primary border already carry the state, so this loses no signal.
          entry.is_favorite && 'border-primary'
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {entry.is_favorite && <Star size={15} className="shrink-0 fill-primary text-primary" />}
            <span className="truncate font-medium">{entry.class_name}</span>
          </div>
          {entry.judge_name && entry.judge_name !== 'No Judge Assigned' && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
              <User size={13} className="shrink-0" />
              {entry.judge_name}
            </div>
          )}
          {entry.start_time && (
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
          <StatusBadge family="class" status={status} className="px-2 py-0.5 text-xs font-medium" />
          <span className="text-xs text-muted-foreground">
            <span aria-hidden>
              {entry.completed_count} / {entry.entry_count}
            </span>
            <span className="sr-only">
              {entry.completed_count} of {entry.entry_count} scored
            </span>
          </span>
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}
