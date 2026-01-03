/**
 * Schedule Board Hook
 *
 * Manages steward schedule state with Supabase persistence.
 * Falls back to localStorage when offline.
 * Fetches class data from the trial for scheduling context.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import type {
  ScheduleRole,
  Volunteer,
  ClassAssignment,
  GeneralAssignment,
  ScheduleState,
  ClassInfo,
} from '../types';

const STORAGE_KEY_PREFIX = 'myK9Q-schedule-';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Database row types (snake_case from Supabase)
interface DbVolunteerRole {
  id: string;
  license_key: string;
  name: string;
  color: string;
  is_ring_role: boolean;
  is_active: boolean;
  sort_order: number;
}

interface DbVolunteer {
  id: string;
  license_key: string;
  name: string;
  phone: string | null;
  is_exhibitor: boolean;
  exhibitor_id: number | null;
  entered_class_ids: number[];
  notes: string | null;
}

interface DbClassAssignment {
  id: string;
  license_key: string;
  class_id: number;
  role_id: string;
  volunteer_id: string;
}

interface DbGeneralAssignment {
  id: string;
  license_key: string;
  role_id: string;
  volunteer_id: string;
  description: string | null;
  time_range: string | null;
}

// Convert DB rows to app types
function dbRoleToApp(row: DbVolunteerRole): ScheduleRole {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isRingRole: row.is_ring_role,
    isActive: row.is_active,
  };
}

function dbVolunteerToApp(row: DbVolunteer): Volunteer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    isExhibitor: row.is_exhibitor,
    exhibitorId: row.exhibitor_id ?? undefined,
    enteredClassIds: row.entered_class_ids ?? [],
    notes: row.notes ?? undefined,
  };
}

// Group class assignments by class+role (DB stores one row per volunteer)
function groupClassAssignments(rows: DbClassAssignment[]): ClassAssignment[] {
  const grouped = new Map<string, ClassAssignment>();

  for (const row of rows) {
    const key = `${row.class_id}-${row.role_id}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.volunteerIds.push(row.volunteer_id);
    } else {
      grouped.set(key, {
        id: row.id, // Use first row's ID
        classId: row.class_id,
        roleId: row.role_id,
        volunteerIds: [row.volunteer_id],
      });
    }
  }

  return Array.from(grouped.values());
}

// Group general assignments by role (DB stores one row per volunteer)
function groupGeneralAssignments(rows: DbGeneralAssignment[]): GeneralAssignment[] {
  const grouped = new Map<string, GeneralAssignment>();

  for (const row of rows) {
    const existing = grouped.get(row.role_id);

    if (existing) {
      existing.volunteerIds.push(row.volunteer_id);
    } else {
      grouped.set(row.role_id, {
        id: row.id,
        roleId: row.role_id,
        volunteerIds: [row.volunteer_id],
        description: row.description ?? undefined,
        timeRange: row.time_range ?? undefined,
      });
    }
  }

  return Array.from(grouped.values());
}

export function useScheduleBoard() {
  const { showContext } = useAuth();
  const licenseKey = showContext?.licenseKey;
  const storageKey = `${STORAGE_KEY_PREFIX}${licenseKey || 'default'}`;

  // Class data from Supabase
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingCount, setSyncingCount] = useState(0);
  const isSyncing = syncingCount > 0;

  // Helper to wrap async sync operations and track in-flight count
  const withSyncTracking = useCallback(async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
    setSyncingCount(c => c + 1);
    try {
      return await operation();
    } finally {
      setSyncingCount(c => c - 1);
    }
  }, []);

  // Schedule state
  const [roles, setRoles] = useState<ScheduleRole[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [classAssignments, setClassAssignments] = useState<ClassAssignment[]>([]);
  const [generalAssignments, setGeneralAssignments] = useState<GeneralAssignment[]>([]);

  // Track if initial load is complete to avoid saving empty state
  const isInitialized = useRef(false);
  const isMigrating = useRef(false);

  // Load schedule data from Supabase (or localStorage fallback)
  useEffect(() => {
    async function loadScheduleData() {
      if (!licenseKey) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Try to load from Supabase first
        const [rolesResult, volunteersResult, classAssignResult, generalAssignResult] = await Promise.all([
          supabase.from('volunteer_roles').select('*').eq('license_key', licenseKey),
          supabase.from('volunteers').select('*').eq('license_key', licenseKey),
          supabase.from('volunteer_class_assignments').select('*').eq('license_key', licenseKey),
          supabase.from('volunteer_general_assignments').select('*').eq('license_key', licenseKey),
        ]);

        // Check if any data exists in Supabase
        const hasSupabaseData =
          (rolesResult.data && rolesResult.data.length > 0) ||
          (volunteersResult.data && volunteersResult.data.length > 0);

        if (hasSupabaseData) {
          // Load from Supabase
          setRoles(rolesResult.data?.map(dbRoleToApp) || getDefaultRoles());
          setVolunteers(volunteersResult.data?.map(dbVolunteerToApp) || []);
          setClassAssignments(groupClassAssignments(classAssignResult.data || []));
          setGeneralAssignments(groupGeneralAssignments(generalAssignResult.data || []));
        } else {
          // Check localStorage for existing data to migrate
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const state = JSON.parse(stored);

            // Set state from localStorage
            const localRoles = state.roles || getDefaultRoles();
            const localVolunteers = state.volunteers || [];
            const localClassAssignments = state.classAssignments || [];

            // Migrate old generalAssignments format
            const localGeneralAssignments = (state.generalAssignments || []).map((a: any) => {
              if ('volunteerId' in a && !('volunteerIds' in a)) {
                return {
                  id: a.id,
                  roleId: a.roleId,
                  volunteerIds: a.volunteerId ? [a.volunteerId] : [],
                  description: a.description,
                  timeRange: a.timeRange,
                } as GeneralAssignment;
              }
              return a as GeneralAssignment;
            });

            setRoles(localRoles);
            setVolunteers(localVolunteers);
            setClassAssignments(localClassAssignments);
            setGeneralAssignments(localGeneralAssignments);

            // Migrate to Supabase in background
            isMigrating.current = true;
            setSyncingCount(c => c + 1);
            migrateToSupabase(licenseKey, localRoles, localVolunteers, localClassAssignments, localGeneralAssignments)
              .then(() => {
                isMigrating.current = false;
                setSyncingCount(c => c - 1);
              })
              .catch(err => {
                console.error('[useScheduleBoard] Migration failed:', err);
                isMigrating.current = false;
                setSyncingCount(c => c - 1);
              });
          } else {
            // No data anywhere, use defaults
            setRoles(getDefaultRoles());
          }
        }

        isInitialized.current = true;
      } catch (error) {
        console.error('[useScheduleBoard] Failed to load from Supabase, using localStorage:', error);

        // Fall back to localStorage
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const state = JSON.parse(stored);
            setRoles(state.roles || getDefaultRoles());
            setVolunteers(state.volunteers || []);
            setClassAssignments(state.classAssignments || []);
            setGeneralAssignments(state.generalAssignments || []);
          } else {
            setRoles(getDefaultRoles());
          }
        } catch (localError) {
          console.error('[useScheduleBoard] localStorage fallback failed:', localError);
          setRoles(getDefaultRoles());
        }

        isInitialized.current = true;
      } finally {
        setIsLoading(false);
      }
    }

    loadScheduleData();
  }, [licenseKey, storageKey]);

  // Save to localStorage as backup (for offline support)
  useEffect(() => {
    if (!isInitialized.current || roles.length === 0) return;

    try {
      const state: ScheduleState = {
        roles,
        volunteers,
        classAssignments,
        generalAssignments,
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error('[useScheduleBoard] Failed to save to localStorage:', error);
    }
  }, [roles, volunteers, classAssignments, generalAssignments, storageKey]);

  // Fetch class data from Supabase
  useEffect(() => {
    async function fetchClasses() {
      if (!licenseKey) {
        setIsLoading(false);
        return;
      }

      try {
        // First get the show ID from license_key
        const { data: showData, error: showError } = await supabase
          .from('shows')
          .select('id')
          .eq('license_key', licenseKey)
          .single();

        if (showError || !showData) {
          console.error('[useScheduleBoard] Failed to find show:', showError);
          setClasses([]);
          return;
        }

        // Get trials for this show
        const { data: trials, error: trialsError } = await supabase
          .from('trials')
          .select('id')
          .eq('show_id', showData.id);

        if (trialsError) throw trialsError;

        if (!trials || trials.length === 0) {
          setClasses([]);
          return;
        }

        const trialIds = trials.map(t => t.id);

        // Fetch classes for all trials with trial info
        const { data: classesData, error: classesError } = await supabase
          .from('classes')
          .select(`
            id, element, level, section, judge_name, planned_start_time, class_status, class_order,
            trials!inner(trial_date, trial_number)
          `)
          .in('trial_id', trialIds)
          .order('class_order', { ascending: true });

        if (classesError) throw classesError;

        // Get entry counts for each class
        const classesWithCounts: ClassInfo[] = await Promise.all(
          (classesData || []).map(async (cls) => {
            const { count } = await supabase
              .from('entries')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', cls.id);

            const trialInfo = cls.trials as unknown as { trial_date: string; trial_number: number } | null;

            return {
              id: cls.id,
              element: cls.element,
              level: cls.level,
              section: cls.section,
              judge_name: cls.judge_name,
              planned_start_time: cls.planned_start_time,
              entry_count: count || 0,
              class_status: cls.class_status,
              trial_date: trialInfo?.trial_date,
              trial_number: trialInfo?.trial_number,
            };
          })
        );

        setClasses(classesWithCounts);
      } catch (error) {
        console.error('[useScheduleBoard] Failed to fetch classes:', error);
        setClasses([]);
      }
    }

    fetchClasses();
  }, [licenseKey]);

  // Volunteer management
  const addVolunteer = useCallback(async (data: Omit<Volunteer, 'id'>) => {
    if (!licenseKey) return;

    const newVolunteer: Volunteer = {
      ...data,
      id: generateId(),
    };

    // Optimistic update
    setVolunteers(prev => [...prev, newVolunteer]);

    // Sync to Supabase
    withSyncTracking(async () => {
      try {
        const { error } = await supabase.from('volunteers').insert({
          id: newVolunteer.id,
          license_key: licenseKey,
          name: newVolunteer.name,
          phone: newVolunteer.phone || null,
          is_exhibitor: newVolunteer.isExhibitor,
          exhibitor_id: newVolunteer.exhibitorId || null,
          entered_class_ids: newVolunteer.enteredClassIds || [],
          notes: newVolunteer.notes || null,
        });

        if (error) throw error;
      } catch (error) {
        console.error('[useScheduleBoard] Failed to add volunteer to Supabase:', error);
        // Keep the optimistic update - localStorage backup ensures persistence
      }
    });
  }, [licenseKey, withSyncTracking]);

  const updateVolunteer = useCallback(async (id: string, updates: Partial<Volunteer>) => {
    if (!licenseKey) return;

    // Optimistic update
    setVolunteers(prev =>
      prev.map(v => (v.id === id ? { ...v, ...updates } : v))
    );

    // Sync to Supabase
    withSyncTracking(async () => {
      try {
        const dbUpdates: Partial<DbVolunteer> = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone || null;
        if (updates.isExhibitor !== undefined) dbUpdates.is_exhibitor = updates.isExhibitor;
        if (updates.exhibitorId !== undefined) dbUpdates.exhibitor_id = updates.exhibitorId || null;
        if (updates.enteredClassIds !== undefined) dbUpdates.entered_class_ids = updates.enteredClassIds;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;

        const { error } = await supabase
          .from('volunteers')
          .update(dbUpdates)
          .eq('id', id)
          .eq('license_key', licenseKey);

        if (error) throw error;
      } catch (error) {
        console.error('[useScheduleBoard] Failed to update volunteer in Supabase:', error);
      }
    });
  }, [licenseKey, withSyncTracking]);

  const deleteVolunteer = useCallback(async (id: string) => {
    if (!licenseKey) return;

    // Optimistic update
    setVolunteers(prev => prev.filter(v => v.id !== id));
    setClassAssignments(prev =>
      prev.map(a => ({
        ...a,
        volunteerIds: a.volunteerIds.filter(vid => vid !== id),
      })).filter(a => a.volunteerIds.length > 0)
    );
    setGeneralAssignments(prev =>
      prev.map(a => ({
        ...a,
        volunteerIds: a.volunteerIds.filter(vid => vid !== id),
      })).filter(a => a.volunteerIds.length > 0)
    );

    // Sync to Supabase (CASCADE will handle assignments)
    withSyncTracking(async () => {
      try {
        const { error } = await supabase
          .from('volunteers')
          .delete()
          .eq('id', id)
          .eq('license_key', licenseKey);

        if (error) throw error;
      } catch (error) {
        console.error('[useScheduleBoard] Failed to delete volunteer from Supabase:', error);
      }
    });
  }, [licenseKey, withSyncTracking]);

  // Class assignment management
  const assignToClass = useCallback(async (volunteerId: string, classId: number, roleId: string) => {
    if (!licenseKey) return;

    // Optimistic update
    setClassAssignments(prev => {
      const existing = prev.find(a => a.classId === classId && a.roleId === roleId);

      if (existing) {
        if (existing.volunteerIds.includes(volunteerId)) {
          return prev;
        }
        return prev.map(a =>
          a.id === existing.id
            ? { ...a, volunteerIds: [...a.volunteerIds, volunteerId] }
            : a
        );
      }

      const newAssignment: ClassAssignment = {
        id: generateId(),
        classId,
        roleId,
        volunteerIds: [volunteerId],
      };
      return [...prev, newAssignment];
    });

    // Sync to Supabase
    withSyncTracking(async () => {
      try {
        const { error } = await supabase.from('volunteer_class_assignments').insert({
          id: generateId(),
          license_key: licenseKey,
          class_id: classId,
          role_id: roleId,
          volunteer_id: volunteerId,
        });

        if (error && !error.message.includes('duplicate')) throw error;
      } catch (error) {
        console.error('[useScheduleBoard] Failed to assign to class in Supabase:', error);
      }
    });
  }, [licenseKey, withSyncTracking]);

  const removeFromClass = useCallback(async (volunteerId: string, classId: number, roleId: string) => {
    if (!licenseKey) return;

    // Optimistic update
    setClassAssignments(prev =>
      prev.map(a => {
        if (a.classId === classId && a.roleId === roleId) {
          return {
            ...a,
            volunteerIds: a.volunteerIds.filter(id => id !== volunteerId),
          };
        }
        return a;
      }).filter(a => a.volunteerIds.length > 0)
    );

    // Sync to Supabase
    withSyncTracking(async () => {
      try {
        const { error } = await supabase
          .from('volunteer_class_assignments')
          .delete()
          .eq('license_key', licenseKey)
          .eq('class_id', classId)
          .eq('role_id', roleId)
          .eq('volunteer_id', volunteerId);

        if (error) throw error;
      } catch (error) {
        console.error('[useScheduleBoard] Failed to remove class assignment from Supabase:', error);
      }
    });
  }, [licenseKey, withSyncTracking]);

  // General duty management
  const assignToGeneralDuty = useCallback(async (volunteerId: string, roleId: string) => {
    if (!licenseKey) return;

    // Optimistic update
    setGeneralAssignments(prev => {
      const existing = prev.find(a => a.roleId === roleId);

      if (existing) {
        if (existing.volunteerIds.includes(volunteerId)) {
          return prev;
        }
        return prev.map(a =>
          a.id === existing.id
            ? { ...a, volunteerIds: [...a.volunteerIds, volunteerId] }
            : a
        );
      }

      const newAssignment: GeneralAssignment = {
        id: generateId(),
        roleId,
        volunteerIds: [volunteerId],
      };
      return [...prev, newAssignment];
    });

    // Sync to Supabase
    withSyncTracking(async () => {
      try {
        const { error } = await supabase.from('volunteer_general_assignments').insert({
          id: generateId(),
          license_key: licenseKey,
          role_id: roleId,
          volunteer_id: volunteerId,
        });

        if (error && !error.message.includes('duplicate')) throw error;
      } catch (error) {
        console.error('[useScheduleBoard] Failed to assign to general duty in Supabase:', error);
      }
    });
  }, [licenseKey, withSyncTracking]);

  const removeFromGeneralDuty = useCallback(async (volunteerId: string, roleId: string) => {
    if (!licenseKey) return;

    // Optimistic update
    setGeneralAssignments(prev =>
      prev.map(a => {
        if (a.roleId === roleId) {
          return {
            ...a,
            volunteerIds: a.volunteerIds.filter(id => id !== volunteerId),
          };
        }
        return a;
      }).filter(a => a.volunteerIds.length > 0)
    );

    // Sync to Supabase
    withSyncTracking(async () => {
      try {
        const { error } = await supabase
          .from('volunteer_general_assignments')
          .delete()
          .eq('license_key', licenseKey)
          .eq('role_id', roleId)
          .eq('volunteer_id', volunteerId);

        if (error) throw error;
      } catch (error) {
        console.error('[useScheduleBoard] Failed to remove general assignment from Supabase:', error);
      }
    });
  }, [licenseKey, withSyncTracking]);

  // Role management
  const updateRoles = useCallback(async (newRoles: ScheduleRole[]) => {
    if (!licenseKey) return;

    const oldRoles = roles;
    setRoles(newRoles);

    // Sync to Supabase - delete all and re-insert
    withSyncTracking(async () => {
      try {
        await supabase
          .from('volunteer_roles')
          .delete()
          .eq('license_key', licenseKey);

        if (newRoles.length > 0) {
          const { error } = await supabase.from('volunteer_roles').insert(
            newRoles.map((role, index) => ({
              id: role.id,
              license_key: licenseKey,
              name: role.name,
              color: role.color,
              is_ring_role: role.isRingRole,
              is_active: role.isActive,
              sort_order: index,
            }))
          );

          if (error) throw error;
        }
      } catch (error) {
        console.error('[useScheduleBoard] Failed to update roles in Supabase:', error);
        // Revert on failure
        setRoles(oldRoles);
      }
    });
  }, [licenseKey, roles, withSyncTracking]);

  return {
    classes,
    roles,
    volunteers,
    classAssignments,
    generalAssignments,
    isLoading,
    isSyncing,
    addVolunteer,
    updateVolunteer,
    deleteVolunteer,
    assignToClass,
    removeFromClass,
    assignToGeneralDuty,
    removeFromGeneralDuty,
    updateRoles,
  };
}

function getDefaultRoles(): ScheduleRole[] {
  return [
    { id: 'gate-steward', name: 'Gate Steward', color: '#3b82f6', isRingRole: true, isActive: true },
    { id: 'timer', name: 'Timer', color: '#10b981', isRingRole: true, isActive: true },
    { id: 'ring-steward', name: 'Ring Steward', color: '#8b5cf6', isRingRole: true, isActive: true },
    { id: 'hospitality', name: 'Hospitality', color: '#f59e0b', isRingRole: false, isActive: true },
    { id: 'equipment', name: 'Equipment/Supplies', color: '#ef4444', isRingRole: false, isActive: true },
    { id: 'ring-setup', name: 'Ring Setup', color: '#06b6d4', isRingRole: false, isActive: true },
    { id: 'ribbons', name: 'Ribbons', color: '#ec4899', isRingRole: false, isActive: true },
  ];
}

// Migrate localStorage data to Supabase
async function migrateToSupabase(
  licenseKey: string,
  roles: ScheduleRole[],
  volunteers: Volunteer[],
  classAssignments: ClassAssignment[],
  generalAssignments: GeneralAssignment[]
): Promise<void> {
  // Insert roles
  if (roles.length > 0) {
    const { error: rolesError } = await supabase.from('volunteer_roles').insert(
      roles.map((role, index) => ({
        id: role.id,
        license_key: licenseKey,
        name: role.name,
        color: role.color,
        is_ring_role: role.isRingRole,
        is_active: role.isActive,
        sort_order: index,
      }))
    );
    if (rolesError) console.error('[migrateToSupabase] Roles error:', rolesError);
  }

  // Insert volunteers
  if (volunteers.length > 0) {
    const { error: volunteersError } = await supabase.from('volunteers').insert(
      volunteers.map(v => ({
        id: v.id,
        license_key: licenseKey,
        name: v.name,
        phone: v.phone || null,
        is_exhibitor: v.isExhibitor,
        exhibitor_id: v.exhibitorId || null,
        entered_class_ids: v.enteredClassIds || [],
        notes: v.notes || null,
      }))
    );
    if (volunteersError) console.error('[migrateToSupabase] Volunteers error:', volunteersError);
  }

  // Insert class assignments (one row per volunteer)
  const classAssignmentRows = classAssignments.flatMap(a =>
    a.volunteerIds.map(volunteerId => ({
      id: generateId(),
      license_key: licenseKey,
      class_id: a.classId,
      role_id: a.roleId,
      volunteer_id: volunteerId,
    }))
  );

  if (classAssignmentRows.length > 0) {
    const { error: classError } = await supabase
      .from('volunteer_class_assignments')
      .insert(classAssignmentRows);
    if (classError) console.error('[migrateToSupabase] Class assignments error:', classError);
  }

  // Insert general assignments (one row per volunteer)
  const generalAssignmentRows = generalAssignments.flatMap(a =>
    a.volunteerIds.map(volunteerId => ({
      id: generateId(),
      license_key: licenseKey,
      role_id: a.roleId,
      volunteer_id: volunteerId,
      description: a.description || null,
      time_range: a.timeRange || null,
    }))
  );

  if (generalAssignmentRows.length > 0) {
    const { error: generalError } = await supabase
      .from('volunteer_general_assignments')
      .insert(generalAssignmentRows);
    if (generalError) console.error('[migrateToSupabase] General assignments error:', generalError);
  }
}
