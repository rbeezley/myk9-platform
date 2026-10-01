/**
 * "Showing 12 of 214 entries (Pending, Class: Novice A)." plus a "Show all
 * entries" button — the one place a list says, in words, what it is showing and
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
  /** Plain-language parts of the active filters (summarizeFilters). */
  filterSummary: readonly string[];
  /** Clears search, view and field filters. The button shows only while filtered. */
  onShowAll: () => void;
  selectAll?: {
    selectedCount: number;
    onSelectAll: () => void;
  };
  /**
   * Whether the sentence is its own polite live region (default). Pass `false`
   * only where the surrounding card already owns its one `role="status"`.
   */
  announce?: boolean;
  /** Right-aligned extras (sort note, column controls). */
  children?: ReactNode;
  className?: string;
}

function plural(count: number, [one, many]: readonly [string, string]): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

const LINK_BUTTON =
  'h-11 rounded-md px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function statusSentence({
  shown,
  total,
  noun,
  filtered,
  filterSummary,
}: Pick<ListResultLineProps, 'shown' | 'total' | 'noun' | 'filtered' | 'filterSummary'>): string {
  if (!filtered) {
    return shown === total
      ? `Showing all ${plural(total, noun)}.`
      : `Showing ${plural(shown, noun)}.`;
  }
  const summary = filterSummary.length > 0 ? ` (${filterSummary.join(', ')})` : '';
  return `Showing ${shown.toLocaleString()} of ${plural(total, noun)}${summary}.`;
}

export function ListResultLine({
  shown,
  total,
  noun,
  filtered,
  filterSummary,
  onShowAll,
  selectAll,
  announce = true,
  children,
  className,
}: ListResultLineProps) {
  const canSelectAll =
    selectAll !== undefined && selectAll.selectedCount > 0 && selectAll.selectedCount < shown;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-sm', className)}>
      <p
        {...(announce ? { role: 'status', 'aria-live': 'polite' as const } : {})}
        className="text-muted-foreground"
      >
        {statusSentence({ shown, total, noun, filtered, filterSummary })}
      </p>
      {filtered && (
        <button type="button" onClick={onShowAll} className={LINK_BUTTON}>
          Show all {noun[1]}
        </button>
      )}
      {canSelectAll && (
        <button type="button" onClick={selectAll.onSelectAll} className={LINK_BUTTON}>
          Select all {plural(shown, noun)}
        </button>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
