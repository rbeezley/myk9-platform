// Authoritative data access module for the Activity Log entity.
// All callers import from here — never from supabaseClient directly.

export type { ActivityRecordType, ActivityLogEntry, ActivityLogInsert } from '../queries/activityLogQueries';
export { getActivityForRecord, logActivity } from '../queries/activityLogQueries';
