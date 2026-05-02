// Authoritative data access module for the Activity Log entity.
// All callers import from here — never from supabaseClient directly.

export type { ActivityRecordType, ActivityLogEntry, ActivityLogInsert } from './reads';
export { getActivityForRecord, logActivity } from './reads';
