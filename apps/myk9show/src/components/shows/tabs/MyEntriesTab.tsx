import { useMyEntries } from '@/hooks/useMyEntries';
import { useViewPreference } from '@/hooks/useViewPreference';
import { LiveClassCard } from '@/components/live/LiveClassCard';
import { ViewToggle } from '@/components/common/ViewToggle';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MyEntriesTabProps {
  showId: string;
}

const VIEW_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
] as const;

export function MyEntriesTab({ showId }: MyEntriesTabProps) {
  const { entriesByClass, isLoading, isError } = useMyEntries(showId);
  const [viewMode, setViewMode] = useViewPreference('entries', 'cards');

  if (isLoading) {
    return <LoadingSkeleton variant="cards" count={3} />;
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>Could not load your entries. Please try again.</p>
      </div>
    );
  }

  if (entriesByClass.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No entries in this show"
        description="You haven't entered any classes in this show yet."
        action={{ label: 'Browse Classes', onClick: () => {} }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {entriesByClass.length} class{entriesByClass.length !== 1 ? 'es' : ''}
        </p>
        <ViewToggle
          modes={VIEW_MODES}
          active={viewMode}
          onChange={(k) => setViewMode(k as 'cards' | 'table')}
        />
      </div>

      {viewMode === 'cards' ? (
        <div className="grid gap-4">
          {entriesByClass.map((entry) => (
            <LiveClassCard
              key={entry.classId}
              classTitle={entry.className}
              status={entry.scored ? 'completed' : 'in_progress'}
              userDogsAhead={entry.dogsAhead}
              userDogName={entry.dogName}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Class</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                  Progress
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">My Dog</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Position</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {entriesByClass.map((entry) => (
                <tr
                  key={entry.classId}
                  className="border-b border-border/20 hover:bg-muted/10 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{entry.className}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        entry.scored
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
                      )}
                    >
                      {entry.scored ? 'Scored' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">&mdash;</td>
                  <td className="px-4 py-3">
                    <span>{entry.dogName}</span>
                    {entry.armband && (
                      <span className="ml-1 text-muted-foreground">#{entry.armband}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.scored
                      ? 'Completed'
                      : entry.dogsAhead === 0
                        ? 'Next up'
                        : `${entry.dogsAhead} ahead`}
                  </td>
                  <td className="px-2 py-3 text-muted-foreground/50">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
