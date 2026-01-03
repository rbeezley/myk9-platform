/**
 * Trial Secretary Tools - Type Definitions
 *
 * Data structures for Kanban board and Steward scheduling.
 * Designed for localStorage persistence with Supabase-ready structure.
 */

// ============================================
// KANBAN TYPES
// ============================================

export type KanbanStatus = 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
  status: KanbanStatus;
  priority?: TaskPriority;
  dueDate?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanState {
  tasks: KanbanTask[];
  lastModified: string;
}

// ============================================
// SCHEDULE TYPES
// ============================================

export interface ScheduleRole {
  id: string;
  name: string;           // "Gate Steward", "Timer", "Ring Steward"
  color: string;          // For visual distinction
  isRingRole: boolean;    // true = per-class, false = general duty
  isActive: boolean;
}

export interface Volunteer {
  id: string;
  name: string;
  phone?: string;
  isExhibitor: boolean;   // True if linked to exhibitor
  exhibitorId?: number;   // Link to entries table
  enteredClassIds: number[]; // Classes they're entered in (for conflict detection)
  notes?: string;         // Availability notes
}

// Per-class assignment (Gate Steward, Timer, Ring Steward)
export interface ClassAssignment {
  id: string;
  classId: number;        // Links to existing class data
  roleId: string;
  volunteerIds: string[]; // Array allows 2 people to split a class
}

// General duty assignment (Hospitality, Equipment, etc.)
// Now supports multiple volunteers per role, similar to ClassAssignment
export interface GeneralAssignment {
  id: string;
  roleId: string;
  volunteerIds: string[]; // Array allows multiple people per role
  description?: string;   // Optional: "Morning shift", "Setup before Trial 2", etc.
  timeRange?: string;     // Optional: "8:00 AM - 12:00 PM"
}

export interface ScheduleState {
  roles: ScheduleRole[];
  volunteers: Volunteer[];
  classAssignments: ClassAssignment[];
  generalAssignments: GeneralAssignment[];
  lastModified: string;
}

// ============================================
// CLASS DATA (from existing system)
// ============================================

export interface ClassInfo {
  id: number;
  element: string;         // e.g., "Standard", "JWW"
  level: string;           // e.g., "Novice", "Open", "Excellent"
  section?: string;        // e.g., "A", "B"
  judge_name: string;
  planned_start_time?: string;
  entry_count: number;
  class_status: string;
  trial_date?: string;     // e.g., "2023-09-16"
  trial_number?: number;   // e.g., 1, 2
}

// ============================================
// DEFAULT VALUES
// ============================================

export const DEFAULT_RING_ROLES: ScheduleRole[] = [
  { id: 'gate-steward', name: 'Gate Steward', color: '#3b82f6', isRingRole: true, isActive: true },
  { id: 'timer', name: 'Timer', color: '#10b981', isRingRole: true, isActive: true },
  { id: 'ring-steward', name: 'Ring Steward', color: '#8b5cf6', isRingRole: true, isActive: true },
];

export const DEFAULT_GENERAL_ROLES: ScheduleRole[] = [
  { id: 'hospitality', name: 'Hospitality', color: '#f59e0b', isRingRole: false, isActive: true },
  { id: 'equipment', name: 'Equipment', color: '#ef4444', isRingRole: false, isActive: true },
  { id: 'ring-setup', name: 'Ring Setup', color: '#06b6d4', isRingRole: false, isActive: true },
];

export const INITIAL_KANBAN_STATE: KanbanState = {
  tasks: [],
  lastModified: new Date().toISOString(),
};

export const INITIAL_SCHEDULE_STATE: ScheduleState = {
  roles: [...DEFAULT_RING_ROLES, ...DEFAULT_GENERAL_ROLES],
  volunteers: [],
  classAssignments: [],
  generalAssignments: [],
  lastModified: new Date().toISOString(),
};
