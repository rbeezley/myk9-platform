import { useMyEntries } from '@/hooks/useMyEntries';
import { LiveClassCard } from '@/components/live/LiveClassCard';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { Search } from 'lucide-react';

interface MyEntriesTabProps {
  showId: string;
}

export function MyEntriesTab({ showId }: MyEntriesTabProps) {
  const { entriesByClass, isLoading, isError } = useMyEntries(showId);

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
      <p className="text-sm text-muted-foreground">
        {entriesByClass.length} class{entriesByClass.length !== 1 ? 'es' : ''}
      </p>
      <div className="grid gap-4">
        {entriesByClass.map(entry => (
          <LiveClassCard
            key={entry.classId}
            className_={entry.className}
            judgeName=""
            status={entry.scored ? 'completed' : 'in_progress'}
            totalEntries={0}
            completedEntries={0}
            userDogsAhead={entry.dogsAhead}
            userDogName={entry.dogName}
          />
        ))}
      </div>
    </div>
  );
}
