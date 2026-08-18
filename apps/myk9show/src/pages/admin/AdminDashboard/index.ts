/**
 * AdminDashboard module.
 *
 * Three exports were deleted with the 2026-08 overview rebuild:
 * PlatformAdministrationSection duplicated the left sidebar verbatim and pushed
 * the actual statistics below the fold; PlatformStatisticsSection showed totals
 * the page no longer leads with; and useAdminDashboardData fetched every user,
 * show and dog across the wire to call `.length` on them. Counts now come from
 * `@/features/admin-overview`, which asks Postgres to count.
 */

export { PlatformHealthSummary } from './PlatformHealthSummary';
export { NeedsALookSection } from './NeedsALookSection';
