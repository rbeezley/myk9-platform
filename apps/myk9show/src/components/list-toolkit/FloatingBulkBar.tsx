/**
 * The bulk-action bar, floating at the bottom centre of the viewport.
 *
 * It used to sit above the table, so an admin who ticked rows near the bottom
 * of a long list never saw it open and had to scroll back up to use it. Fixed
 * to the viewport, it is in view wherever the selection was made. A spacer in
 * normal flow keeps it from covering the list's last rows and pagination.
 *
 * At narrow widths the actions wrap onto further rows instead of scrolling
 * sideways, so none is hidden off-screen (MYK9-1444). How many rows depends on
 * the width and on the caller's actions, so the spacer is sized from the bar's
 * measured height rather than a fixed guess.
 *
 * Escape inside the bar clears the selection; every control is a 44px target
 * (docs/INTENT.md § 3).
 */

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingBulkBarProps {
  count: number;
  /** Singular and plural nouns, e.g. ['user', 'users']. */
  noun: readonly [string, string];
  onClear: () => void;
  /** The actions — use `BulkBarButton`. Destructive ones last. */
  children: ReactNode;
  /** Disables Clear (button and Escape) while a bulk operation is in flight. */
  busy?: boolean;
}

/**
 * The bar must read as a raised control, not part of the list under it. In
 * dark mode `--popover` IS the card colour, so a plain popover surface vanished
 * into the table. A light accent wash over the opaque popover, an accent-tinted
 * border and a deep shadow set it apart in both themes. Built with color-mix
 * because Tailwind's `/opacity` modifiers emit nothing for this app's bare-var
 * tokens (see data-table/types.ts).
 */
const BAR_SURFACE = [
  '[background:linear-gradient(color-mix(in_srgb,var(--primary)_12%,transparent),color-mix(in_srgb,var(--primary)_12%,transparent)),var(--popover)]',
  '[border-color:color-mix(in_srgb,var(--primary)_45%,var(--border))]',
  'shadow-[0_12px_32px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.2)]',
].join(' ');

export function FloatingBulkBar({
  count,
  noun,
  onClear,
  children,
  busy = false,
}: FloatingBulkBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState<number | null>(null);
  const open = count > 0;

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!open || !bar || typeof ResizeObserver === 'undefined') return;
    // The observer reports once on observe, then on every wrap change.
    const observer = new ResizeObserver(() => setBarHeight(bar.getBoundingClientRect().height));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // React bubbles events from portals (a menu or dialog opened from the bar)
    // to here too; only an Escape pressed IN the bar's own DOM clears the
    // selection, so closing a confirmation never discards it.
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (busy) return;
      onClear();
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="bulk-bar-spacer"
        className={barHeight === null ? 'h-24' : undefined}
        // The bar's height, its bottom offset, and the gap the original fixed spacer left.
        style={
          barHeight === null
            ? undefined
            : { height: `calc(${barHeight}px + max(1rem, env(safe-area-inset-bottom)) + 1.5rem)` }
        }
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        <div
          ref={barRef}
          role="toolbar"
          aria-label="Bulk actions"
          onKeyDown={handleKeyDown}
          className={cn(
            'pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border p-1.5 text-popover-foreground',
            BAR_SURFACE
          )}
        >
          <span className="whitespace-nowrap px-3 text-sm font-semibold" aria-live="polite">
            {count.toLocaleString()} {count === 1 ? noun[0] : noun[1]} selected
          </span>
          <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-border lg:block" />
          {children}
          <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-border lg:block" />
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            aria-label="Clear selection"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}

interface BulkBarButtonProps {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'destructive';
  disabled?: boolean;
  /** Shown as a native tooltip — used to explain why the button is disabled. */
  title?: string | undefined;
}

export function BulkBarButton({
  onClick,
  icon,
  children,
  tone = 'default',
  disabled = false,
  title,
}: BulkBarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        tone === 'destructive' && 'text-destructive-strong hover:bg-destructive/10'
      )}
    >
      {icon}
      {children}
    </button>
  );
}
