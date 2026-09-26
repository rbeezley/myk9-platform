/**
 * "214 of 4,812 users" — the one place a list states how much it is showing,
 * announced politely as filters change. Offers "Select all N matching" while a
 * selection exists, so a bulk action can reach past the current page.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ListResultLineProps {
  shown: number;
  total: number;
  /** Singular and plural nouns, e.g. ['user', 'users']. */
  noun: readonly [string, string];
  filtered: boolean;
  selectAll?: {
    selectedCount: number;
    onSelectAll: () => void;
  };
  /** Right-aligned extras (sort note, column controls). */
  children?: ReactNode;
  className?: string;
}

function plural(count: number, [one, many]: readonly [string, string]): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export function ListResultLine({
  shown,
  total,
  noun,
  filtered,
  selectAll,
  children,
  className,
}: ListResultLineProps) {
  const canSelectAll =
    selectAll !== undefined && selectAll.selectedCount > 0 && selectAll.selectedCount < shown;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-sm', className)}>
      <p role="status" aria-live="polite" className="text-muted-foreground">
        {filtered ? (
          <>
            <span className="font-semibold text-foreground">{plural(shown, noun)}</span> match, of{' '}
            {total.toLocaleString()}
          </>
        ) : (
          `${plural(shown, noun)} in view`
        )}
      </p>
      {canSelectAll && (
        <button
          type="button"
          onClick={selectAll.onSelectAll}
          className="h-11 rounded-md px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Select all {plural(shown, noun)}
        </button>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
