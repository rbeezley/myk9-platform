/**
 * The one empty state for every list (MYK9-929, M7). "No ‹objects› yet" when the list holds
 * nothing; "No ‹objects› match your search or filters." with a "Show all ‹objects›" button
 * (the same words as `ListResultLine`'s) when a search or filter hides every row.
 * A caller adds only its own description and first-step action; it never rewords the title.
 */

import type { LucideIcon } from 'lucide-react';
import { EmptyState, type EmptyStateAction } from '@/components/common/EmptyState';

interface ListEmptyStateProps {
  icon: LucideIcon;
  /** Singular and plural nouns, e.g. ['club', 'clubs']. */
  noun: readonly [string, string];
  /** True when a search, filter or view hides every row of a list that is not empty. */
  filtered: boolean;
  onShowAll: () => void;
  /** The empty list's first step ("Add Club"); ignored while filtered. */
  action: EmptyStateAction | null;
  description?: string;
}

export function ListEmptyState({
  icon,
  noun,
  filtered,
  onShowAll,
  action,
  description,
}: ListEmptyStateProps) {
  const plural = noun[1];
  if (filtered) {
    return (
      <EmptyState
        icon={icon}
        variant="filter"
        size="sm"
        title={`No ${plural} match your search or filters.`}
        action={{ label: `Show all ${plural}`, onClick: onShowAll }}
      />
    );
  }
  return (
    <EmptyState
      icon={icon}
      title={`No ${plural} yet`}
      {...(description ? { description } : {})}
      action={action}
    />
  );
}
