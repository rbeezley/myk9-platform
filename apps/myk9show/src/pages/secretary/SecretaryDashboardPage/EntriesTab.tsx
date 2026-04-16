import { useState } from 'react';
import { usePendingEntries } from '@/hooks/queries/usePendingEntries';
import { useEntryDecision } from '@/hooks/mutations/useEntryDecisionMutations';
import { EntryDecisionRow } from './EntryDecisionRow';

interface Show {
  id: string;
  name: string;
}

interface EntriesTabProps {
  shows: Show[];
}

export function EntriesTab({ shows }: EntriesTabProps) {
  const [filter, setFilter] = useState<string>('all');
  const { data: entries = [], isLoading } = usePendingEntries(
    filter === 'all' ? undefined : filter
  );
  const decide = useEntryDecision();

  const showNameMap = Object.fromEntries(shows.map(s => [s.id, s.name]));
  const filterOptions = ['all', ...shows.map(s => s.id)];

  return (
    <div className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Filter:</span>
        {filterOptions.map(f => {
          const label = f === 'all' ? 'All Shows' : (showNameMap[f] ?? f);
          return (
            <button
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                filter === f
                  ? 'bg-blue-700 text-blue-200'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

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
              onDecide={(entryId, decision) => decide.mutate({ entryId, decision })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
