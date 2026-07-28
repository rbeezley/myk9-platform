export type PolicyCommand = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
export type PolicyRoleClass = 'publicOnly' | 'authenticated' | 'otherPublic';

export const identityMigration = '20260728130000_consolidate_identity_registration_rls.sql';
export const showdayMigration = '20260728131000_split_showday_manage_read_rls.sql';
export const catalogMigration = '20260728132000_split_catalog_volunteer_manage_read_rls.sql';
export const operationsMigration = '20260728133000_split_queue_payment_sync_manage_read_rls.sql';
export const availabilityMigration = '20260728134000_consolidate_judge_availability_rls.sql';

export const migrationNames = [
  identityMigration,
  showdayMigration,
  catalogMigration,
  operationsMigration,
  availabilityMigration,
];

export const policyRoleClasses: PolicyRoleClass[] = ['publicOnly', 'authenticated', 'otherPublic'];
export const policyCommands: Exclude<PolicyCommand, 'ALL'>[] = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
];

export const intentionalPolicyOverlaps = new Set([
  'dogs|authenticated|INSERT',
  'push_subscriptions|authenticated|SELECT',
  'push_subscriptions|authenticated|INSERT',
  'push_subscriptions|authenticated|UPDATE',
  'push_subscriptions|authenticated|DELETE',
]);

export const expectedPolicyTables = [
  'dogs',
  'enrollments',
  'exhibitor_profiles',
  'judge_assignments',
  'judge_availability',
  'notification_queue',
  'offline_scoring',
  'people',
  'push_notification_queue',
  'push_subscriptions',
  'role_requests',
  'sport_class_rules',
  'sport_templates',
  'sport_titles',
  'stripe_customers',
  'stripe_orders',
  'stripe_subscriptions',
  'sync_conflicts',
  'vaccinations',
  'volunteer_class_assignments',
  'volunteer_general_assignments',
  'volunteer_roles',
  'volunteers',
];
