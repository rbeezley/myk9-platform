import { renderHook, act } from '@testing-library/react';
import { useVolunteerFilters } from '../useVolunteerFilters';
import { RING_ROLES, GENERAL_DUTY_ROLES } from '@/types/volunteer';
import type { ClassAssignment, GeneralAssignment } from '@/types/volunteer';

interface ClassInfo {
  id: string;
  name: string;
  trialId: string;
  meta: string;
}

const classes: ClassInfo[] = [
  { id: 'c-1', name: 'Containers Novice', trialId: 't-1', meta: 'Ring 1' },
  { id: 'c-2', name: 'Interior Advanced', trialId: 't-2', meta: 'Ring 2' },
];

const classAssignments: ClassAssignment[] = [
  {
    id: 'a-1',
    volunteerId: 'v-1',
    classId: 'c-1',
    roleName: 'Gate Steward',
    status: 'assigned',
    notes: null,
    createdAt: '',
    volunteerName: 'Sarah Miller',
  },
];

const generalAssignments: GeneralAssignment[] = [
  {
    id: 'ga-1',
    volunteerId: 'v-1',
    showId: 'show-1',
    roleName: 'Hospitality',
    shiftStart: null,
    shiftEnd: null,
    status: 'assigned',
    notes: null,
    createdAt: '',
    volunteerName: 'Sarah Miller',
  },
];

describe('useVolunteerFilters', () => {
  it('returns all classes and duties when no filters applied', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    expect(result.current.filteredClasses).toHaveLength(2);
    expect(result.current.filteredDutyRoles).toEqual([...GENERAL_DUTY_ROLES]);
  });

  it('filters classes by search text (class name)', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setSearch('Containers'));
    expect(result.current.filteredClasses).toHaveLength(1);
    expect(result.current.filteredClasses[0].id).toBe('c-1');
  });

  it('filters classes by trial', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setTrialFilter('t-1'));
    expect(result.current.filteredClasses).toHaveLength(1);
    expect(result.current.filteredClasses[0].trialId).toBe('t-1');
  });

  it('trial filter does not affect general duties', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setTrialFilter('t-1'));
    expect(result.current.filteredDutyRoles).toEqual([...GENERAL_DUTY_ROLES]);
  });

  it('unfilled-only shows classes with at least one empty role', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setUnfilledOnly(true));
    // c-1 has Gate Steward filled but Timer and Ring Steward empty → still shown
    // c-2 has no assignments → shown
    expect(result.current.filteredClasses).toHaveLength(2);
  });

  it('unfilled-only hides classes where all roles are filled', () => {
    const fullAssignments: ClassAssignment[] = RING_ROLES.map((role, i) => ({
      id: `a-${i}`,
      volunteerId: `v-${i}`,
      classId: 'c-1',
      roleName: role,
      status: 'assigned',
      notes: null,
      createdAt: '',
      volunteerName: `Vol ${i}`,
    }));
    const { result } = renderHook(() =>
      useVolunteerFilters({
        classes,
        classAssignments: fullAssignments,
        generalAssignments: [],
      })
    );
    act(() => result.current.setUnfilledOnly(true));
    // c-1 has all 3 roles filled → hidden; c-2 has none → shown
    expect(result.current.filteredClasses).toHaveLength(1);
    expect(result.current.filteredClasses[0].id).toBe('c-2');
  });

  it('unfilled-only filters general duties too', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setUnfilledOnly(true));
    // Hospitality has 1 assignment → filled → hidden; others empty → shown
    expect(result.current.filteredDutyRoles).not.toContain('Hospitality');
    expect(result.current.filteredDutyRoles).toContain('Equipment');
  });

  it('search filters general duties by assigned volunteer name', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => result.current.setSearch('Sarah'));
    // "Sarah" matches Hospitality (assigned to Sarah) + class c-1 (Sarah assigned)
    expect(result.current.filteredDutyRoles).toContain('Hospitality');
    expect(result.current.filteredClasses).toHaveLength(1);
    expect(result.current.filteredClasses[0].id).toBe('c-1');
  });

  it('combines filters correctly', () => {
    const { result } = renderHook(() =>
      useVolunteerFilters({ classes, classAssignments, generalAssignments })
    );
    act(() => {
      result.current.setTrialFilter('t-1');
      result.current.setSearch('Containers');
    });
    expect(result.current.filteredClasses).toHaveLength(1);
  });
});
