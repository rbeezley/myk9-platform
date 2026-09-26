/**
 * The bulk-action bar, floating at the bottom centre of the viewport.
 *
 * It used to sit above the table, so an admin who ticked rows near the bottom
 * of a long list never saw it open and had to scroll back up to use it. Fixed
 * to the viewport, it is in view wherever the selection was made. A spacer in
 * normal flow keeps it from covering the list's last rows and pagination.
 *
 * Escape inside the bar clears the selection; every control is a 44px target
 * (docs/INTENT.md § 3).
 */

import type { KeyboardEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingBulkBarProps {
  count: number;
  /** Singular and plural nouns, e.g. ['user', 'users']. */
  noun: readonly [string, string];
  onClear: () => void;
  /** The actions — use `BulkBarButton`. Destructive ones last. */
  children: ReactNode;
}

export function FloatingBulkBar({ count, noun, onClear, children }: FloatingBulkBarProps) {
  if (count === 0) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClear();
    }
  };

  return (
    <>
      <div aria-hidden="true" className="h-24" />
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        <div
          role="toolbar"
          aria-label="Bulk actions"
          onKeyDown={handleKeyDown}
          className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl"
        >
          <span className="whitespace-nowrap px-3 text-sm font-semibold" aria-live="polite">
            {count.toLocaleString()} {count === 1 ? noun[0] : noun[1]} selected
          </span>
          <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
          {children}
          <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
}

export function BulkBarButton({
  onClick,
  icon,
  children,
  tone = 'default',
  disabled = false,
}: BulkBarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
