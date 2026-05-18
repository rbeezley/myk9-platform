import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryClient';
import {
  getClassesWithCapacity,
  type ClassWithCapacity,
} from '@/services/database/day-of-operations';
import { DayOfEntryDialog } from '@/pages/secretary/DayOfOperationsPage/DayOfEntryDialog';

interface WorkbenchLateEntryActionProps {
  showId: string;
}

const classCapacityKey = (showId: string) => ['show-workbench', showId, 'class-capacity'] as const;

async function loadClassesWithCapacity(showId: string): Promise<ClassWithCapacity[]> {
  const { data, error } = await getClassesWithCapacity(showId);
  if (error) throw error;
  return data ?? [];
}

export function WorkbenchLateEntryAction({ showId }: WorkbenchLateEntryActionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const {
    data: classes = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: classCapacityKey(showId),
    queryFn: () => loadClassesWithCapacity(showId),
    enabled: Boolean(showId),
  });

  const openClassCount = classes.filter(cls => cls.available_spots > 0).length;
  const canOpen = Boolean(user?.id) && openClassCount > 0 && !isLoading && !isError;
  const detail = isError
    ? 'Class availability is unavailable'
    : isLoading
      ? 'Checking class availability'
      : openClassCount > 0
        ? `${openClassCount} class${openClassCount === 1 ? '' : 'es'} with space`
        : 'No classes with space';

  function handleSuccess() {
    void queryClient.invalidateQueries({ queryKey: classCapacityKey(showId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.checkInReport(showId) });
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-md border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
      aria-labelledby="workbench-late-entry-title"
    >
      <div className="min-w-0">
        <h3 id="workbench-late-entry-title" className="text-base font-semibold text-foreground">
          Late entry
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
      <Button
        type="button"
        className="shrink-0"
        onClick={() => setIsDialogOpen(true)}
        disabled={!canOpen}
      >
        <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
        Add late entry
      </Button>
      <DayOfEntryDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        showId={showId}
        userId={user?.id}
        classes={classes}
        onSuccess={handleSuccess}
      />
    </section>
  );
}
