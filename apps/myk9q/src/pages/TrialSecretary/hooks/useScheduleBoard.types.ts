/**
 * Schedule Board Hook - Type Definitions
 *
 * Database row types (snake_case from Supabase) and legacy migration types.
 */

// Database row types (snake_case from Supabase)
export interface DbVolunteerRole {
  id: string;
  license_key: string;
  name: string;
  color: string;
  is_ring_role: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface DbVolunteer {
  id: string;
  license_key: string;
  name: string;
  phone: string | null;
  is_exhibitor: boolean;
  exhibitor_id: number | null;
  entered_class_ids: number[];
  notes: string | null;
}

export interface DbClassAssignment {
  id: string;
  license_key: string;
  class_id: number;
  role_id: string;
  volunteer_id: string;
}

export interface DbGeneralAssignment {
  id: string;
  license_key: string;
  role_id: string;
  volunteer_id: string;
  description: string | null;
  time_range: string | null;
}

// Legacy localStorage format for migration
export interface LegacyGeneralAssignment {
  id: string;
  roleId: string;
  volunteerId?: string;
  volunteerIds?: string[];
  description?: string;
  timeRange?: string;
}

// Result from loading schedule data (Supabase or localStorage)
export interface LoadScheduleResult {
  roles: import('../types').ScheduleRole[];
  volunteers: import('../types').Volunteer[];
  classAssignments: import('../types').ClassAssignment[];
  generalAssignments: import('../types').GeneralAssignment[];
  needsMigration: boolean;
}
