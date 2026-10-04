/**
 * "Showing 12 of 214 entries." plus a "Show all entries" button — the one place a list says, in words, what it is showing and
 * how to get back. Announced politely as filters change. Offers "Select all N"
 * while a selection exists, so a bulk action can reach past the current page.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ListResultLineProps {
  shown: number;
  total: number;
  /** Singular and plural nouns, e.g. ['user', 'users']. */
  noun: readonly [string, string];
  filtered: boolean;
  /** Clears search, view and field filters. The button shows only while filtered. */
  onShowAll: () => void;
  /**
   * True while the list's `ListEmptyState` is showing its own "Show all …" button, so this line
   * does not repeat it: one button, one place.
   */
  showAllInEmptyState?: boolean;
  selectAll?: {
    selectedCount: number;
    onSelectAll: () => void;
  };
  /**
   * Whether the sentence is its own polite live region (default). Pass `false`
   * only where the surrounding card already owns its one `role="status"`.
   */
  announce?: boolean;
  /**
   * False until the list's data has loaded successfully: nothing renders, so
   * there is never a "Showing all 0" during loading or beside an error.
   */
  ready?: boolean;
  /** Right-aligned extras (sort note, column controls). */
  children?: ReactNode;
  className?: string;
}

function plural(count: number, [one, many]: readonly [string, string]): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export const LIST_LINK_BUTTON =
  'h-11 rounded-md px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function statusSentence({
  shown,
  total,
  noun,
  filtered,
}: Pick<ListResultLineProps, 'shown' | 'total' | 'noun' | 'filtered'>): string {
  if (!filtered) {
    return shown === total
      ? `Showing all ${plural(total, noun)}.`
      : `Showing ${plural(shown, noun)}.`;
  }
  return `Showing ${shown.toLocaleString()} of ${plural(total, noun)}.`;
}

export function ListResultLine({
  shown,
  total,
  noun,
  filtered,
  onShowAll,
  showAllInEmptyState = false,
  selectAll,
  announce = true,
  ready = true,
  children,
  className,
}: ListResultLineProps) {
  if (!ready) return null;

  const canSelectAll =
    selectAll !== undefined && selectAll.selectedCount > 0 && selectAll.selectedCount < shown;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-sm', className)}>
      <p
        {...(announce ? { role: 'status', 'aria-live': 'polite' as const } : {})}
        className="text-muted-foreground"
      >
        {statusSentence({ shown, total, noun, filtered })}
      </p>
      {filtered && !showAllInEmptyState && (
        <button type="button" onClick={onShowAll} className={LIST_LINK_BUTTON}>
          Show all {noun[1]}
        </button>
      )}
      {canSelectAll && (
        <button type="button" onClick={selectAll.onSelectAll} className={LIST_LINK_BUTTON}>
          Select all {plural(shown, noun)}
        </button>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
