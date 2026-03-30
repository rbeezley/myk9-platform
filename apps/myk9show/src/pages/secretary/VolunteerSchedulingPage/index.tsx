import { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import {
  useVolunteers,
  useVolunteerClassAssignments,
  useVolunteerGeneralAssignments,
  useVolunteerConflicts,
  useAddVolunteer,
  useUpdateVolunteer,
  useDeleteVolunteer,
  useAssignToClass,
  useUnassignFromClass,
  useAssignToGeneralDuty,
  useUnassignFromGeneralDuty,
} from '@/hooks/queries/volunteerQueries';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
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
import type { Volunteer } from '@/types/volunteer';

interface ClassInfo {
  id: string;
  name: string;
  trialId: string;
  meta: string;
}

function useShowClasses(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.showClasses(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select(
          'id, name, element, level, start_time, trial:trials!inner(id, trial_date, trial_number, show_id)'
        )
        .eq('trial.show_id' as string, showId!);
      if (error) throw error;
      return (data ?? []).map((row): ClassInfo => {
        const trial = row.trial as unknown as Record<string, unknown>;
        const displayName = [row.element, row.level].filter(Boolean).join(' ') || row.name;
        const metaParts = [row.start_time ?? null].filter(Boolean);
        return {
          id: row.id,
          name: displayName,
          trialId: trial.id as string,
          meta: metaParts.join(' \u2022 '),
        };
      });
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });
}

export default function VolunteerSchedulingPage() {
  const { selectedShowId } = useShowStore();
  const { trials } = useTrialStore();
  const showTrials = trials.filter(t => t.showId === selectedShowId);

  // Data fetching
  const { data: volunteers = [], isLoading: loadingVols } = useVolunteers(
    selectedShowId || undefined
  );
  const { data: classAssignments = [], isLoading: loadingCA } = useVolunteerClassAssignments(
    selectedShowId || undefined
  );
  const { data: generalAssignments = [], isLoading: loadingGA } = useVolunteerGeneralAssignments(
    selectedShowId || undefined
  );
  const { data: classInfos = [], isLoading: loadingClasses } = useShowClasses(
    selectedShowId || undefined
  );
  const { data: conflictMap = new Map() } = useVolunteerConflicts(
    selectedShowId || undefined,
    volunteers
  );

  const isLoading = loadingVols || loadingCA || loadingGA || loadingClasses;

  // Mutations
  const addVolunteer = useAddVolunteer();
  const updateVolunteer = useUpdateVolunteer();
  const deleteVolunteer = useDeleteVolunteer();
  const assignToClass = useAssignToClass(selectedShowId ?? '');
  const unassignFromClass = useUnassignFromClass(selectedShowId ?? '');
  const assignToGeneralDuty = useAssignToGeneralDuty(selectedShowId ?? '');
  const unassignFromGeneralDuty = useUnassignFromGeneralDuty(selectedShowId ?? '');

  // Filtering
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

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);

  // Group classes by trial
  const classesByTrial = useMemo(() => {
    const map = new Map<string, ClassInfo[]>();
    for (const cls of filteredClasses) {
      if (!map.has(cls.trialId)) map.set(cls.trialId, []);
      map.get(cls.trialId)!.push(cls);
    }
    return map;
  }, [filteredClasses]);

  // Handlers
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
    if (editingVolunteer) {
      await updateVolunteer.mutateAsync({
        id: editingVolunteer.id,
        showId: selectedShowId!,
        ...data,
      });
    } else {
      await addVolunteer.mutateAsync({
        showId: selectedShowId!,
        ...data,
      });
    }
  }

  async function handleDelete(id: string) {
    await deleteVolunteer.mutateAsync({ id, showId: selectedShowId! });
  }

  // Guard: no show selected
  if (!selectedShowId) {
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

      {/* Volunteer Pool */}
      <VolunteerPool
        volunteers={volunteers}
        onAddClick={handleAddClick}
        onEditClick={handleEditClick}
      />

      {/* Toolbar */}
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

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && classesByTrial.size === 0 && filteredDutyRoles.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            {classInfos.length === 0
              ? 'This show has no classes yet. Create trials and classes first.'
              : 'No classes match your filters.'}
          </p>
        </div>
      )}

      {/* Class cards grouped by trial */}
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
                    assignments={classAssignments.filter(a => a.classId === cls.id)}
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

      {/* General Duties */}
      {!isLoading && filteredDutyRoles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">General Duties</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredDutyRoles.map(role => (
              <GeneralDutyCard
                key={role}
                roleName={role}
                assignments={generalAssignments.filter(a => a.roleName === role)}
                volunteers={volunteers}
                onAssign={volId =>
                  assignToGeneralDuty.mutate({
                    volunteerId: volId,
                    showId: selectedShowId!,
                    roleName: role,
                  })
                }
                onUnassign={id => unassignFromGeneralDuty.mutate(id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Dialog */}
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
