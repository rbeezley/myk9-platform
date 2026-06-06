import { useNavigate } from 'react-router-dom';
import { CalendarDays, ListChecks, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { useEntryStore } from '@/store/entryStore';
import { useShowEntriesForUser } from '@/hooks/useShowEntriesForUser';
import { WhereToBe } from './WhereToBe';
import { DogEntriesSection } from './DogEntriesSection';

interface MyEntriesTabProps {
  showId: string;
}

export function MyEntriesTab({ showId }: MyEntriesTabProps) {
  const navigate = useNavigate();
  const loadEntries = useEntryStore(s => s.loadEntries);
  const { dogGroups, allEntries, totalClasses, isLoading, isError } = useShowEntriesForUser(showId);

  if (isLoading) {
    return <LoadingSkeleton variant="cards" count={3} />;
  }

  if (isError) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-muted-foreground">
          Failed to load your entries. Please check your connection.
        </p>
        <Button variant="outline" onClick={() => void loadEntries()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (allEntries.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No entries in this show"
        description="You haven't entered any classes in this show yet."
        action={{
          label: 'Browse Classes',
          onClick: () => navigate(`/shows/${showId}?tab=classes`),
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">My run schedule</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {totalClasses} {totalClasses === 1 ? 'class' : 'classes'} across {dogGroups.length}{' '}
              {dogGroups.length === 1 ? 'dog' : 'dogs'}. Times, armbands, judges, and results stay
              together here.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/shows/${showId}?tab=classes`)}
          className="mt-4 gap-1.5 sm:mt-0 sm:shrink-0"
        >
          <ListChecks className="h-4 w-4" />
          All classes
        </Button>
      </div>

      <WhereToBe entries={allEntries} showId={showId} />

      {dogGroups.map(group => (
        <DogEntriesSection key={group.dogId} group={group} showId={showId} />
      ))}
    </div>
  );
}
