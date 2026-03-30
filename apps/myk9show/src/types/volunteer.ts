/** Ring roles assigned per-class */
export const RING_ROLES = ['Gate Steward', 'Timer', 'Ring Steward'] as const;

/** General duties assigned per-show */
export const GENERAL_DUTY_ROLES = ['Hospitality', 'Equipment', 'Ring Setup', 'Ribbons'] as const;

/** All volunteer roles (ring + general) */
export const ALL_VOLUNTEER_ROLES = [...RING_ROLES, ...GENERAL_DUTY_ROLES] as const;

export type RingRole = (typeof RING_ROLES)[number];
export type GeneralDutyRole = (typeof GENERAL_DUTY_ROLES)[number];
export type VolunteerRoleName = (typeof ALL_VOLUNTEER_ROLES)[number];

/** A volunteer in the pool for a given show */
export interface Volunteer {
  id: string;
  personId: string | null;
  name: string;
  phone: string | null;
  notes: string | null;
  isAvailable: boolean;
  showId: string;
  createdAt: string;
  updatedAt: string;
}

/** A volunteer assigned to a ring role on a specific class */
export interface ClassAssignment {
  id: string;
  volunteerId: string;
  classId: string;
  roleName: string;
  status: string;
  notes: string | null;
  createdAt: string;
  /** Joined from volunteers table for display */
  volunteerName: string;
  /** Whether the volunteer is also entered in this class (conflict) */
  hasConflict?: boolean;
}

/** A volunteer assigned to a general duty for a show */
export interface GeneralAssignment {
  id: string;
  volunteerId: string;
  showId: string;
  roleName: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  /** Joined from volunteers table for display */
  volunteerName: string;
}

/** Minimal class info for volunteer scheduling display */
export interface ClassInfo {
  id: string;
  name: string;
  trialId: string;
  meta: string;
}

/**
 * Format a full name as "First L." for compact display.
 * "Sarah Miller" → "Sarah M."
 * "Sarah" → "Sarah"
 */
export function formatVolunteerDisplayName(fullName: string): string {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const lastName = parts[parts.length - 1];
  const firstParts = parts.slice(0, -1).join(' ');
  return `${firstParts} ${lastName[0]}.`;
}
