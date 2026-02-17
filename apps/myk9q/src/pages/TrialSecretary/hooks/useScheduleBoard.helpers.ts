/**
 * Schedule Board Hook - Helper Functions
 *
 * Pure functions for ID generation, DB-to-app type conversion,
 * assignment grouping, default roles, and localStorage-to-Supabase migration.
 */

import { supabase } from '../../../lib/supabase';
import { logger } from '@/utils/logger';
import type {
  ScheduleRole,
  Volunteer,
  ClassAssignment,
  GeneralAssignment,
  ClassInfo,
} from '../types';
import type {
  DbVolunteerRole,
  DbVolunteer,
  DbClassAssignment,
  DbGeneralAssignment,
  LegacyGeneralAssignment,
  LoadScheduleResult,
} from './useScheduleBoard.types';

export const STORAGE_KEY_PREFIX = 'myK9Q-schedule-';

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Convert DB rows to app types
export function dbRoleToApp(row: DbVolunteerRole): ScheduleRole {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isRingRole: row.is_ring_role,
    isActive: row.is_active,
  };
}

export function dbVolunteerToApp(row: DbVolunteer): Volunteer {
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
export function groupClassAssignments(rows: DbClassAssignment[]): ClassAssignment[] {
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
export function groupGeneralAssignments(rows: DbGeneralAssignment[]): GeneralAssignment[] {
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

export function getDefaultRoles(): ScheduleRole[] {
  return [
    {
      id: 'gate-steward',
      name: 'Gate Steward',
      color: '#3b82f6',
      isRingRole: true,
      isActive: true,
    },
    { id: 'timer', name: 'Timer', color: '#10b981', isRingRole: true, isActive: true },
    {
      id: 'ring-steward',
      name: 'Ring Steward',
      color: '#8b5cf6',
      isRingRole: true,
      isActive: true,
    },
    { id: 'hospitality', name: 'Hospitality', color: '#f59e0b', isRingRole: false, isActive: true },
    {
      id: 'equipment',
      name: 'Equipment/Supplies',
      color: '#ef4444',
      isRingRole: false,
      isActive: true,
    },
    { id: 'ring-setup', name: 'Ring Setup', color: '#06b6d4', isRingRole: false, isActive: true },
    { id: 'ribbons', name: 'Ribbons', color: '#ec4899', isRingRole: false, isActive: true },
  ];
}

// Migrate localStorage data to Supabase
export async function migrateToSupabase(
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
    if (rolesError) logger.error('[migrateToSupabase] Roles error:', rolesError);
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
    if (volunteersError) logger.error('[migrateToSupabase] Volunteers error:', volunteersError);
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
    if (classError) logger.error('[migrateToSupabase] Class assignments error:', classError);
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
    if (generalError) logger.error('[migrateToSupabase] General assignments error:', generalError);
  }
}

// Fetch class data with entry counts for a given license key
export async function fetchClassesForLicenseKey(licenseKey: string): Promise<ClassInfo[]> {
  // First get the show ID from license_key
  const { data: showData, error: showError } = await supabase
    .from('shows')
    .select('id')
    .eq('license_key', licenseKey)
    .single();

  if (showError || !showData) {
    logger.error('[useScheduleBoard] Failed to find show:', showError);
    return [];
  }

  // Get trials for this show
  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('id')
    .eq('show_id', showData.id);

  if (trialsError) throw trialsError;

  if (!trials || trials.length === 0) {
    return [];
  }

  const trialIds = trials.map(t => t.id);

  // Fetch classes for all trials with trial info
  const { data: classesData, error: classesError } = await supabase
    .from('classes')
    .select(
      `
      id, element, level, section, judge_name, planned_start_time, class_status, class_order,
      trials!inner(trial_date, trial_number)
    `
    )
    .in('trial_id', trialIds)
    .order('class_order', { ascending: true });

  if (classesError) throw classesError;

  // Get entry counts for each class
  const classesWithCounts: ClassInfo[] = await Promise.all(
    (classesData || []).map(async cls => {
      const { count } = await supabase
        .from('entries')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', cls.id);

      const trialInfo = cls.trials as unknown as {
        trial_date: string;
        trial_number: number;
      } | null;

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

  return classesWithCounts;
}

// Build Supabase-compatible update object from Volunteer partial updates
export function buildVolunteerDbUpdates(updates: Partial<Volunteer>): Partial<DbVolunteer> {
  const dbUpdates: Partial<DbVolunteer> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone || null;
  if (updates.isExhibitor !== undefined) dbUpdates.is_exhibitor = updates.isExhibitor;
  if (updates.exhibitorId !== undefined) dbUpdates.exhibitor_id = updates.exhibitorId || null;
  if (updates.enteredClassIds !== undefined) dbUpdates.entered_class_ids = updates.enteredClassIds;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
  return dbUpdates;
}

// Load schedule data from Supabase, falling back to localStorage
export async function loadScheduleFromSupabase(
  licenseKey: string,
  storageKey: string
): Promise<LoadScheduleResult> {
  const [rolesResult, volunteersResult, classAssignResult, generalAssignResult] = await Promise.all(
    [
      supabase.from('volunteer_roles').select('*').eq('license_key', licenseKey),
      supabase.from('volunteers').select('*').eq('license_key', licenseKey),
      supabase.from('volunteer_class_assignments').select('*').eq('license_key', licenseKey),
      supabase.from('volunteer_general_assignments').select('*').eq('license_key', licenseKey),
    ]
  );

  const hasSupabaseData =
    (rolesResult.data && rolesResult.data.length > 0) ||
    (volunteersResult.data && volunteersResult.data.length > 0);

  if (hasSupabaseData) {
    return {
      roles: rolesResult.data?.map(dbRoleToApp) || getDefaultRoles(),
      volunteers: volunteersResult.data?.map(dbVolunteerToApp) || [],
      classAssignments: groupClassAssignments(classAssignResult.data || []),
      generalAssignments: groupGeneralAssignments(generalAssignResult.data || []),
      needsMigration: false,
    };
  }

  // Check localStorage for existing data to migrate
  return loadScheduleFromLocalStorage(storageKey);
}

// Parse schedule data from localStorage (with legacy format migration)
export function loadScheduleFromLocalStorage(storageKey: string): LoadScheduleResult {
  const stored = localStorage.getItem(storageKey);
  if (!stored) {
    return {
      roles: getDefaultRoles(),
      volunteers: [],
      classAssignments: [],
      generalAssignments: [],
      needsMigration: false,
    };
  }

  const state = JSON.parse(stored);
  const roles = state.roles || getDefaultRoles();
  const volunteers = state.volunteers || [];
  const classAssignments = state.classAssignments || [];

  // Migrate old generalAssignments format
  const generalAssignments = (state.generalAssignments || []).map((a: LegacyGeneralAssignment) => {
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

  return {
    roles,
    volunteers,
    classAssignments,
    generalAssignments,
    needsMigration: true,
  };
}
