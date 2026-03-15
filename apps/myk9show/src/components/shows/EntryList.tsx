import { useState } from 'react';
import { useClassEntries } from '@/hooks/useClassEntries';
import { EntryRow } from '@/components/live/EntryRow';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { cn } from '@/lib/utils';

interface EntryListProps {
  classId: string;
}

export function EntryList({ classId }: EntryListProps) {
  const { pending, completed, isLoading } = useClassEntries(classId);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

  if (isLoading) {
    return <LoadingSkeleton variant="table" count={5} />;
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex bg-muted/50 rounded-lg p-1 gap-0.5 w-fit">
        <button
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeTab === 'pending'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({pending.length})
        </button>
        <button
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeTab === 'completed'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('completed')}
        >
          Completed ({completed.length})
        </button>
      </div>

      {/* Entry rows */}
      <div className="space-y-2">
        {activeTab === 'pending' &&
          pending.map(entry => (
            <EntryRow
              key={entry.id}
              armband={entry.armband}
              dogName={entry.dogName}
              breed={entry.breed}
              handlerName={entry.handlerName}
              status={entry.status}
              isCurrentUser={entry.isCurrentUser}
            />
          ))}
        {activeTab === 'completed' &&
          completed.map(entry => (
            <EntryRow
              key={entry.id}
              armband={entry.armband}
              dogName={entry.dogName}
              breed={entry.breed}
              handlerName={entry.handlerName}
              status={entry.status}
              isCurrentUser={entry.isCurrentUser}
              {...(entry.result ? { result: entry.result } : {})}
              {...(entry.time ? { time: entry.time } : {})}
            />
          ))}
      </div>
    </div>
  );
}
