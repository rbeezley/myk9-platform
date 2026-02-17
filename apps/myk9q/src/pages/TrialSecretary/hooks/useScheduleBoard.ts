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
import { logger } from '@/utils/logger';
import type {
  ScheduleRole,
  Volunteer,
  ClassAssignment,
  GeneralAssignment,
  ScheduleState,
  ClassInfo,
} from '../types';
import {
  STORAGE_KEY_PREFIX,
  generateId,
  getDefaultRoles,
  migrateToSupabase,
  fetchClassesForLicenseKey,
  buildVolunteerDbUpdates,
  loadScheduleFromSupabase,
  loadScheduleFromLocalStorage,
} from './useScheduleBoard.helpers';

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
  const withSyncTracking = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      setSyncingCount(c => c + 1);
      try {
        return await operation();
      } finally {
        setSyncingCount(c => c - 1);
      }
    },
    []
  );

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
    if (!licenseKey) {
      setIsLoading(false);
      return;
    }

    const key = licenseKey; // Capture narrowed type for nested function

    async function loadScheduleData() {
      try {
        setIsLoading(true);

        const result = await loadScheduleFromSupabase(key, storageKey);
        setRoles(result.roles);
        setVolunteers(result.volunteers);
        setClassAssignments(result.classAssignments);
        setGeneralAssignments(result.generalAssignments);

        // If data came from localStorage, migrate to Supabase in background
        if (result.needsMigration) {
          isMigrating.current = true;
          setSyncingCount(c => c + 1);
          migrateToSupabase(
            key,
            result.roles,
            result.volunteers,
            result.classAssignments,
            result.generalAssignments
          )
            .then(() => {
              isMigrating.current = false;
              setSyncingCount(c => c - 1);
            })
            .catch(err => {
              logger.error('[useScheduleBoard] Migration failed:', err);
              isMigrating.current = false;
              setSyncingCount(c => c - 1);
            });
        }

        isInitialized.current = true;
      } catch (error) {
        logger.error('[useScheduleBoard] Failed to load from Supabase, using localStorage:', error);

        // Fall back to localStorage
        try {
          const fallback = loadScheduleFromLocalStorage(storageKey);
          setRoles(fallback.roles);
          setVolunteers(fallback.volunteers);
          setClassAssignments(fallback.classAssignments);
          setGeneralAssignments(fallback.generalAssignments);
        } catch (localError) {
          logger.error('[useScheduleBoard] localStorage fallback failed:', localError);
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
      logger.error('[useScheduleBoard] Failed to save to localStorage:', error);
    }
  }, [roles, volunteers, classAssignments, generalAssignments, storageKey]);

  // Fetch class data from Supabase
  useEffect(() => {
    if (!licenseKey) {
      setIsLoading(false);
      return;
    }

    fetchClassesForLicenseKey(licenseKey)
      .then(setClasses)
      .catch(error => {
        logger.error('[useScheduleBoard] Failed to fetch classes:', error);
        setClasses([]);
      });
  }, [licenseKey]);

  // Volunteer management
  const addVolunteer = useCallback(
    async (data: Omit<Volunteer, 'id'>) => {
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
          logger.error('[useScheduleBoard] Failed to add volunteer to Supabase:', error);
          // Keep the optimistic update - localStorage backup ensures persistence
        }
      });
    },
    [licenseKey, withSyncTracking]
  );

  const updateVolunteer = useCallback(
    async (id: string, updates: Partial<Volunteer>) => {
      if (!licenseKey) return;

      // Optimistic update
      setVolunteers(prev => prev.map(v => (v.id === id ? { ...v, ...updates } : v)));

      // Sync to Supabase
      withSyncTracking(async () => {
        try {
          const dbUpdates = buildVolunteerDbUpdates(updates);

          const { error } = await supabase
            .from('volunteers')
            .update(dbUpdates)
            .eq('id', id)
            .eq('license_key', licenseKey);

          if (error) throw error;
        } catch (error) {
          logger.error('[useScheduleBoard] Failed to update volunteer in Supabase:', error);
        }
      });
    },
    [licenseKey, withSyncTracking]
  );

  const deleteVolunteer = useCallback(
    async (id: string) => {
      if (!licenseKey) return;

      // Optimistic update
      setVolunteers(prev => prev.filter(v => v.id !== id));
      setClassAssignments(prev =>
        prev
          .map(a => ({
            ...a,
            volunteerIds: a.volunteerIds.filter(vid => vid !== id),
          }))
          .filter(a => a.volunteerIds.length > 0)
      );
      setGeneralAssignments(prev =>
        prev
          .map(a => ({
            ...a,
            volunteerIds: a.volunteerIds.filter(vid => vid !== id),
          }))
          .filter(a => a.volunteerIds.length > 0)
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
          logger.error('[useScheduleBoard] Failed to delete volunteer from Supabase:', error);
        }
      });
    },
    [licenseKey, withSyncTracking]
  );

  // Class assignment management
  const assignToClass = useCallback(
    async (volunteerId: string, classId: number, roleId: string) => {
      if (!licenseKey) return;

      // Optimistic update
      setClassAssignments(prev => {
        const existing = prev.find(a => a.classId === classId && a.roleId === roleId);

        if (existing) {
          if (existing.volunteerIds.includes(volunteerId)) {
            return prev;
          }
          return prev.map(a =>
            a.id === existing.id ? { ...a, volunteerIds: [...a.volunteerIds, volunteerId] } : a
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
          logger.error('[useScheduleBoard] Failed to assign to class in Supabase:', error);
        }
      });
    },
    [licenseKey, withSyncTracking]
  );

  const removeFromClass = useCallback(
    async (volunteerId: string, classId: number, roleId: string) => {
      if (!licenseKey) return;

      // Optimistic update
      setClassAssignments(prev =>
        prev
          .map(a => {
            if (a.classId === classId && a.roleId === roleId) {
              return {
                ...a,
                volunteerIds: a.volunteerIds.filter(id => id !== volunteerId),
              };
            }
            return a;
          })
          .filter(a => a.volunteerIds.length > 0)
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
          logger.error(
            '[useScheduleBoard] Failed to remove class assignment from Supabase:',
            error
          );
        }
      });
    },
    [licenseKey, withSyncTracking]
  );

  // General duty management
  const assignToGeneralDuty = useCallback(
    async (volunteerId: string, roleId: string) => {
      if (!licenseKey) return;

      // Optimistic update
      setGeneralAssignments(prev => {
        const existing = prev.find(a => a.roleId === roleId);

        if (existing) {
          if (existing.volunteerIds.includes(volunteerId)) {
            return prev;
          }
          return prev.map(a =>
            a.id === existing.id ? { ...a, volunteerIds: [...a.volunteerIds, volunteerId] } : a
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
          logger.error('[useScheduleBoard] Failed to assign to general duty in Supabase:', error);
        }
      });
    },
    [licenseKey, withSyncTracking]
  );

  const removeFromGeneralDuty = useCallback(
    async (volunteerId: string, roleId: string) => {
      if (!licenseKey) return;

      // Optimistic update
      setGeneralAssignments(prev =>
        prev
          .map(a => {
            if (a.roleId === roleId) {
              return {
                ...a,
                volunteerIds: a.volunteerIds.filter(id => id !== volunteerId),
              };
            }
            return a;
          })
          .filter(a => a.volunteerIds.length > 0)
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
          logger.error(
            '[useScheduleBoard] Failed to remove general assignment from Supabase:',
            error
          );
        }
      });
    },
    [licenseKey, withSyncTracking]
  );

  // Role management
  const updateRoles = useCallback(
    async (newRoles: ScheduleRole[]) => {
      if (!licenseKey) return;

      const oldRoles = roles;
      setRoles(newRoles);

      // Sync to Supabase - delete all and re-insert
      withSyncTracking(async () => {
        try {
          await supabase.from('volunteer_roles').delete().eq('license_key', licenseKey);

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
          logger.error('[useScheduleBoard] Failed to update roles in Supabase:', error);
          // Revert on failure
          setRoles(oldRoles);
        }
      });
    },
    [licenseKey, roles, withSyncTracking]
  );

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
