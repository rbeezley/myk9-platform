import { useState, useMemo } from 'react';
import { RING_ROLES, GENERAL_DUTY_ROLES } from '@/types/volunteer';
import type { ClassAssignment, GeneralAssignment } from '@/types/volunteer';

interface ClassInfo {
  id: string;
  name: string;
  trialId: string;
  meta: string;
}

interface UseVolunteerFiltersInput {
  classes: ClassInfo[];
  classAssignments: ClassAssignment[];
  generalAssignments: GeneralAssignment[];
}

export function useVolunteerFilters({
  classes,
  classAssignments,
  generalAssignments,
}: UseVolunteerFiltersInput) {
  const [search, setSearch] = useState('');
  const [trialFilter, setTrialFilter] = useState('all');
  const [unfilledOnly, setUnfilledOnly] = useState(false);

  const filteredClasses = useMemo(() => {
    let result = classes;

    // Trial filter
    if (trialFilter !== 'all') {
      result = result.filter(c => c.trialId === trialFilter);
    }

    // Search filter — match class name or assigned volunteer name
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => {
        if (c.name.toLowerCase().includes(q)) return true;
        if (c.meta.toLowerCase().includes(q)) return true;
        const classAssigns = classAssignments.filter(a => a.classId === c.id);
        return classAssigns.some(a => a.volunteerName.toLowerCase().includes(q));
      });
    }

    // Unfilled-only — hide classes where all ring roles have at least one assignment
    if (unfilledOnly) {
      result = result.filter(c => {
        const classAssigns = classAssignments.filter(a => a.classId === c.id);
        const filledRoles = new Set(classAssigns.map(a => a.roleName));
        return RING_ROLES.some(role => !filledRoles.has(role));
      });
    }

    return result;
  }, [classes, classAssignments, search, trialFilter, unfilledOnly]);

  const filteredDutyRoles = useMemo(() => {
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
  }, [generalAssignments, search, unfilledOnly]);

  return {
    search,
    setSearch,
    trialFilter,
    setTrialFilter,
    unfilledOnly,
    setUnfilledOnly,
    filteredClasses,
    filteredDutyRoles,
  };
}
