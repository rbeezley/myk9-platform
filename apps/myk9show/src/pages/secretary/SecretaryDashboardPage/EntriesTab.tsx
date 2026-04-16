import { useState } from 'react';
import { toast } from 'sonner';
import { usePendingEntries } from '@/hooks/queries/usePendingEntries';
import { useEntryDecision } from '@/hooks/mutations/useEntryDecisionMutations';
import { EntryDecisionRow } from './EntryDecisionRow';
import { FilterChips } from './FilterChips';

interface Show {
  id: string;
  name: string;
}

interface EntriesTabProps {
  shows: Show[];
}

export function EntriesTab({ shows }: EntriesTabProps) {
  const [filter, setFilter] = useState('all');
  const { data: entries = [], isLoading } = usePendingEntries(
    filter === 'all' ? undefined : filter
  );
  const decide = useEntryDecision();

  const showNameMap = Object.fromEntries(shows.map(s => [s.id, s.name]));
  const filterOptions = ['all', ...shows.map(s => s.id)].map(v => ({
    value: v,
    label: v === 'all' ? 'All Shows' : (showNameMap[v] ?? v),
  }));

  return (
    <>
      <FilterChips options={filterOptions} active={filter} onChange={setFilter} className="mb-3" />

      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          All caught up — no entries waiting for review.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(entry => (
            <EntryDecisionRow
              key={entry.id}
              entry={entry}
              onDecide={(entryId, decision) =>
                decide.mutate(
                  { entryId, decision },
                  { onError: () => toast.error('Failed to update entry. Please try again.') }
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
