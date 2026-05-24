import { useEffect, useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import {
  useVolunteers,
  useVolunteerClassAssignments,
  useVolunteerGeneralAssignments,
  useVolunteerConflicts,
  useShowClassesForVolunteers,
  useAddVolunteer,
  useUpdateVolunteer,
  useDeleteVolunteer,
  useAssignToClass,
  useUnassignFromClass,
  useAssignToGeneralDuty,
  useUnassignFromGeneralDuty,
} from '@/hooks/queries/volunteerQueries';
import { VolunteerPool } from '@/components/volunteers/VolunteerPool';
import { VolunteerDialog } from '@/components/volunteers/VolunteerDialog';
import { ClassVolunteerCard } from '@/components/volunteers/ClassVolunteerCard';
import { GeneralDutyCard } from '@/components/volunteers/GeneralDutyCard';
import { SearchBar } from '@/components/common/SearchBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useVolunteerFilters } from './useVolunteerFilters';
import type { Volunteer, ClassInfo } from '@/types/volunteer';

const EMPTY_CONFLICT_MAP = new Map<string, Set<string>>();

export default function VolunteerSchedulingPage() {
  const [searchParams] = useSearchParams();
  const routeShowId = searchParams.get('showId') ?? undefined;
  const selectedShowId = useShowStore(s => s.selectedShowId);
  const selectShow = useShowStore(s => s.selectShow);
  const { trials } = useTrialStore();

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
  const showTrials = trials.filter(t => t.showId === activeShowId);

  const { data: volunteers = [], isLoading: loadingVols } = useVolunteers(showId);
  const { data: classAssignments = [], isLoading: loadingCA } =
    useVolunteerClassAssignments(showId);
  const { data: generalAssignments = [], isLoading: loadingGA } =
    useVolunteerGeneralAssignments(showId);
  const { data: classInfos = [], isLoading: loadingClasses } = useShowClassesForVolunteers(showId);
  const { data: conflictMap = EMPTY_CONFLICT_MAP } = useVolunteerConflicts(showId, volunteers);

  const isLoading = loadingVols || loadingCA || loadingGA || loadingClasses;

  const addVolunteer = useAddVolunteer();
  const updateVolunteer = useUpdateVolunteer();
  const deleteVolunteer = useDeleteVolunteer();
  const assignToClass = useAssignToClass(activeShowId);
  const unassignFromClass = useUnassignFromClass(activeShowId);
  const assignToGeneralDuty = useAssignToGeneralDuty(activeShowId);
  const unassignFromGeneralDuty = useUnassignFromGeneralDuty(activeShowId);

  const {
    search,
    setSearch,
    trialFilter,
    setTrialFilter,
    unfilledOnly,
    setUnfilledOnly,
    filteredClasses,
    filteredDutyRoles,
  } = useVolunteerFilters({ classes: classInfos, classAssignments, generalAssignments });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);

  const assignmentsByClass = useMemo(() => {
    const map = new Map<string, typeof classAssignments>();
    for (const a of classAssignments) {
      if (!map.has(a.classId)) map.set(a.classId, []);
      map.get(a.classId)!.push(a);
    }
    return map;
  }, [classAssignments]);

  const assignmentsByDuty = useMemo(() => {
    const map = new Map<string, typeof generalAssignments>();
    for (const a of generalAssignments) {
      if (!map.has(a.roleName)) map.set(a.roleName, []);
      map.get(a.roleName)!.push(a);
    }
    return map;
  }, [generalAssignments]);

  const classesByTrial = useMemo(() => {
    const map = new Map<string, ClassInfo[]>();
    for (const cls of filteredClasses) {
      if (!map.has(cls.trialId)) map.set(cls.trialId, []);
      map.get(cls.trialId)!.push(cls);
    }
    return map;
  }, [filteredClasses]);

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
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a show from the sidebar to manage volunteers.
        </p>
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

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search classes, volunteers..."
          className="w-64"
        />
        <Select value={trialFilter} onValueChange={setTrialFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Trials" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trials</SelectItem>
            {showTrials.map(t => (
              <SelectItem key={t.id} value={t.id}>
                Trial {t.trialNumber} — {t.trialDate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unfilledOnly}
            onChange={e => setUnfilledOnly(e.target.checked)}
            className="rounded border-input"
          />
          <Label className="cursor-pointer text-sm font-normal">Unfilled only</Label>
        </label>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && classesByTrial.size === 0 && filteredDutyRoles.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            {classInfos.length === 0
              ? 'This show has no classes yet. Create trials and classes first.'
              : 'No classes match your filters.'}
          </p>
        </div>
      )}

      {!isLoading &&
        Array.from(classesByTrial.entries()).map(([trialId, trialClasses]) => {
          const trial = showTrials.find(t => t.id === trialId);
          return (
            <section key={trialId}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                Trial {trial?.trialNumber ?? '?'} — {trial?.trialDate ?? ''}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {trialClasses.map(cls => (
                  <ClassVolunteerCard
                    key={cls.id}
                    classId={cls.id}
                    className={cls.name}
                    classMeta={cls.meta}
                    assignments={assignmentsByClass.get(cls.id) ?? []}
                    volunteers={volunteers}
                    conflictMap={conflictMap}
                    onAssign={(volId, classId, roleName) =>
                      assignToClass.mutate({ volunteerId: volId, classId, roleName })
                    }
                    onUnassign={id => unassignFromClass.mutate(id)}
                  />
                ))}
              </div>
            </section>
          );
        })}

      {!isLoading && filteredDutyRoles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">General Duties</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredDutyRoles.map(role => (
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
