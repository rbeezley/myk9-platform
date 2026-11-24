import { useEffect, useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useShowStore } from '@/store/showStore';
import { getShowHomeHref } from '@/features/show-map/cockpit/cockpitRoutes';
import {
  useVolunteers,
  useVolunteerGeneralAssignments,
  useAddVolunteer,
  useUpdateVolunteer,
  useDeleteVolunteer,
  useAssignToGeneralDuty,
  useUnassignFromGeneralDuty,
} from '@/hooks/queries/volunteerQueries';
import { VolunteerPool } from '@/components/volunteers/VolunteerPool';
import { VolunteerDialog } from '@/components/volunteers/VolunteerDialog';
import { GeneralDutyCard } from '@/components/volunteers/GeneralDutyCard';
import { GENERAL_DUTY_ROLES } from '@/types/volunteer';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/ErrorState';
import type { Volunteer } from '@/types/volunteer';

export default function VolunteerSchedulingPage() {
  const [searchParams] = useSearchParams();
  const routeShowId = searchParams.get('showId') ?? undefined;
  const selectedShowId = useShowStore(s => s.selectedShowId);
  const selectShow = useShowStore(s => s.selectShow);

  // INTENT: When the workbench's VolunteersCard links here with ?showId=X
  // the explicit route value wins over whatever the sidebar last set as
  // selectedShowId — otherwise a stale sidebar selection or a multi-show
  // account silently lands the secretary on the wrong show's volunteers.
  // We also sync the store so downstream surfaces (sidebar highlight,
  // other show-scoped queries) reflect the actively-viewed show.
  const activeShowId = routeShowId || selectedShowId || '';
  const showId = activeShowId || undefined;
  useEffect(() => {
    if (routeShowId && routeShowId !== selectedShowId) selectShow(routeShowId);
  }, [routeShowId, selectedShowId, selectShow]);

  const volunteersQuery = useVolunteers(showId);
  const generalAssignmentsQuery = useVolunteerGeneralAssignments(showId);
  const { data: volunteers = [], isLoading: loadingVols } = volunteersQuery;
  const { data: generalAssignments = [], isLoading: loadingGA } = generalAssignmentsQuery;

  // MYK9-1726: a load that failed with nothing cached would otherwise fall back to [] and read
  // as fact: "no volunteers yet", every job unfilled (inviting duplicate adds
  // and assignments). A failed background refresh keeps the cached data and leaves the page be.
  const failedLoads = [volunteersQuery, generalAssignmentsQuery].filter(
    query => query.isError && query.data === undefined
  );

  const isLoading = loadingVols || loadingGA;

  const addVolunteer = useAddVolunteer();
  const updateVolunteer = useUpdateVolunteer();
  const deleteVolunteer = useDeleteVolunteer();
  const assignToGeneralDuty = useAssignToGeneralDuty(activeShowId);
  const unassignFromGeneralDuty = useUnassignFromGeneralDuty(activeShowId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);

  const assignmentsByDuty = useMemo(() => {
    const map = new Map<string, typeof generalAssignments>();
    for (const a of generalAssignments) {
      if (!map.has(a.roleName)) map.set(a.roleName, []);
      map.get(a.roleName)!.push(a);
    }
    return map;
  }, [generalAssignments]);

  function handleAddClick() {
    setEditingVolunteer(null);
    setDialogOpen(true);
  }

  function handleEditClick(vol: Volunteer) {
    setEditingVolunteer(vol);
    setDialogOpen(true);
  }

  async function handleSave(data: {
    name: string;
    phone: string | null;
    notes: string | null;
    personId: string | null;
  }) {
    if (!activeShowId) return;
    if (editingVolunteer) {
      await updateVolunteer.mutateAsync({
        id: editingVolunteer.id,
        showId: activeShowId,
        ...data,
      });
    } else {
      await addVolunteer.mutateAsync({
        showId: activeShowId,
        ...data,
      });
    }
  }

  async function handleDelete(id: string) {
    if (!activeShowId) return;
    await deleteVolunteer.mutateAsync({ id, showId: activeShowId });
  }

  if (!activeShowId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-lg font-semibold">Select a Show</h2>
        {/* F32: this used to say "Choose a show from the sidebar", but the sidebar
            has no show picker -- it carries a single link to the current live show,
            and following it navigates away from Volunteers. Name the path that
            actually works: the page needs ?showId=, which the show page's Actions
            menu row (Show logistics, Volunteers) appends. */}
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Volunteer scheduling is per show. Open the show you want, then choose{' '}
          <span className="font-medium text-foreground">Actions &rarr; Volunteers</span> on its
          Overview.
        </p>
        <Link
          to="/secretary/dashboard"
          className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to your shows
        </Link>
      </div>
    );
  }

  if (failedLoads.length > 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <h1 className="text-xl font-bold">Volunteer Scheduling</h1>
        <ErrorState
          message="Couldn't load this show's volunteer schedule"
          description="Nothing was lost. Tap Try Again to reload it."
          headingLevel={2}
          onRetry={() => failedLoads.forEach(query => void query.refetch())}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-bold">Volunteer Scheduling</h1>

      <VolunteerPool
        volunteers={volunteers}
        onAddClick={handleAddClick}
        onEditClick={handleEditClick}
      />

      <p className="text-sm text-muted-foreground">
        Ring stewards are assigned to each class in{' '}
        <Link
          to={getShowHomeHref({ showId: activeShowId, state: { statuses: [] } })}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Show Desk
        </Link>
        , next to the judge.
      </p>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: GENERAL_DUTY_ROLES.length }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">General Duties</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GENERAL_DUTY_ROLES.map(role => (
              <GeneralDutyCard
                key={role}
                roleName={role}
                assignments={assignmentsByDuty.get(role) ?? []}
                volunteers={volunteers}
                onAssign={volId =>
                  assignToGeneralDuty.mutate({
                    volunteerId: volId,
                    showId: activeShowId,
                    roleName: role,
                  })
                }
                onUnassign={id => unassignFromGeneralDuty.mutate(id)}
              />
            ))}
          </div>
        </section>
      )}

      <VolunteerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        volunteer={editingVolunteer}
      />
    </div>
  );
}
