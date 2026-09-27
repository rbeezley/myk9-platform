import { useMemo, useState } from 'react';
import { RING_ROLES, GENERAL_DUTY_ROLES } from '@/types/volunteer';
import type { ClassInfo, ClassAssignment, GeneralAssignment } from '@/types/volunteer';

interface UseVolunteerFiltersInput {
  classes: ClassInfo[];
  classAssignments: ClassAssignment[];
  generalAssignments: GeneralAssignment[];
}

function filterClasses(
  classes: ClassInfo[],
  assignmentsByClass: Map<string, ClassAssignment[]>,
  search: string,
  trialFilter: string,
  unfilledOnly: boolean
): ClassInfo[] {
  let result = classes;

  if (trialFilter !== 'all') {
    result = result.filter(c => c.trialId === trialFilter);
  }

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(c => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.meta.toLowerCase().includes(q)) return true;
      const classAssigns = assignmentsByClass.get(c.id) ?? [];
      return classAssigns.some(a => a.volunteerName.toLowerCase().includes(q));
    });
  }

  if (unfilledOnly) {
    result = result.filter(c => {
      const classAssigns = assignmentsByClass.get(c.id) ?? [];
      const filledRoles = new Set(classAssigns.map(a => a.roleName));
      return RING_ROLES.some(role => !filledRoles.has(role));
    });
  }

  return result;
}

function filterDutyRoles(
  generalAssignments: GeneralAssignment[],
  search: string,
  unfilledOnly: boolean
): string[] {
  let roles = [...GENERAL_DUTY_ROLES] as string[];

  // Search filter — match role name or assigned volunteer name
  if (search) {
    const q = search.toLowerCase();
    roles = roles.filter(role => {
      if (role.toLowerCase().includes(q)) return true;
      return generalAssignments
        .filter(a => a.roleName === role)
        .some(a => a.volunteerName.toLowerCase().includes(q));
    });
  }

  // Unfilled-only — hide duties that have at least one assignment
  if (unfilledOnly) {
    const filledRoles = new Set(generalAssignments.map(a => a.roleName));
    roles = roles.filter(role => !filledRoles.has(role));
  }

  return roles;
}

export function useVolunteerFilters({
  classes,
  classAssignments,
  generalAssignments,
}: UseVolunteerFiltersInput) {
  const [search, setSearch] = useState('');
  const [trialFilter, setTrialFilter] = useState('all');
  const [unfilledOnly, setUnfilledOnly] = useState(false);

  const assignmentsByClass = useMemo(() => {
    const map = new Map<string, ClassAssignment[]>();
    for (const a of classAssignments) {
      if (!map.has(a.classId)) map.set(a.classId, []);
      map.get(a.classId)!.push(a);
    }
    return map;
  }, [classAssignments]);

  const filteredClasses = useMemo(
    () => filterClasses(classes, assignmentsByClass, search, trialFilter, unfilledOnly),
    [classes, assignmentsByClass, search, trialFilter, unfilledOnly]
  );

  const filteredDutyRoles = useMemo(
    () => filterDutyRoles(generalAssignments, search, unfilledOnly),
    [generalAssignments, search, unfilledOnly]
  );

  // Counts for the "All classes" / "Unfilled only" view tabs, scoped by
  // search and trial like the list itself. Each view's count is computed
  // with that view's own unfilledOnly value, independent of the current
  // toggle state, so it reads as "what selecting this view would show".
  const allCount = useMemo(
    () =>
      filterClasses(classes, assignmentsByClass, search, trialFilter, false).length +
      filterDutyRoles(generalAssignments, search, false).length,
    [classes, assignmentsByClass, search, trialFilter, generalAssignments]
  );

  const unfilledCount = useMemo(
    () =>
      filterClasses(classes, assignmentsByClass, search, trialFilter, true).length +
      filterDutyRoles(generalAssignments, search, true).length,
    [classes, assignmentsByClass, search, trialFilter, generalAssignments]
  );

  return {
    search,
    setSearch,
    trialFilter,
    setTrialFilter,
    unfilledOnly,
    setUnfilledOnly,
    filteredClasses,
    filteredDutyRoles,
    allCount,
    unfilledCount,
  };
}
