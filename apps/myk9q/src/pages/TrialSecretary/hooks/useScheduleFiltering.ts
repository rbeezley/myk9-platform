/**
 * useScheduleFiltering Hook
 *
 * Handles filtering logic for the volunteer schedule board.
 * Supports multi-select filtering by volunteers and judges.
 */

import { useMemo } from 'react';
import type { Volunteer, ClassInfo, ScheduleRole, ClassAssignment, GeneralAssignment } from '../types';

// Helper to format class name from components
function formatClassName(cls: ClassInfo): string {
  const parts = [cls.level];
  if (cls.section) parts.push(cls.section);
  parts.push(cls.element);
  return parts.join(' ');
}

interface UseScheduleFilteringParams {
  classes: ClassInfo[];
  roles: ScheduleRole[];
  volunteers: Volunteer[];
  classAssignments: ClassAssignment[];
  generalAssignments: GeneralAssignment[];
  searchTerm: string;
  selectedVolunteers: string[];
  selectedJudges: string[];
}

interface UseScheduleFilteringResult {
  hasAnyFilter: boolean;
  filteredClasses: ClassInfo[];
  filteredGeneralRoles: ScheduleRole[];
  uniqueJudges: string[];
}

export function useScheduleFiltering({
  classes,
  roles,
  volunteers,
  classAssignments,
  generalAssignments,
  searchTerm,
  selectedVolunteers,
  selectedJudges,
}: UseScheduleFilteringParams): UseScheduleFilteringResult {
  // Check if any filters are active
  const hasAnyFilter = searchTerm.trim().length > 0 || selectedVolunteers.length > 0 || selectedJudges.length > 0;

  // Filter classes based on search term and/or multi-select
  const filteredClasses = useMemo(() => {
    if (!hasAnyFilter) return classes;

    const searchLower = searchTerm.toLowerCase().trim();
    const selectedVolsLower = selectedVolunteers.map(v => v.toLowerCase());
    const selectedJudgesLower = selectedJudges.map(j => j.toLowerCase());

    return classes.filter(cls => {
      // Get volunteer names assigned to this class
      const classVolunteerIds = classAssignments
        .filter(a => a.classId === cls.id)
        .flatMap(a => a.volunteerIds);
      const classVolunteerNames = classVolunteerIds
        .map(vid => volunteers.find(v => v.id === vid)?.name.toLowerCase())
        .filter((name): name is string => !!name);

      // Check multi-select conditions
      const matchesSelectedVolunteers = selectedVolsLower.length === 0 ||
        selectedVolsLower.some(sv => classVolunteerNames.includes(sv));
      const matchesSelectedJudges = selectedJudgesLower.length === 0 ||
        selectedJudgesLower.some(sj => cls.judge_name?.toLowerCase() === sj);

      // If multi-select is active, both conditions must be true (AND)
      const matchesMultiSelect = (selectedVolunteers.length > 0 || selectedJudges.length > 0) &&
        matchesSelectedVolunteers && matchesSelectedJudges;

      // Check text search (if any)
      let matchesTextSearch = false;
      if (searchLower) {
        const className = formatClassName(cls).toLowerCase();
        matchesTextSearch = className.includes(searchLower) ||
          (cls.judge_name?.toLowerCase().includes(searchLower) ?? false) ||
          classVolunteerNames.some(name => name.includes(searchLower));
      }

      // Show if matches multi-select OR text search
      return matchesMultiSelect || matchesTextSearch;
    });
  }, [classes, classAssignments, volunteers, searchTerm, selectedVolunteers, selectedJudges, hasAnyFilter]);

  // Filter general duties based on filters
  const filteredGeneralRoles = useMemo(() => {
    const activeGeneralRoles = roles.filter(r => !r.isRingRole && r.isActive);

    if (!hasAnyFilter) return activeGeneralRoles;

    const searchLower = searchTerm.toLowerCase().trim();
    const selectedVolsLower = selectedVolunteers.map(v => v.toLowerCase());

    return activeGeneralRoles.filter(role => {
      // Get volunteer names assigned to this role
      const assignment = generalAssignments.find(a => a.roleId === role.id);
      const roleVolunteerNames = assignment?.volunteerIds
        .map(vid => volunteers.find(v => v.id === vid)?.name.toLowerCase())
        .filter((name): name is string => !!name) ?? [];

      // Check multi-select (only volunteers apply to general duties, not judges)
      const matchesSelectedVolunteers = selectedVolsLower.length === 0 ||
        selectedVolsLower.some(sv => roleVolunteerNames.includes(sv));

      // If volunteer multi-select is active and no judge selected, show matching general duties
      const matchesMultiSelect = selectedVolunteers.length > 0 &&
        selectedJudges.length === 0 &&
        matchesSelectedVolunteers;

      // Check text search
      let matchesTextSearch = false;
      if (searchLower) {
        matchesTextSearch = role.name.toLowerCase().includes(searchLower) ||
          roleVolunteerNames.some(name => name.includes(searchLower));
      }

      return matchesMultiSelect || matchesTextSearch;
    });
  }, [roles, generalAssignments, volunteers, searchTerm, selectedVolunteers, selectedJudges, hasAnyFilter]);

  // Get unique judges from classes for quick-pick
  const uniqueJudges = useMemo(() => {
    const judges = classes
      .map(cls => cls.judge_name)
      .filter((name): name is string => !!name);
    return [...new Set(judges)].sort();
  }, [classes]);

  return {
    hasAnyFilter,
    filteredClasses,
    filteredGeneralRoles,
    uniqueJudges,
  };
}
