import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { Show } from '@/types/show-types';
import {
  ALL_MONTHS_KEY,
  buildMonthTiles,
  type MonthDot,
  type MonthTile,
} from './monthScrubber.helpers';

interface MonthScrubberProps {
  /** The shows the current tab can see, before any month filter. */
  shows: Show[];
  /** `'all'` or a `YYYY-MM` month key. */
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

const DOT_CLASS: Record<MonthDot, string> = {
  open: 'bg-success',
  closing: 'bg-warning',
  muted: 'bg-muted-foreground',
};

function tileAriaLabel(tile: MonthTile): string {
  if (tile.key === ALL_MONTHS_KEY) return `All upcoming, ${tile.count} shows`;
  const month = new Date(`${tile.key}-01T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return `${month}, ${tile.count} ${tile.count === 1 ? 'show' : 'shows'}`;
}

/**
 * MonthScrubber — a horizontal strip of month tiles above the show list.
 *
 * Answers "when can I go?" without leaving the list: each tile carries its
 * count and one dot per show coloured by entry status, so a visitor sees where
 * the open entries are before clicking. Past months sit dimmed to the left, so
 * the strip also replaces the old Past Shows tab (MYK9-427).
 */
export function MonthScrubber({ shows, value, onChange, className }: MonthScrubberProps) {
  const tiles = useMemo(() => buildMonthTiles(shows), [shows]);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Land with the selected tile in view (past months sit to its left).
  useEffect(() => {
    // Guarded: jsdom has no scrollIntoView.
    selectedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, []);

  // Roving arrow keys, as a radio group expects: the strip is one tab stop
  // and Left/Right move the selection.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = tiles[(index + delta + tiles.length) % tiles.length];
    if (!next) return;
    onChange(next.key);
    const buttons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        'button[role="radio"]'
      );
    buttons?.[(index + delta + tiles.length) % tiles.length]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Filter shows by month"
      data-testid="month-scrubber"
      className={cn(
        'flex gap-2 overflow-x-auto hide-scrollbar scroll-shadow-x py-1 -my-1',
        className
      )}
    >
      {tiles.map((tile, index) => {
        const selected = tile.key === value;
        return (
          <button
            key={tile.key}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={tileAriaLabel(tile)}
            data-past={tile.isPast ? 'true' : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tile.key)}
            onKeyDown={event => handleKeyDown(event, index)}
            className={cn(
              'flex min-h-[64px] min-w-[76px] flex-none flex-col items-center justify-center gap-1 rounded-xl border bg-card px-3 py-2 text-foreground shadow-card transition-[transform,box-shadow] duration-150',
              'hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected ? 'border-primary ring-1 ring-primary' : 'border-border',
              tile.isPast && !selected && 'opacity-60'
            )}
          >
            <span
              className={cn(
                'text-[11px] font-bold tracking-[0.06em]',
                selected ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {tile.label}
              {tile.year !== null && tile.key !== ALL_MONTHS_KEY && (
                <span className="ml-1 font-semibold tracking-normal opacity-70">
                  {'\u2019'}
                  {String(tile.year).slice(2)}
                </span>
              )}
            </span>
            <span className="text-lg font-extrabold leading-none">{tile.count}</span>
            {tile.key === ALL_MONTHS_KEY ? (
              <span className="text-[10px] font-semibold text-primary">upcoming</span>
            ) : (
              <span className="flex h-1.5 gap-[3px]" aria-hidden="true">
                {tile.dots.map((dot, i) => (
                  <i key={i} className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[dot])} />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default MonthScrubber;
