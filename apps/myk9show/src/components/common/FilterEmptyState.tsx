import type { StatusFilterValue } from '@/components/common/StatusFilter';

interface FilterEmptyStateProps {
  noun: string;
  statusFilter: StatusFilterValue;
  onReset: () => void;
  /** Override default "All X completed!" message when filtering pending */
  allDoneMessage?: string;
  /** Override default "No X completed yet." message when filtering completed */
  noneDoneMessage?: string;
}

export function FilterEmptyState({
  noun,
  statusFilter,
  onReset,
  allDoneMessage,
  noneDoneMessage,
}: FilterEmptyStateProps) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <p>
        {statusFilter === 'pending'
          ? (allDoneMessage ?? `All ${noun} completed!`)
          : statusFilter === 'completed'
            ? (noneDoneMessage ?? `No ${noun} completed yet.`)
            : `No ${noun} match the current filter.`}
      </p>
      <button
        type="button"
        className="mt-2 text-primary hover:underline text-sm"
        onClick={onReset}
      >
        Show all {noun}
      </button>
    </div>
  );
}
