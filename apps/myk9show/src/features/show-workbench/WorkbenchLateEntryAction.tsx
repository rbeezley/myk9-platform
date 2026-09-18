import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { buildShowDeskLateEntryPath } from '@/pages/RegistrationWizardPage.routes';
import {
  getClassesWithCapacity,
  type ClassWithCapacity,
} from '@/services/database/day-of-operations';

interface WorkbenchLateEntryActionProps {
  showId: string;
  /**
   * Set when the viewer manages this show but is NOT its trial secretary.
   * `buildShowDeskLateEntryPath` targets `/secretary/register/:showId`, which is
   * `ProtectedRoute(SECRETARY | SITE_ADMIN)`, so without this a club admin — on
   * a tab MYK9-630 phase 3 puts in their nav — pressed an enabled button and
   * landed on a bare "You don't have permission to access this page." wall.
   * Greyed with the same one-line reason the header Actions menu uses.
   */
  disabledReason?: string | undefined;
}

const classCapacityKey = (showId: string) => ['show-workbench', showId, 'class-capacity'] as const;

async function loadClassesWithCapacity(showId: string): Promise<ClassWithCapacity[]> {
  const { data, error } = await getClassesWithCapacity(showId);
  if (error) throw error;
  return data ?? [];
}

export function WorkbenchLateEntryAction({
  showId,
  disabledReason,
}: WorkbenchLateEntryActionProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    data: classes = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: classCapacityKey(showId),
    queryFn: () => loadClassesWithCapacity(showId),
    // No capacity read at all when the viewer could not act on the answer.
    enabled: Boolean(showId) && disabledReason === undefined,
  });

  const openClassCount = classes.filter(cls => cls.available_spots > 0).length;
  const canOpen =
    disabledReason === undefined &&
    Boolean(user?.id) &&
    openClassCount > 0 &&
    !isLoading &&
    !isError;
  // The role reason outranks the capacity detail: "3 classes with space" beside
  // a disabled button reads as a bug, not as a permission.
  const detail = disabledReason
    ? disabledReason
    : isError
      ? 'Class availability is unavailable'
      : isLoading
        ? 'Checking class availability'
        : openClassCount > 0
          ? `${openClassCount} class${openClassCount === 1 ? '' : 'es'} with space`
          : 'No classes with space';

  const lateEntryHref = buildShowDeskLateEntryPath(showId);

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
        onClick={() => navigate(lateEntryHref)}
        disabled={!canOpen}
      >
        <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
        Add late entry
      </Button>
    </section>
  );
}
